// 本文件通过真实 WebSocket 验证会话隔离、授权加入、邀请及连接生命周期契约
package signaling

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/beixiyo/web-share/packages/server-go/protocol"
	"github.com/coder/websocket"
)

const testUserAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

func Test会话凭据恢复指定房间且不会泄露到广播(t *testing.T) {
	s, h := testServer(t, Options{})
	host := connectTestPeer(t, h, "10.1.2.3")
	other := connectTestPeer(t, h, "192.168.1.2")
	invite := createTestInvite(t, host)
	sendTestMessage(t, other.conn, protocol.ActionJoinRoomByInvite, protocol.JoinInviteInfo{InviteID: invite.InviteID, JoinToken: invite.JoinToken})
	info := readPrivateInfo(t, other.conn)
	expectAction(t, other.conn, protocol.ActionJoinRoom)
	expectAction(t, host.conn, protocol.ActionJoinRoom)
	if info.RoomID != host.info.RoomID {
		t.Fatal("邀请没有加入目标房间")
	}

	resumed := dialTestPeer(t, h, "forged-id", "203.0.113.2", *other.info.ResumeToken)
	reconnected := expectAction(t, host.conn, protocol.ActionUserReconnected)
	var notice protocol.UserReconnectedInfo
	mustDecode(t, reconnected.Data, &notice)
	if notice.OldPeerID != other.info.PeerID || notice.NewPeerID != other.info.PeerID || notice.UserInfo.ResumeToken != nil {
		t.Fatalf("重连广播泄露凭据或改变身份：%#v", notice)
	}
	if _, _, err := other.conn.Read(testContext(t)); websocket.CloseStatus(err) != websocket.StatusCode(4001) {
		t.Fatalf("替换旧连接应返回4001，得到 %v", err)
	}
	sendTestMessage(t, resumed, protocol.ActionJoinRoom, protocol.UserInfo{RoomID: host.info.RoomID})
	restored := readPrivateInfo(t, resumed)
	roster := readUsers(t, resumed)
	expectAction(t, host.conn, protocol.ActionJoinRoom)
	if restored.PeerID != other.info.PeerID || restored.RoomID != host.info.RoomID || *restored.ResumeToken != *other.info.ResumeToken {
		t.Fatalf("握手没有恢复会话：%#v", restored)
	}
	if len(roster) != 2 {
		t.Fatalf("重连产生重复成员：%#v", roster)
	}
	s.shared.mu.RLock()
	current := s.shared.sessions[*restored.ResumeToken]
	s.shared.mu.RUnlock()
	if current == nil {
		t.Fatal("旧连接关闭误删新会话")
	}
}

func Test同IP同浏览器与伪造公开身份不会替换其他连接(t *testing.T) {
	_, h := testServer(t, Options{})
	first := connectTestPeer(t, h, "10.1.2.3")
	raw := dialTestPeer(t, h, first.info.PeerID, "10.1.2.3", "unrecognized-token")
	sendTestMessage(t, raw, protocol.ActionJoinRoom, protocol.UserInfo{})
	second := readPrivateInfo(t, raw)
	users := readUsers(t, raw)
	expectAction(t, first.conn, protocol.ActionJoinRoom)
	if second.PeerID == first.info.PeerID || *second.ResumeToken == *first.info.ResumeToken || len(users) != 2 {
		t.Fatal("公开peerId或相同UA替换了独立会话")
	}
	sendTestMessage(t, first.conn, protocol.ActionPing, nil)
	expectAction(t, first.conn, protocol.ActionPing)
}

// 回归取消 Write 抢先关闭底层 TCP、使健康旧页收不到 4001 而继续自动重连的失败
func Test背压写入中替换会话仍发送4001关闭帧(t *testing.T) {
	_, h := testServer(t, Options{})
	old := connectTestPeer(t, h, "10.1.2.3")
	source := connectTestPeer(t, h, "10.1.2.4")
	expectAction(t, old.conn, protocol.ActionJoinRoom)
	old.conn.SetReadLimit(12 * 1024 * 1024)
	sendTestMessage(t, source.conn, protocol.ActionRelay, map[string]any{
		"type": protocol.ActionCandidate, "toId": old.info.PeerID, "blob": strings.Repeat("x", 8*1024*1024),
	})
	_, reader, err := old.conn.Reader(testContext(t))
	if err != nil {
		t.Fatal(err)
	}
	// 只读取帧头，保留正在写入的大帧，再建立替换连接
	resumed := dialTestPeer(t, h, "", "192.168.1.2", *old.info.ResumeToken)
	expectAction(t, source.conn, protocol.ActionUserReconnected)
	sendTestMessage(t, resumed, protocol.ActionJoinRoom, protocol.UserInfo{})
	readPrivateInfo(t, resumed)
	readUsers(t, resumed)
	expectAction(t, source.conn, protocol.ActionJoinRoom)
	if _, err := io.Copy(io.Discard, reader); err != nil {
		t.Fatalf("替换时提前取消了正在发送的帧：%v", err)
	}
	if _, _, err := old.conn.Read(testContext(t)); websocket.CloseStatus(err) != websocket.StatusCode(4001) {
		t.Fatalf("背压期间替换未发送4001：%v", err)
	}
}

