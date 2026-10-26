// Package signaling 实现 Web Share 房间与邀请信令服务
// 本文件识别每个 peer 的网络位置、身份和设备信息
package signaling

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/beixiyo/web-share/packages/server-go/protocol"
	"github.com/coder/websocket"
	"github.com/ua-parser/uap-go/uaparser"
)

var (
	uaParserOnce sync.Once
	uaParser     *uaparser.Parser
)

type peer struct {
	ws *websocket.Conn
	id string // 注册完成后不可变

	// shared 在连接发布后由所属 Server.shared.mu 保护，不持有独立的锁
	shared peerSharedState

	// channel 自身支持并发收发；额外的字节计数存放在 shared 中
	sendQueue    chan []byte
	writeCtx     context.Context
	cancelWriter context.CancelFunc
	writerDone   chan struct{}
	name         protocol.Name // 注册完成后不可变

	// 这些字段跨 goroutine 读写，必须使用各自的 Load/Store 等原子操作
	lastHeartbeat atomic.Int64
	socketClosed  atomic.Bool
	retired       atomic.Bool
	closeCode     atomic.Int32
}

func newPeer(conn *websocket.Conn, request *http.Request, lanPrefixes []netip.Prefix) *peer {
	ip := peerIP(request)
	id := newUUID()
	writeCtx, cancelWriter := context.WithCancel(context.Background())
	p := &peer{
		ws: conn,
		id: id,
		shared: peerSharedState{
			roomID:      roomIDFromIP(ip, lanPrefixes),
			resumeToken: request.URL.Query().Get(protocol.ResumeTokenQueryKey),
		},
		name:         nameFromUserAgent(request.Header.Get("User-Agent"), id),
		sendQueue:    make(chan []byte, sendQueueCapacity),
		writeCtx:     writeCtx,
		cancelWriter: cancelWriter,
		writerDone:   make(chan struct{}),
	}
	p.lastHeartbeat.Store(time.Now().UnixNano())
	return p
}

func (p *peer) stopWriter() {
	p.cancelWriter()
}

// peerIP 零配置按 CF、XFF、直连地址查找首个合法 IP，转发头只取逗号第一项
func peerIP(request *http.Request) string {
	for _, name := range []string{"CF-Connecting-IP", "X-Forwarded-For"} {
		first, _, _ := strings.Cut(stringHeader(request, name), ",")
		if ip := canonicalIP(strings.TrimSpace(first)); ip != "" {
			return ip
		}
	}
	remote := request.RemoteAddr
	if host, _, err := net.SplitHostPort(remote); err == nil {
		remote = host
	}
	return canonicalIP(remote)
}

func canonicalIP(value string) string {
	ip, err := netip.ParseAddr(value)
	if err != nil || ip.Zone() != "" {
		return ""
	}
	return ip.Unmap().String()
}

func stringHeader(request *http.Request, name string) string {
	values := request.Header.Values(name)
	if len(values) != 1 {
		return ""
	}
	return strings.TrimSpace(values[0])
}

func roomIDFromIP(value string, lanPrefixes []netip.Prefix) string {
	ip, err := netip.ParseAddr(value)
	if err != nil {
		return "unknown"
	}
	ip = ip.Unmap()
	if ip.IsLoopback() {
		return "local"
	}
	if ip.Is6() {
		return "ipv6_" + ip.String()
	}
	var match netip.Prefix
	for _, prefix := range lanPrefixes {
		if prefix.Contains(ip) && (!match.IsValid() || prefix.Bits() > match.Bits()) {
			match = prefix
		}
	}
	if match.IsValid() {
		address := strings.ReplaceAll(match.Masked().Addr().String(), ".", "_")
		return "lan_" + address + "_" + strconv.Itoa(match.Bits())
	}
	return "public_" + strings.ReplaceAll(ip.String(), ".", "_")
}

