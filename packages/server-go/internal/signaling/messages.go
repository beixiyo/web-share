// 本文件验证协议输入，并按状态提交顺序将响应放入每连接发送队列
package signaling

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/beixiyo/web-share/packages/server-go/protocol"
	"github.com/coder/websocket"
)

type wireMessage struct {
	Type protocol.Action `json:"type"`
	Data json.RawMessage `json:"data"`
}

type outbound struct {
	peer   *peer
	action protocol.Action
	data   any
}

func (s *Server) handleMessage(sender *peer, data []byte) {
	if sender.retired.Load() {
		return
	}
	var message wireMessage
	if json.Unmarshal(data, &message) != nil {
		return
	}

	switch message.Type {
	case protocol.ActionClose:
		sender.stopWriter()
	case protocol.ActionPing:
		s.handlePing(sender)

	case protocol.ActionJoinRoom:
		s.handleJoinRoom(sender, message.Data)
	case protocol.ActionLeaveRoom:
		s.scheduleDisconnect(sender, true)

	case protocol.ActionGetOrCreateInvite, protocol.ActionGetCurrentInvite, protocol.ActionRefreshInvite:
		s.handleInvite(sender, message.Type)
	case protocol.ActionJoinRoomByQRCode:
		s.shared.mu.Lock()
		if s.isCurrentPeerLocked(sender) {
			s.sendInviteInvalidatedLocked(sender, protocol.InviteInvalidatedReasonNotFound, nil)
		}
		s.shared.mu.Unlock()

	case protocol.ActionJoinRoomByInvite:
		s.handleJoinByInvite(sender, message.Data)
	case protocol.ActionJoinRoomByCode:
		s.handleJoinByCode(sender, message.Data)

	case protocol.ActionRelay:
		s.handleRelay(sender, message.Data)
	case protocol.ActionRTCError:
		s.handleRTCError(sender, message.Data)
	}
}

func (s *Server) handlePing(sender *peer) {
	s.shared.mu.Lock()
	defer s.shared.mu.Unlock()
	if !s.isCurrentPeerLocked(sender) {
		return
	}
	sender.lastHeartbeat.Store(time.Now().UnixNano())
	s.enqueueLocked(sender, protocol.ActionPing, nil)
}

func (s *Server) handleJoinRoom(sender *peer, raw json.RawMessage) {
	var request protocol.UserInfo
	if len(raw) > 0 && json.Unmarshal(raw, &request) != nil {
		return
	}
	s.shared.mu.Lock()
	defer s.shared.mu.Unlock()
	if !s.isCurrentPeerLocked(sender) {
		return
	}
	if request.RoomID != "" && request.RoomID != sender.shared.roomID {
		s.enqueueLocked(sender, protocol.ActionError, map[string]string{"message": "请使用邀请或房间码加入其他房间"})
	}
	s.enqueueLocked(sender, protocol.ActionNotifyUserInfo, sender.privateInfo())
	s.enqueueBatchLocked(s.roomBroadcastLocked(sender.shared.roomID, protocol.ActionJoinRoom, s.roomUsersLocked(sender.shared.roomID), ""))
}

func (s *Server) handleInvite(sender *peer, action protocol.Action) {
	s.shared.mu.Lock()
	defer s.shared.mu.Unlock()
	if !s.isCurrentPeerLocked(sender) {
		return
	}
	var invite *protocol.RoomInviteInfo
	switch action {
	case protocol.ActionGetCurrentInvite:
		invite = s.getActiveInviteForRoomLocked(sender.shared.roomID)
	case protocol.ActionRefreshInvite:
		created := s.refreshInviteLocked(sender.shared.roomID)
		invite = &created
	default:
		created := s.getOrCreateInviteLocked(sender.shared.roomID)
		invite = &created
	}
	if invite == nil {
		s.sendInviteInvalidatedLocked(sender, protocol.InviteInvalidatedReasonNoActiveInvite, nil)
		return
	}
	s.enqueueLocked(sender, protocol.ActionInviteCreated, *invite)
}

func (s *Server) handleJoinByInvite(sender *peer, raw json.RawMessage) {
	var request protocol.JoinInviteInfo
	valid := json.Unmarshal(raw, &request) == nil
	s.shared.mu.Lock()
	defer s.shared.mu.Unlock()
	if !s.isCurrentPeerLocked(sender) {
		return
	}
	if !valid {
		s.sendInviteInvalidatedLocked(sender, protocol.InviteInvalidatedReasonNotFound, nil)
		return
	}
	result := s.resolveInviteByJoinPayloadLocked(request)
	if result.invite == nil {
		s.sendInviteInvalidatedLocked(sender, result.reason, nil)
		return
	}
	s.enqueueBatchLocked(s.moveAndNotifyLocked(sender, result.invite.RoomID))
}

func (s *Server) handleJoinByCode(sender *peer, raw json.RawMessage) {
	var request protocol.JoinRoomCodeInfo
	valid := json.Unmarshal(raw, &request) == nil
	s.shared.mu.Lock()
	defer s.shared.mu.Unlock()
	if !s.isCurrentPeerLocked(sender) {
		return
	}
	if !valid {
		s.sendInviteInvalidatedLocked(sender, protocol.InviteInvalidatedReasonNotFound, nil)
		return
	}
	result := s.resolveInviteByCodeLocked(request.RoomCode)
	if result.invite == nil {
		s.sendInviteInvalidatedLocked(sender, result.reason, &protocol.RoomInviteInfo{RoomCode: request.RoomCode})
		return
	}
	s.enqueueBatchLocked(s.moveAndNotifyLocked(sender, result.invite.RoomID))
}