func Test拒绝直接房间认领和旧二维码并确认当前身份(t *testing.T) {
	_, h := testServer(t, Options{})
	host := connectTestPeer(t, h, "10.1.2.3")
	outsider := connectTestPeer(t, h, "192.168.1.2")
	sendTestMessage(t, outsider.conn, protocol.ActionJoinRoom, protocol.UserInfo{RoomID: host.info.RoomID, PeerID: host.info.PeerID})
	expectAction(t, outsider.conn, protocol.ActionError)
	actual := readPrivateInfo(t, outsider.conn)
	readUsers(t, outsider.conn)
	if actual.RoomID != outsider.info.RoomID {
		t.Fatal("裸roomId允许跨房")
	}
	sendTestMessage(t, outsider.conn, protocol.ActionJoinRoomByQRCode, protocol.JoinRoomInfo{RoomID: host.info.RoomID, PeerID: host.info.PeerID})
	expectAction(t, outsider.conn, protocol.ActionInviteInvalidated)
	assertResponsive(t, outsider.conn)
}

func Test邀请刷新过期与同房重复加入(t *testing.T) {
	_, h := testServer(t, Options{RoomEmptyGrace: 0, InviteTTL: 150 * time.Millisecond})
	host := connectTestPeer(t, h, "10.1.2.3")
	first := createTestInvite(t, host)
	sendTestMessage(t, host.conn, protocol.ActionJoinRoomByCode, protocol.JoinRoomCodeInfo{RoomCode: first.RoomCode})
	readPrivateInfo(t, host.conn)
	readUsers(t, host.conn)
	sendTestMessage(t, host.conn, protocol.ActionGetCurrentInvite, nil)
	current := decodeInvite(t, expectAction(t, host.conn, protocol.ActionInviteCreated))
	if current.InviteID != first.InviteID {
		t.Fatal("同房重复加入撤销了邀请")
	}
	sendTestMessage(t, host.conn, protocol.ActionRefreshInvite, nil)
	refreshed := decodeInvite(t, expectAction(t, host.conn, protocol.ActionInviteCreated))
	guest := connectTestPeer(t, h, "192.168.1.2")
	sendTestMessage(t, guest.conn, protocol.ActionJoinRoomByInvite, protocol.JoinInviteInfo{InviteID: first.InviteID, JoinToken: first.JoinToken})
	expectInvalidReason(t, guest.conn, protocol.InviteInvalidatedReasonNotFound)
	time.Sleep(time.Until(time.UnixMilli(refreshed.ExpiresAt).Add(5 * time.Millisecond)))
	sendTestMessage(t, guest.conn, protocol.ActionJoinRoomByCode, protocol.JoinRoomCodeInfo{RoomCode: refreshed.RoomCode})
	expectInvalidReason(t, guest.conn, protocol.InviteInvalidatedReasonExpired)
}

