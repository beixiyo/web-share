// 本文件定义信令服务器 API 和 WebSocket 连接生命周期
package signaling

import (
	"context"
	"errors"
	"log"
	"net/http"
	"net/netip"
	"sync"
	"time"

	"github.com/beixiyo/web-share/packages/server-go/protocol"
	"github.com/coder/websocket"
)

const (
	defaultRoomID     = "default"
	maxMessageBytes   = 10 * 1024 * 1024
	cleanupPeriod     = 20 * time.Second
	rtcErrorWindow    = 5 * time.Second
	rtcErrorMaxCount  = 3
	writeTimeout      = 10 * time.Second
	sendQueueCapacity = 64
	maxQueuedBytes    = 16 * 1024 * 1024
)

// Options 配置房间、邀请、重连和保活时长
// 时长按传入值使用；HTTP/config 边界负责提供生产环境默认值
// DisconnectDelay 为零时会在下一个计时器周期断开连接，RoomEmptyGrace 为零时会立即移除邀请，
// InviteTTL 为非正数时表示邀请永不过期
type Options struct {
	ClearTime       time.Duration
	DisconnectDelay time.Duration
	RoomEmptyGrace  time.Duration
	InviteTTL       time.Duration
	DefaultRoomCode string
	// LANPrefixes nil 时启动时自动发现；非 nil 空切片禁用 LAN 分房
	LANPrefixes []netip.Prefix
}

// Server 提供 Web Share JSON WebSocket 信令协议服务
// 它可以直接作为 http.Handler 挂载，并在关闭服务时调用 Close
type Server struct {
	options Options // 创建后不可变，可并发读取

	// shared 中的状态由 shared.mu 保护；Locked 方法要求调用方已持锁
	shared serverSharedState

	// ctx 只控制服务级后台清理循环；每个 peer 另有独立的 writer context
	ctx    context.Context
	cancel context.CancelFunc
	// 两个 WaitGroup 分别等待服务后台任务和已接入的连接处理结束
	backgroundWG  sync.WaitGroup
	connectionsWG sync.WaitGroup
	closeOnce     sync.Once
}

// New 创建信令处理器。Options 应由调用方预先解析；
// 零时长保留文档所述含义，以支持确定性测试
func New(options Options) *Server {
	if options.LANPrefixes == nil {
		prefixes, err := DiscoverLANPrefixes()
		if err != nil {
			log.Printf("signaling: discover LAN prefixes failed: %v", err)
			prefixes = make([]netip.Prefix, 0)
		}
		options.LANPrefixes = prefixes
	}
	options.LANPrefixes = normalizeLANPrefixes(options.LANPrefixes)

	ctx, cancel := context.WithCancel(context.Background())
	s := &Server{
		options: options,
		shared: serverSharedState{
			rooms:             make(map[string]*peerRoom),
			connections:       make(map[*peer]struct{}),
			sessions:          make(map[string]*peer),
			disconnects:       make(map[*peer]*disconnectJob),
			emptyRoomCleanups: make(map[string]*roomCleanupJob),
			invites:           newInviteState(options),
			rtcErrors:         make(rtcErrorState),
		},
		ctx:    ctx,
		cancel: cancel,
	}

	// 先登记再启动，Close 才能可靠等待这个循环退出
	s.backgroundWG.Add(1)
	go s.runCleanupLoop()
	return s
}

// ServeHTTP 在请求路径上接收 WebSocket 连接
// 外层 HTTP 服务器负责决定将哪些请求路由到此处
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		return
	}
	conn.SetReadLimit(maxMessageBytes)
	p := newPeer(conn, r, s.options.LANPrefixes)

	if !s.registerConnection(p) {
		p.stopWriter()
		_ = conn.CloseNow()
		return
	}

	go s.writeMessages(p)

	defer func() {
		p.socketClosed.Store(true)
		s.scheduleDisconnect(p, false)
		// 在线成员关系必须先更新，不能等待背压 writer 或关闭握手结束
		p.stopWriter()
		<-p.writerDone
		s.shared.mu.Lock()
		delete(s.shared.connections, p)
		s.shared.mu.Unlock()
		s.connectionsWG.Done()
	}()

	s.readMessages(p)
}

// Close 停止后台计时器，并关闭 Server 接收的所有 WebSocket 连接
func (s *Server) Close() {
	s.closeOnce.Do(func() {
		s.shared.mu.Lock()
		s.shared.closed = true
		s.cancel()

		connections := make([]*peer, 0, len(s.shared.connections))
		for p := range s.shared.connections {
			p.stopWriter()
			connections = append(connections, p)
		}
		for p, job := range s.shared.disconnects {
			if job.timer != nil {
				job.timer.Stop()
			}
			delete(s.shared.disconnects, p)
		}

		for roomID, job := range s.shared.emptyRoomCleanups {
			if job.timer != nil {
				job.timer.Stop()
			}
			delete(s.shared.emptyRoomCleanups, roomID)
		}
		s.shared.mu.Unlock()

		for _, p := range connections {
			_ = p.ws.CloseNow()
		}
		s.backgroundWG.Wait()
		s.connectionsWG.Wait()
	})
}

func (s *Server) registerConnection(p *peer) bool {
	s.shared.mu.Lock()
	if s.shared.closed {
		s.shared.mu.Unlock()
		return false
	}
	s.connectionsWG.Add(1)
	s.shared.connections[p] = struct{}{}

	oldPeer := s.shared.sessions[p.shared.resumeToken]
	if oldPeer != nil {
		p.id = oldPeer.id
		p.shared.roomID = oldPeer.shared.roomID
		p.name.DisplayName = displayNameForPeer(p.id)
	} else {
		// 客户端 peerId 不构成身份凭据；未知 token 也不能认领已有身份
		p.shared.resumeToken = newUUID()
	}

	s.shared.sessions[p.shared.resumeToken] = p
	s.cancelEmptyRoomCleanupLocked(p.shared.roomID)
	// 先覆盖同房间中的身份，再退休旧连接，避免临时空房撤销邀请
	s.addPeerLocked(p)

	if oldPeer != nil {
		oldPeer.closeCode.Store(4001)
		s.retirePeerLocked(oldPeer)
		info := protocol.UserReconnectedInfo{
			OldPeerID: oldPeer.id,
			NewPeerID: p.id,
			UserInfo:  p.userInfo(p.shared.roomID),
		}
		s.enqueueBatchLocked(s.roomBroadcastLocked(p.shared.roomID, protocol.ActionUserReconnected, info, p.id))
		s.backgroundWG.Add(1)
	}

	s.shared.mu.Unlock()
	if oldPeer != nil {
		// 先在锁内撤销旧连接的权限，再在锁外发送关闭帧
		// 取消 Write 的 context 会直接关闭底层连接，不能抢在 4001 之前执行
		go func() {
			defer s.backgroundWG.Done()
			_ = oldPeer.ws.Close(websocket.StatusCode(4001), "Session replaced")
			oldPeer.stopWriter()
		}()
	}
	return true
}

func (s *Server) readMessages(p *peer) {
	for {
		_, data, err := p.ws.Read(context.Background())
		if err != nil {
			if !errors.Is(err, context.Canceled) {
				log.Printf("signaling: websocket read failed for %s: %v", p.name.DisplayName, err)
			}
			return
		}
		s.handleMessage(p, data)
	}
}