func (s *Server) handleRelay(sender *peer, raw json.RawMessage) {
	var request map[string]json.RawMessage
	if json.Unmarshal(raw, &request) != nil || request == nil {
		return
	}
	var action protocol.Action
	if json.Unmarshal(request["type"], &action) != nil {
		return
	}
	switch action {
	case protocol.ActionOffer, protocol.ActionAnswer, protocol.ActionCandidate, protocol.ActionFileMetas:
	default:
		return
	}
	var targetID string
	if json.Unmarshal(request["toId"], &targetID) != nil || targetID == "" {
		return
	}
	request["fromId"], _ = json.Marshal(sender.id)
	payload, err := json.Marshal(request)
	if err != nil {
		return
	}
	s.shared.mu.Lock()
	defer s.shared.mu.Unlock()
	if !s.isCurrentPeerLocked(sender) {
		return
	}
	if recipient := s.shared.rooms[sender.shared.roomID].members[targetID]; recipient != nil {
		s.enqueueRawLocked(recipient, payload)
	}
}

func (s *Server) handleRTCError(sender *peer, raw json.RawMessage) {
	var detail map[string]json.RawMessage
	if json.Unmarshal(raw, &detail) != nil || detail == nil {
		return
	}
	var errorType string
	if len(detail["errorType"]) > 0 && json.Unmarshal(detail["errorType"], &errorType) != nil {
		return
	}
	if errorType == "" {
		errorType = "UNKNOWN_ERROR"
	}
	detail["fromPeerId"], _ = json.Marshal(sender.id)
	s.shared.mu.Lock()
	defer s.shared.mu.Unlock()
	if !s.isCurrentPeerLocked(sender) || !s.canBroadcastRTCErrorLocked(sender.shared.roomID, errorType, time.Now()) {
		return
	}
	s.enqueueBatchLocked(s.roomBroadcastLocked(sender.shared.roomID, protocol.ActionRTCErrorBroadcast, detail, sender.id))
}

func (s *Server) sendInviteInvalidatedLocked(p *peer, reason protocol.InviteInvalidatedReason, invite *protocol.RoomInviteInfo) {
	messages := map[protocol.InviteInvalidatedReason]string{
		protocol.InviteInvalidatedReasonExpired:         "邀请已过期，请重新生成",
		protocol.InviteInvalidatedReasonNotFound:        "邀请不存在或已失效，请使用邀请链接或房间码",
		protocol.InviteInvalidatedReasonRoomUnavailable: "邀请对应的房间不可用",
		protocol.InviteInvalidatedReasonRestarted:       "服务已重启，请重新生成邀请",
		protocol.InviteInvalidatedReasonRevoked:         "邀请已被刷新，请使用最新邀请",
		protocol.InviteInvalidatedReasonNoActiveInvite:  "当前房间没有可用邀请",
	}
	info := protocol.InviteInvalidatedInfo{Reason: reason, Message: messages[reason]}
	if invite != nil {
		if invite.InviteID != "" {
			info.InviteID = &invite.InviteID
		}
		if invite.RoomCode != "" {
			info.RoomCode = &invite.RoomCode
		}
	}
	s.enqueueLocked(p, protocol.ActionInviteInvalidated, info)
}

// enqueueBatchLocked 必须与状态修改处于同一临界区，保持每个接收者看到的提交顺序
func (s *Server) enqueueBatchLocked(messages []outbound) {
	for _, message := range messages {
		s.enqueueLocked(message.peer, message.action, message.data)
	}
}

func (s *Server) enqueueLocked(p *peer, action protocol.Action, data any) {
	message, err := json.Marshal(protocol.SendData[any, protocol.Action]{Type: action, Data: data})
	if err != nil {
		log.Printf("signaling: marshal %s failed: %v", action, err)
		return
	}
	s.enqueueRawLocked(p, message)
}

func (s *Server) enqueueRawLocked(p *peer, message []byte) {
	if s.shared.closed || p == nil || p.socketClosed.Load() || p.retired.Load() || p.writeCtx.Err() != nil {
		return
	}
	// 同时限制消息数和字节数；溢出时取消 writer，让正常断连生命周期负责清理
	if p.shared.queuedBytes+len(message) > maxQueuedBytes {
		p.stopWriter()
		return
	}

	select {
	case p.sendQueue <- message:
		p.shared.queuedBytes += len(message)
	default:
		p.stopWriter()
	}
}

// writeMessages 独占 socket 写入；取消会中断背压中的 Write，退出时关闭连接唤醒 reader
func (s *Server) writeMessages(p *peer) {
	defer close(p.writerDone)
	defer func() {
		if p.closeCode.Load() == 4001 {
			_ = p.ws.Close(websocket.StatusCode(4001), "Session replaced")
		} else {
			_ = p.ws.CloseNow()
		}
	}()

	defer func() {
		p.stopWriter()
		s.shared.mu.Lock()
		defer s.shared.mu.Unlock()

		for {
			select {
			case <-p.sendQueue:
			default:
				p.shared.queuedBytes = 0
				return
			}
		}
	}()

	for {
		select {
		case <-p.writeCtx.Done():
			return
		case message := <-p.sendQueue:
			s.shared.mu.Lock()
			p.shared.queuedBytes -= len(message)
			stopped := s.shared.closed || p.retired.Load() || p.writeCtx.Err() != nil
			s.shared.mu.Unlock()
			if stopped {
				return
			}
			ctx, cancel := context.WithTimeout(p.writeCtx, writeTimeout)
			err := p.ws.Write(ctx, websocket.MessageText, message)
			cancel()
			if err != nil {
				return
			}
		}
	}
}