func Test默认房间分享真实邀请且刷新撤销旧凭据(t *testing.T) {
	_, h := testServer(t, Options{})
	host := connectTestPeer(t, h, "10.1.2.3")
	sendTestMessage(t, host.conn, protocol.ActionJoinRoomByCode, protocol.JoinRoomCodeInfo{RoomCode: "442385"})
	readPrivateInfo(t, host.conn)
	readUsers(t, host.conn)
	first := createTestInvite(t, host)
	if first.InviteID == "default-442385" || first.RoomCode == "442385" {
		t.Fatal("分享邀请不应使用公开固定码的虚拟凭据")
	}
	guest := connectTestPeer(t, h, "192.168.1.2")
	sendTestMessage(t, guest.conn, protocol.ActionJoinRoomByInvite, protocol.JoinInviteInfo{InviteID: first.InviteID, JoinToken: first.JoinToken})
	info := readPrivateInfo(t, guest.conn)
	readUsers(t, guest.conn)
	expectAction(t, host.conn, protocol.ActionJoinRoom)
	if info.RoomID != "default" {
		t.Fatal("默认房间分享链接不可用")
	}
	sendTestMessage(t, host.conn, protocol.ActionRefreshInvite, nil)
	second := decodeInvite(t, expectAction(t, host.conn, protocol.ActionInviteCreated))
	sendTestMessage(t, host.conn, protocol.ActionRefreshInvite, nil)
	third := decodeInvite(t, expectAction(t, host.conn, protocol.ActionInviteCreated))
	for _, old := range []protocol.RoomInviteInfo{first, second} {
		sendTestMessage(t, guest.conn, protocol.ActionJoinRoomByInvite, protocol.JoinInviteInfo{InviteID: old.InviteID, JoinToken: old.JoinToken})
		expectInvalidReason(t, guest.conn, protocol.InviteInvalidatedReasonNotFound)
		sendTestMessage(t, guest.conn, protocol.ActionJoinRoomByCode, protocol.JoinRoomCodeInfo{RoomCode: old.RoomCode})
		expectInvalidReason(t, guest.conn, protocol.InviteInvalidatedReasonNotFound)
	}
	sendTestMessage(t, guest.conn, protocol.ActionJoinRoomByInvite, protocol.JoinInviteInfo{InviteID: third.InviteID, JoinToken: third.JoinToken})
	readPrivateInfo(t, guest.conn)
	readUsers(t, guest.conn)
	expectAction(t, host.conn, protocol.ActionJoinRoom)
}

func Test换房通知旧房成员且名单没有恢复凭据(t *testing.T) {
	_, h := testServer(t, Options{})
	alice := connectTestPeer(t, h, "10.1.2.3")
	bob := connectTestPeer(t, h, "10.1.2.4")
	expectAction(t, alice.conn, protocol.ActionJoinRoom)
	target := connectTestPeer(t, h, "192.168.1.2")
	invite := createTestInvite(t, target)
	sendTestMessage(t, bob.conn, protocol.ActionJoinRoomByInvite, protocol.JoinInviteInfo{InviteID: invite.InviteID, JoinToken: invite.JoinToken})
	leave := expectAction(t, alice.conn, protocol.ActionLeaveRoom)
	var user protocol.UserInfo
	mustDecode(t, leave.Data, &user)
	if user.PeerID != bob.info.PeerID || user.RoomID != alice.info.RoomID || user.ResumeToken != nil {
		t.Fatalf("迁出通知不正确：%#v", user)
	}
	readPrivateInfo(t, bob.conn)
	users := readUsers(t, bob.conn)
	expectAction(t, target.conn, protocol.ActionJoinRoom)
	if len(users) != 2 {
		t.Fatal("目标房成员错误")
	}
}

func Test转发仅允许信令动作并强制真实发送者(t *testing.T) {
	_, h := testServer(t, Options{})
	alice := connectTestPeer(t, h, "10.1.2.3")
	bob := connectTestPeer(t, h, "10.1.2.4")
	expectAction(t, alice.conn, protocol.ActionJoinRoom)
	outsider := connectTestPeer(t, h, "192.168.1.2")
	sendTestMessage(t, alice.conn, protocol.ActionRelay, map[string]any{"type": protocol.ActionCandidate, "toId": bob.info.PeerID, "fromId": "forged", "marker": "candidate"})
	var relay map[string]any
	_, raw, err := bob.conn.Read(testContext(t))
	if err != nil {
		t.Fatal(err)
	}
	mustDecode(t, raw, &relay)
	if relay["fromId"] != alice.info.PeerID || relay["marker"] != "candidate" {
		t.Fatalf("未强制真实身份：%#v", relay)
	}
	for _, bad := range []any{
		nil,
		map[string]any{"toId": bob.info.PeerID},
		map[string]any{"type": protocol.ActionNotifyUserInfo, "toId": bob.info.PeerID, "data": map[string]any{"resumeToken": "forged"}},
		map[string]any{"type": protocol.ActionCandidate, "toId": outsider.info.PeerID},
	} {
		sendTestMessage(t, alice.conn, protocol.ActionRelay, bad)
		assertResponsive(t, alice.conn)
		assertResponsive(t, bob.conn)
		assertResponsive(t, outsider.conn)
	}
	for range 4 {
		sendTestMessage(t, alice.conn, protocol.ActionRTCError, map[string]any{"errorType": "TEST_ERROR", "fromPeerId": "forged"})
	}
	assertResponsive(t, alice.conn)
	for range 3 {
		errorMessage := expectAction(t, bob.conn, protocol.ActionRTCErrorBroadcast)
		var detail map[string]any
		mustDecode(t, errorMessage.Data, &detail)
		if detail["fromPeerId"] != alice.info.PeerID {
			t.Fatal("RTC错误允许伪造发送者")
		}
	}
	assertResponsive(t, bob.conn)
}

