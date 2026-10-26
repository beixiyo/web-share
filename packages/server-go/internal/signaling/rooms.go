// 本文件负责 peer 成员关系、授权后的房间迁移和会话清理
package signaling

import "github.com/beixiyo/web-share/packages/server-go/protocol"

// 本文件中的 Locked 方法只在 Server.shared.mu 已加锁时调用；它们直接组合房间、会话和清理状态

func (s *Server) moveAndNotifyLocked(sender *peer, roomID string) []outbound {
	messages := s.movePeerLocked(sender, roomID)
	messages = append(messages, outbound{peer: sender, action: protocol.ActionNotifyUserInfo, data: sender.privateInfo()})
	messages = append(messages, s.roomBroadcastLocked(sender.shared.roomID, protocol.ActionJoinRoom, s.roomUsersLocked(sender.shared.roomID), "")...)
	return messages
}

func (s *Server) movePeerLocked(sender *peer, roomID string) []outbound {
	if sender.shared.roomID == roomID {
		return nil
	}
	oldRoomID := sender.shared.roomID
	oldInfo := sender.userInfo(oldRoomID)
	s.removePeerLocked(sender)
	messages := s.roomBroadcastLocked(oldRoomID, protocol.ActionLeaveRoom, oldInfo, "")
	sender.shared.roomID = roomID
	s.cancelEmptyRoomCleanupLocked(roomID)
	s.addPeerLocked(sender)
	return messages
}

func (s *Server) cleanupSessionLocked(p *peer) {
	if s.shared.sessions[p.shared.resumeToken] == p {
		delete(s.shared.sessions, p.shared.resumeToken)
	}
}

func (s *Server) retirePeerLocked(p *peer) {
	p.retired.Store(true)
	s.cancelDisconnectLocked(p)
	s.removePeerLocked(p)
	s.cleanupSessionLocked(p)
}

// isCurrentSessionLocked 同时接受在线及断连宽限内的会话
func (s *Server) isCurrentSessionLocked(p *peer) bool {
	return !s.shared.closed && !p.retired.Load() && s.shared.sessions[p.shared.resumeToken] == p
}

func (s *Server) isCurrentPeerLocked(p *peer) bool {
	if !s.isCurrentSessionLocked(p) {
		return false
	}
	room := s.shared.rooms[p.shared.roomID]
	return room != nil && room.members[p.id] == p
}

func (s *Server) addPeerLocked(p *peer) {
	room := s.shared.rooms[p.shared.roomID]
	if room == nil {
		room = newPeerRoom()
		s.shared.rooms[p.shared.roomID] = room
	}
	room.add(p)
}

func (s *Server) removePeerLocked(p *peer) bool {
	room := s.shared.rooms[p.shared.roomID]
	if room == nil || !room.remove(p) {
		return false
	}
	if len(room.members) == 0 {
		delete(s.shared.rooms, p.shared.roomID)
		s.scheduleEmptyRoomCleanupLocked(p.shared.roomID)
	}
	return true
}

func (s *Server) hasActiveRoomLocked(roomID string) bool {
	room := s.shared.rooms[roomID]
	return room != nil && len(room.members) > 0
}

func (s *Server) roomUsersLocked(roomID string) []protocol.UserInfo {
	room := s.shared.rooms[roomID]
	if room == nil {
		return []protocol.UserInfo{}
	}
	return room.users(roomID)
}

func (s *Server) roomBroadcastLocked(roomID string, action protocol.Action, data any, excludedPeerID string) []outbound {
	room := s.shared.rooms[roomID]
	if room == nil {
		return nil
	}
	messages := make([]outbound, 0, len(room.members))
	for _, peerID := range room.order {
		if peerID == excludedPeerID {
			continue
		}
		if p := room.members[peerID]; p != nil {
			messages = append(messages, outbound{peer: p, action: action, data: data})
		}
	}
	return messages
}