func nameFromUserAgent(userAgent string, peerID string) protocol.Name {
	uaParserOnce.Do(func() {
		var err error
		uaParser, err = uaparser.New()
		if err != nil {
			panic(fmt.Errorf("initialize user agent parser: %w", err))
		}
	})

	parsed := uaParser.Parse(userAgent)
	osName := parsed.Os.Family
	if osName == "Other" {
		osName = ""
	}
	model := parsed.Device.Model
	if model == "Other" {
		model = ""
	}
	browser := parsed.UserAgent.Family
	if browser == "Other" {
		browser = ""
	}

	deviceName := ""
	if osName != "" {
		deviceName = strings.Replace(osName, "Mac OS", "Mac", 1) + " "
	}
	if model != "" {
		deviceName += model
	} else {
		deviceName += browser
	}
	if deviceName == "" {
		deviceName = "Unknown Device"
	}

	return protocol.Name{
		Model:       model,
		OS:          osName,
		Browser:     browser,
		Type:        uaDeviceType(userAgent, parsed.Device.Model),
		DeviceName:  deviceName,
		DisplayName: displayNameForPeer(peerID),
	}
}

func uaDeviceType(userAgent string, model string) string {
	ua := strings.ToLower(userAgent)
	deviceModel := strings.ToLower(model)
	switch {
	case strings.Contains(ua, "ipad"), strings.Contains(ua, "tablet"), strings.Contains(deviceModel, "tablet"):
		return "tablet"
	case strings.Contains(ua, "iphone"), strings.Contains(ua, "ipod"), strings.Contains(ua, "mobile"),
		strings.Contains(deviceModel, "phone"):
		return "mobile"
	case strings.Contains(ua, "playstation"), strings.Contains(ua, "xbox"), strings.Contains(ua, "nintendo"):
		return "console"
	case strings.Contains(ua, "smart-tv"), strings.Contains(ua, "smarttv"), strings.Contains(ua, "hbbtv"):
		return "smarttv"
	case strings.Contains(ua, "watch"), strings.Contains(ua, "wearable"):
		return "wearable"
	default:
		return ""
	}
}

func displayNameForPeer(peerID string) string {
	colors := [...]string{
		"Amber", "Azure", "Blue", "Coral", "Crimson", "Emerald", "Indigo", "Jade",
		"Lavender", "Olive", "Ruby", "Silver", "Teal", "Violet", "White", "Gold",
	}
	animals := [...]string{
		"Badger", "Beaver", "Cat", "Cheetah", "Dolphin", "Eagle", "Fox", "Gecko", "Heron", "Koala",
		"Lynx", "Otter", "Owl", "Panda", "Raven", "Seal", "Tiger", "Whale", "Wolf", "Yak",
	}

	seed := cyrb53(peerID)
	colorIndex := int(seed % uint64(len(colors)))
	animalIndex := int((seed / uint64(len(colors))) % uint64(len(animals)))
	return colors[colorIndex] + " " + animals[animalIndex]
}

func cyrb53(value string) uint64 {
	h1 := uint32(0xDEADBEEF)
	h2 := uint32(0x41C6CE57)
	for index := 0; index < len(value); index++ {
		char := uint32(value[index])
		h1 = (h1 ^ char) * 2654435761
		h2 = (h2 ^ char) * 1597334677
	}
	h1 = (h1^(h1>>16))*2246822507 ^ (h2^(h2>>13))*3266489909
	h2 = (h2^(h2>>16))*2246822507 ^ (h1^(h1>>13))*3266489909
	return uint64(4294967296*(uint64(h2)&2097151) + uint64(h1))
}

func newUUID() string {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		panic(fmt.Errorf("generate peer id: %w", err))
	}
	value[6] = value[6]&0x0f | 0x40
	value[8] = value[8]&0x3f | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		binary.BigEndian.Uint32(value[0:4]),
		binary.BigEndian.Uint16(value[4:6]),
		binary.BigEndian.Uint16(value[6:8]),
		binary.BigEndian.Uint16(value[8:10]),
		value[10:16],
	)
}

func (p *peer) userInfo(roomID string) protocol.UserInfo {
	return protocol.UserInfo{PeerID: p.id, RoomID: roomID, Name: p.name}
}

// privateInfo 只用于发给当前连接的身份确认，避免恢复凭据进入公开成员广播
func (p *peer) privateInfo() protocol.UserInfo {
	info := p.userInfo(p.shared.roomID)
	token := p.shared.resumeToken
	info.ResumeToken = &token
	return info
}