// 正常关闭必须立即更新在线名单；只有恢复凭据保留到宽限结束
func Test正常断连立即离线且会话宽限可恢复(t *testing.T) {
	s, h := testServer(t, Options{ClearTime: time.Hour, DisconnectDelay: 200 * time.Millisecond})
	old := connectTestPeer(t, h, "10.1.2.3")
	watcher := connectTestPeer(t, h, "10.1.2.4")
	expectAction(t, old.conn, protocol.ActionJoinRoom)
	_ = old.conn.CloseNow()
	leave := expectAction(t, watcher.conn, protocol.ActionLeaveRoom)
	var left protocol.UserInfo
	mustDecode(t, leave.Data, &left)
	if left.PeerID != old.info.PeerID || left.ResumeToken != nil {
		t.Fatal("离线通知身份不正确或泄露凭据")
	}
	sendTestMessage(t, watcher.conn, protocol.ActionJoinRoom, protocol.UserInfo{})
	readPrivateInfo(t, watcher.conn)
	users := readUsers(t, watcher.conn)
	if len(users) != 1 || containsPeer(users, old.info.PeerID) {
		t.Fatal("关闭连接仍显示在在线名单")
	}
	s.sweepKeepalive()
	s.shared.mu.RLock()
	preserved := s.shared.sessions[*old.info.ResumeToken] != nil
	s.shared.mu.RUnlock()
	if !preserved {
		t.Fatal("离线立即删除了可恢复会话")
	}
	resumed := dialTestPeer(t, h, "", "192.168.1.2", *old.info.ResumeToken)
	expectAction(t, watcher.conn, protocol.ActionUserReconnected)
	sendTestMessage(t, resumed, protocol.ActionJoinRoom, protocol.UserInfo{})
	info := readPrivateInfo(t, resumed)
	users = readUsers(t, resumed)
	expectAction(t, watcher.conn, protocol.ActionJoinRoom)
	time.Sleep(230 * time.Millisecond)
	assertResponsive(t, resumed)
	assertResponsive(t, watcher.conn)
	if info.PeerID != old.info.PeerID || info.RoomID != old.info.RoomID || *info.ResumeToken != *old.info.ResumeToken || len(users) != 2 {
		t.Fatal("恢复未保留身份、房间、凭据或旧计时器破坏了恢复成员")
	}
}

// 捕获离线成员已移出 rooms 后，宽限到期因 removePeer=false 而漏清 session 的失败
func Test离线会话过期不重复通知且旧令牌不能继承身份(t *testing.T) {
	s, h := testServer(t, Options{DisconnectDelay: 80 * time.Millisecond})
	old := connectTestPeer(t, h, "10.1.2.3")
	watcher := connectTestPeer(t, h, "10.1.2.4")
	expectAction(t, old.conn, protocol.ActionJoinRoom)
	_ = old.conn.CloseNow()
	expectAction(t, watcher.conn, protocol.ActionLeaveRoom)
	waitFor(t, func() bool {
		s.shared.mu.RLock()
		defer s.shared.mu.RUnlock()
		return s.shared.sessions[*old.info.ResumeToken] == nil
	})
	// 若 expiry 重复广播 Leave，接下来读到的就不是 Ping
	assertResponsive(t, watcher.conn)
	expired := dialTestPeer(t, h, old.info.PeerID, "192.168.1.2", *old.info.ResumeToken)
	sendTestMessage(t, expired, protocol.ActionJoinRoom, protocol.UserInfo{})
	current := readPrivateInfo(t, expired)
	readUsers(t, expired)
	if current.PeerID == old.info.PeerID || *current.ResumeToken == *old.info.ResumeToken || current.RoomID == old.info.RoomID {
		t.Fatal("过期令牌仍继承旧会话")
	}
}

