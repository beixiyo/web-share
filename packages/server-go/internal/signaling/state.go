// 本文件定义房间、邀请和计时器共用的状态类型
package signaling

import (
	"sync"
	"time"

	"github.com/beixiyo/web-share/packages/server-go/protocol"
)

// serverSharedState 将同一把锁保护的服务状态放在显式边界内
// 发布后访问状态字段必须持有 mu；开始使用后不得复制本结构体
type serverSharedState struct {
	mu sync.RWMutex

	closed            bool
	rooms             map[string]*peerRoom
	connections       map[*peer]struct{}
	sessions          map[string]*peer
	disconnects       map[*peer]*disconnectJob
	emptyRoomCleanups map[string]*roomCleanupJob
	invites           inviteState
	rtcErrors         rtcErrorState
}

// peerSharedState 在连接发布后由所属 Server.shared.mu 保护
// 它不创建新锁，便于房间、会话和发送队列计数在同一临界区更新
type peerSharedState struct {
	roomID      string
	resumeToken string
	queuedBytes int
}

type peerRoom struct {
	// members 用于按 ID 查找；order 单独保留成员加入顺序以稳定广播顺序
	members map[string]*peer
	order   []string
}

func newPeerRoom() *peerRoom {
	return &peerRoom{members: make(map[string]*peer)}
}

func (r *peerRoom) add(p *peer) {
	if _, exists := r.members[p.id]; !exists {
		r.order = append(r.order, p.id)
	}
	r.members[p.id] = p
}

func (r *peerRoom) remove(p *peer) bool {
	if r.members[p.id] != p {
		return false
	}
	delete(r.members, p.id)
	for index, peerID := range r.order {
		if peerID == p.id {
			r.order = append(r.order[:index], r.order[index+1:]...)
			break
		}
	}
	return true
}

func (r *peerRoom) users(roomID string) []protocol.UserInfo {
	users := make([]protocol.UserInfo, 0, len(r.members))
	for _, peerID := range r.order {
		if p := r.members[peerID]; p != nil {
			users = append(users, p.userInfo(roomID))
		}
	}
	return users
}

type disconnectJob struct {
	timer *time.Timer
}

type roomCleanupJob struct {
	timer *time.Timer
}

type inviteState struct {
	byID        map[string]protocol.RoomInviteInfo
	byCode      map[string]string
	byRoom      map[string]string
	defaultCode string
	ttl         time.Duration
}

func newInviteState(options Options) inviteState {
	return inviteState{
		byID:        make(map[string]protocol.RoomInviteInfo),
		byCode:      make(map[string]string),
		byRoom:      make(map[string]string),
		defaultCode: options.DefaultRoomCode,
		ttl:         options.InviteTTL,
	}
}

type rtcErrorState map[string]map[string][]time.Time