// 邀请空房宽限必须从实际离线开始，不能额外等待会话恢复宽限
func Test正常断连立即触发空房邀请宽限(t *testing.T) {
	s, h := testServer(t, Options{DisconnectDelay: time.Hour, RoomEmptyGrace: 80 * time.Millisecond})
	host := connectTestPeer(t, h, "10.1.2.3")
	invite := createTestInvite(t, host)
	_ = host.conn.CloseNow()
	waitFor(t, func() bool {
		s.shared.mu.RLock()
		defer s.shared.mu.RUnlock()
		return !s.hasActiveRoomLocked(host.info.RoomID)
	})
	guest := connectTestPeer(t, h, "192.168.1.2")
	sendTestMessage(t, guest.conn, protocol.ActionJoinRoomByCode, protocol.JoinRoomCodeInfo{RoomCode: invite.RoomCode})
	expectInvalidReason(t, guest.conn, protocol.InviteInvalidatedReasonRoomUnavailable)
	time.Sleep(100 * time.Millisecond)
	sendTestMessage(t, guest.conn, protocol.ActionJoinRoomByCode, protocol.JoinRoomCodeInfo{RoomCode: invite.RoomCode})
	expectInvalidReason(t, guest.conn, protocol.InviteInvalidatedReasonNotFound)
	s.shared.mu.RLock()
	preserved := s.shared.sessions[*host.info.ResumeToken] != nil
	s.shared.mu.RUnlock()
	if !preserved {
		t.Fatal("邀请清理错误地结束了会话恢复宽限")
	}
}

func Test过期开放连接被关闭且旧token不能恢复(t *testing.T) {
	s, h := testServer(t, Options{ClearTime: time.Hour, DisconnectDelay: 200 * time.Millisecond})
	old := connectTestPeer(t, h, "10.1.2.3")
	s.shared.mu.Lock()
	p := s.shared.sessions[*old.info.ResumeToken]
	p.lastHeartbeat.Store(time.Now().Add(-2 * time.Hour).UnixNano())
	s.shared.mu.Unlock()
	s.sweepKeepalive()
	if _, _, err := old.conn.Read(testContext(t)); err == nil {
		t.Fatal("过期连接仍开放")
	}
	resumed := dialTestPeer(t, h, old.info.PeerID, "10.1.2.3", *old.info.ResumeToken)
	sendTestMessage(t, resumed, protocol.ActionJoinRoom, protocol.UserInfo{})
	current := readPrivateInfo(t, resumed)
	readUsers(t, resumed)
	if current.PeerID == old.info.PeerID || *current.ResumeToken == *old.info.ResumeToken {
		t.Fatal("过期会话仍可恢复")
	}
}

func Test空房宽限期保留后移除邀请(t *testing.T) {
	_, h := testServer(t, Options{RoomEmptyGrace: 70 * time.Millisecond})
	host := connectTestPeer(t, h, "10.1.2.3")
	invite := createTestInvite(t, host)
	sendTestMessage(t, host.conn, protocol.ActionLeaveRoom, nil)
	if _, _, err := host.conn.Read(testContext(t)); err == nil {
		t.Fatal("离房后socket未关闭")
	}
	guest := connectTestPeer(t, h, "192.168.1.2")
	sendTestMessage(t, guest.conn, protocol.ActionJoinRoomByCode, protocol.JoinRoomCodeInfo{RoomCode: invite.RoomCode})
	expectInvalidReason(t, guest.conn, protocol.InviteInvalidatedReasonRoomUnavailable)
	time.Sleep(90 * time.Millisecond)
	sendTestMessage(t, guest.conn, protocol.ActionJoinRoomByCode, protocol.JoinRoomCodeInfo{RoomCode: invite.RoomCode})
	expectInvalidReason(t, guest.conn, protocol.InviteInvalidatedReasonNotFound)
}

func Test背压不阻塞其他成员且快照按提交顺序发送(t *testing.T) {
	s, h := testServer(t, Options{})
	watcher := connectTestPeer(t, h, "10.1.2.3")
	slow := connectTestPeer(t, h, "10.1.2.4")
	expectAction(t, watcher.conn, protocol.ActionJoinRoom)
	source := connectTestPeer(t, h, "10.1.2.5")
	expectAction(t, watcher.conn, protocol.ActionJoinRoom)
	expectAction(t, slow.conn, protocol.ActionJoinRoom)
	slow.conn.SetReadLimit(12 * 1024 * 1024)
	sendTestMessage(t, source.conn, protocol.ActionRelay, map[string]any{"type": protocol.ActionCandidate, "toId": slow.info.PeerID, "blob": strings.Repeat("x", 8*1024*1024)})
	// 源连接必须能继续处理下一条消息，即使目标没有读取大负载
	assertResponsive(t, source.conn)
	sendTestMessage(t, slow.conn, protocol.ActionJoinRoom, protocol.UserInfo{})
	before := readUsers(t, watcher.conn)
	if len(before) != 3 {
		t.Fatal("旧快照不正确")
	}
	expectAction(t, source.conn, protocol.ActionJoinRoom)
	newcomer := connectTestPeer(t, h, "10.1.2.6")
	after := readUsers(t, watcher.conn)
	if len(after) != 4 || !containsPeer(after, newcomer.info.PeerID) {
		t.Fatal("新快照缺少加入成员")
	}
	expectAction(t, source.conn, protocol.ActionJoinRoom)
	if _, _, err := slow.conn.Read(testContext(t)); err != nil {
		t.Fatal(err)
	}
	readPrivateInfo(t, slow.conn)
	oldRoster := readUsers(t, slow.conn)
	newRoster := readUsers(t, slow.conn)
	if len(oldRoster) != 3 || len(newRoster) != 4 {
		t.Fatal("背压连接的快照发生倒序")
	}
	assertResponsive(t, watcher.conn)
	s.shared.mu.RLock()
	actual := len(s.shared.rooms[newcomer.info.RoomID].members)
	s.shared.mu.RUnlock()
	if actual != 4 {
		t.Fatal("服务端成员状态发生丢失")
	}
}

func Test发送队列溢出关闭慢连接且服务器关闭不死锁(t *testing.T) {
	s, h := testServer(t, Options{})
	slow := connectTestPeer(t, h, "10.1.2.3")
	source := connectTestPeer(t, h, "10.1.2.4")
	expectAction(t, slow.conn, protocol.ActionJoinRoom)
	payload := strings.Repeat("x", 8*1024*1024)
	for range 4 {
		sendTestMessage(t, source.conn, protocol.ActionRelay, map[string]any{"type": protocol.ActionCandidate, "toId": slow.info.PeerID, "blob": payload})
	}
	waitFor(t, func() bool {
		s.shared.mu.RLock()
		defer s.shared.mu.RUnlock()
		p := s.shared.sessions[*slow.info.ResumeToken]
		return p != nil && p.socketClosed.Load() && !s.isCurrentPeerLocked(p)
	})
	expectAction(t, source.conn, protocol.ActionLeaveRoom)
	assertResponsive(t, source.conn)
	closed := make(chan struct{})
	go func() { s.Close(); close(closed) }()
	select {
	case <-closed:
	case <-time.After(2 * time.Second):
		t.Fatal("关闭服务器被慢连接阻塞")
	}
}

// 验证生产地址选择契约，捕获 CF/XFF 优先级、非法候选回退和地址规范化回归
func Test零配置地址来源和完整IPv6房间隔离(t *testing.T) {
	for _, tc := range []struct {
		name, remote string
		cf, xff      []string
		want         string
	}{
		{"CF优先且取第一项", "203.0.113.2:1234", []string{" 198.51.100.2 , 198.51.100.3 "}, []string{"10.1.2.3"}, "198.51.100.2"},
		{"无CF采用XFF第一项", "127.0.0.1:1234", nil, []string{" 198.51.100.2, 10.1.2.4"}, "198.51.100.2"},
		{"无效CF回退XFF", "127.0.0.1:1234", []string{"bad"}, []string{"198.51.100.2"}, "198.51.100.2"},
		{"重复CF回退XFF", "127.0.0.1:1234", []string{"198.51.100.3", "198.51.100.4"}, []string{"198.51.100.2"}, "198.51.100.2"},
		{"空CF回退XFF", "127.0.0.1:1234", []string{""}, []string{"198.51.100.2"}, "198.51.100.2"},
		{"Zone候选回退XFF", "127.0.0.1:1234", []string{"fe80::1%eth0"}, []string{"198.51.100.2"}, "198.51.100.2"},
		{"无效XFF首项回退直连", "127.0.0.1:1234", nil, []string{"bad, 198.51.100.2"}, "127.0.0.1"},
		{"重复XFF回退直连", "127.0.0.1:1234", nil, []string{"198.51.100.2", "198.51.100.3"}, "127.0.0.1"},
		{"mapped头地址规范化", "127.0.0.1:1234", []string{"::ffff:198.51.100.2"}, nil, "198.51.100.2"},
		{"IPv6头地址规范化", "127.0.0.1:1234", []string{"2001:0db8:0000::1"}, nil, "2001:db8::1"},
		{"mapped直连规范化", "[::ffff:192.0.2.1]:1234", nil, nil, "192.0.2.1"},
		{"IPv6直连规范化", "[2001:0db8:0000::1]:1234", nil, nil, "2001:db8::1"},
		{"无效直连返回空", "invalid", nil, nil, ""},
		{"头地址优先于无效直连", "invalid", []string{"198.51.100.2"}, nil, "198.51.100.2"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "http://test", nil)
			r.RemoteAddr = tc.remote
			if tc.cf != nil {
				r.Header[http.CanonicalHeaderKey("CF-Connecting-IP")] = tc.cf
			}
			if tc.xff != nil {
				r.Header[http.CanonicalHeaderKey("X-Forwarded-For")] = tc.xff
			}
			if actual := peerIP(r); actual != tc.want {
				t.Fatalf("IP=%q，期望%q", actual, tc.want)
			}
		})
	}
	if roomIDFromIP("2001:db8::1", nil) == roomIDFromIP("2001:db8::2", nil) {
		t.Fatal("同前缀IPv6被合并")
	}
	if roomIDFromIP("2001:0db8:0:0::1", nil) != "ipv6_2001:db8::1" || roomIDFromIP("::1", nil) != "local" {
		t.Fatal("IPv6未规范化")
	}
}

func TestLAN前缀最长匹配与未匹配隔离(t *testing.T) {
	prefixes := []netip.Prefix{
		netip.MustParsePrefix("10.0.0.0/8"),
		netip.MustParsePrefix("10.1.0.0/16"),
		netip.MustParsePrefix("192.168.4.0/23"),
	}
	cases := []struct {
		ip   string
		want string
	}{
		{"10.1.2.3", "lan_10_1_0_0_16"},
		{"10.2.3.4", "lan_10_0_0_0_8"},
		{"192.168.4.52", "lan_192_168_4_0_23"},
		{"192.168.5.200", "lan_192_168_4_0_23"},
		{"192.168.6.1", "public_192_168_6_1"},
		{"invalid", "unknown"},
	}
	for _, tc := range cases {
		if actual := roomIDFromIP(tc.ip, prefixes); actual != tc.want {
			t.Errorf("roomIDFromIP(%q)=%q，期望%q", tc.ip, actual, tc.want)
		}
	}
	if actual := roomIDFromIP("192.168.4.52", []netip.Prefix{}); actual != "public_192_168_4_52" {
		t.Fatalf("显式空前缀应禁用 LAN 分房，得到 %q", actual)
	}
}

func Test真实WebSocket按配置的二十三位前缀分房(t *testing.T) {
	prefix := netip.MustParsePrefix("192.168.4.0/23")
	_, h := testServer(t, Options{LANPrefixes: []netip.Prefix{prefix}})
	first := connectTestPeer(t, h, "192.168.4.52")
	second := connectTestPeer(t, h, "192.168.5.200")
	if first.info.RoomID != "lan_192_168_4_0_23" || second.info.RoomID != first.info.RoomID {
		t.Fatalf("/23 内的真实 WebSocket 未加入同一房间：%q / %q", first.info.RoomID, second.info.RoomID)
	}
	expectAction(t, first.conn, protocol.ActionJoinRoom)

	outside := connectTestPeer(t, h, "192.168.6.1")
	if outside.info.RoomID == first.info.RoomID {
		t.Fatal("前缀外连接错误地加入 LAN 房间")
	}
}

func Test畸形输入不终止连接(t *testing.T) {
	_, h := testServer(t, Options{})
	peer := connectTestPeer(t, h, "10.1.2.3")
	for _, raw := range []string{"null", "[]", "{", "{\"type\":123}", "{\"type\":\"Relay\",\"data\":null}", "{\"type\":\"RTCError\",\"data\":[]}", "{\"type\":\"JoinRoom\",\"data\":true}"} {
		if err := peer.conn.Write(testContext(t), websocket.MessageText, []byte(raw)); err != nil {
			t.Fatal(err)
		}
		assertResponsive(t, peer.conn)
	}
}

type testPeer struct {
	conn *websocket.Conn
	info protocol.UserInfo
}
type testEnvelope struct {
	Type protocol.Action `json:"type"`
	Data json.RawMessage `json:"data"`
}

func testServer(t *testing.T, options Options) (*Server, *httptest.Server) {
	t.Helper()
	if options.LANPrefixes == nil {
		// 测试地址是合成数据，使用固定网段避免依赖运行测试机器的接口配置
		options.LANPrefixes = []netip.Prefix{
			netip.MustParsePrefix("10.0.0.0/8"),
			netip.MustParsePrefix("192.168.0.0/16"),
		}
	}
	if options.ClearTime == 0 {
		options.ClearTime = time.Hour
	}
	if options.DisconnectDelay == 0 {
		options.DisconnectDelay = time.Hour
	}
	if options.InviteTTL == 0 {
		options.InviteTTL = -time.Millisecond
	}
	options.DefaultRoomCode = "442385"
	s := New(options)
	h := httptest.NewServer(s)
	t.Cleanup(func() { s.Close(); h.Close() })
	return s, h
}

func connectTestPeer(t *testing.T, h *httptest.Server, ip string) *testPeer {
	t.Helper()
	conn := dialTestPeer(t, h, "claimed-id", ip, "")
	sendTestMessage(t, conn, protocol.ActionJoinRoom, protocol.UserInfo{})
	info := readPrivateInfo(t, conn)
	readUsers(t, conn)
	return &testPeer{conn: conn, info: info}
}

func dialTestPeer(t *testing.T, h *httptest.Server, claimedID, ip, token string) *websocket.Conn {
	t.Helper()
	endpoint, err := url.Parse("ws" + strings.TrimPrefix(h.URL, "http"))
	if err != nil {
		t.Fatal(err)
	}
	query := endpoint.Query()
	query.Set(protocol.PeerIDQueryKey, claimedID)
	if token != "" {
		query.Set(protocol.ResumeTokenQueryKey, token)
	}
	endpoint.RawQuery = query.Encode()
	conn, _, err := websocket.Dial(testContext(t), endpoint.String(), &websocket.DialOptions{HTTPHeader: http.Header{"User-Agent": {testUserAgent}, "X-Forwarded-For": {ip}}})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.CloseNow() })
	return conn
}

func testContext(t *testing.T) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	return ctx
}

func sendTestMessage(t *testing.T, conn *websocket.Conn, action protocol.Action, data any) {
	t.Helper()
	raw, err := json.Marshal(protocol.SendData[any, protocol.Action]{Type: action, Data: data})
	if err != nil {
		t.Fatal(err)
	}
	if err = conn.Write(testContext(t), websocket.MessageText, raw); err != nil {
		t.Fatal(err)
	}
}

func expectAction(t *testing.T, conn *websocket.Conn, action protocol.Action) testEnvelope {
	t.Helper()
	_, raw, err := conn.Read(testContext(t))
	if err != nil {
		t.Fatalf("读取 %s：%v", action, err)
	}
	var message testEnvelope
	mustDecode(t, raw, &message)
	if message.Type != action {
		t.Fatalf("得到 %s，期望 %s：%s", message.Type, action, raw)
	}
	return message
}

func readPrivateInfo(t *testing.T, conn *websocket.Conn) protocol.UserInfo {
	t.Helper()
	message := expectAction(t, conn, protocol.ActionNotifyUserInfo)
	var info protocol.UserInfo
	mustDecode(t, message.Data, &info)
	if info.PeerID == "" || info.ResumeToken == nil || *info.ResumeToken == "" {
		t.Fatal("没有私有会话凭据")
	}
	return info
}

func readUsers(t *testing.T, conn *websocket.Conn) []protocol.UserInfo {
	t.Helper()
	message := expectAction(t, conn, protocol.ActionJoinRoom)
	var users []protocol.UserInfo
	mustDecode(t, message.Data, &users)
	for _, user := range users {
		if user.ResumeToken != nil {
			t.Fatal("成员名单泄露恢复凭据")
		}
	}
	return users
}

func createTestInvite(t *testing.T, peer *testPeer) protocol.RoomInviteInfo {
	t.Helper()
	sendTestMessage(t, peer.conn, protocol.ActionGetOrCreateInvite, nil)
	return decodeInvite(t, expectAction(t, peer.conn, protocol.ActionInviteCreated))
}

func decodeInvite(t *testing.T, message testEnvelope) protocol.RoomInviteInfo {
	t.Helper()
	var invite protocol.RoomInviteInfo
	mustDecode(t, message.Data, &invite)
	return invite
}

func expectInvalidReason(t *testing.T, conn *websocket.Conn, want protocol.InviteInvalidatedReason) {
	t.Helper()
	message := expectAction(t, conn, protocol.ActionInviteInvalidated)
	var info protocol.InviteInvalidatedInfo
	mustDecode(t, message.Data, &info)
	if info.Reason != want {
		t.Fatalf("失效原因=%s，期望=%s", info.Reason, want)
	}
}

func assertResponsive(t *testing.T, conn *websocket.Conn) {
	t.Helper()
	sendTestMessage(t, conn, protocol.ActionPing, nil)
	response := expectAction(t, conn, protocol.ActionPing)
	if string(response.Data) != "null" {
		t.Fatal("Ping必须返回null")
	}
}

func mustDecode(t *testing.T, raw []byte, target any) {
	t.Helper()
	if err := json.Unmarshal(raw, target); err != nil {
		t.Fatal(err)
	}
}
func containsPeer(users []protocol.UserInfo, id string) bool {
	for _, user := range users {
		if user.PeerID == id {
			return true
		}
	}
	return false
}
func waitFor(t *testing.T, predicate func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for !predicate() {
		if time.Now().After(deadline) {
			t.Fatal("状态转换超时")
		}
		time.Sleep(time.Millisecond)
	}
}
