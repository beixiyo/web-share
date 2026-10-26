// 本文件负责邀请的创建、查找、过期处理和房间码清理
package signaling

import (
	"math/rand"
	"strings"
	"time"

	"github.com/beixiyo/web-share/packages/server-go/protocol"
)

type inviteResolution struct {
	invite *protocol.RoomInviteInfo
	reason protocol.InviteInvalidatedReason
}

// 以下带 Locked 的方法读写 inviteState，并可能联动房间清理状态；调用方必须持有 Server.shared.mu
func (s *Server) getInviteForRoomLocked(roomID string) *protocol.RoomInviteInfo {
	inviteID := s.shared.invites.byRoom[roomID]
	if inviteID == "" {
		return nil
	}
	invite, ok := s.shared.invites.byID[inviteID]
	if !ok {
		return nil
	}
	return &invite
}

func (s *Server) getActiveInviteForRoomLocked(roomID string) *protocol.RoomInviteInfo {
	invite := s.getInviteForRoomLocked(roomID)
	if invite == nil {
		return nil
	}
	if inviteExpired(*invite, time.Now()) {
		s.invalidateInviteLocked(*invite)
		return nil
	}
	if !s.hasActiveRoomLocked(invite.RoomID) {
		if _, pending := s.shared.emptyRoomCleanups[invite.RoomID]; pending {
			return invite
		}
		s.invalidateInviteLocked(*invite)
		return nil
	}
	return invite
}

func (s *Server) getOrCreateInviteLocked(roomID string) protocol.RoomInviteInfo {
	if invite := s.getActiveInviteForRoomLocked(roomID); invite != nil {
		return *invite
	}
	return s.createInviteLocked(roomID)
}

func (s *Server) refreshInviteLocked(roomID string) protocol.RoomInviteInfo {
	if invite := s.getInviteForRoomLocked(roomID); invite != nil {
		s.invalidateInviteLocked(*invite)
	}
	return s.createInviteLocked(roomID)
}

func (s *Server) createInviteLocked(roomID string) protocol.RoomInviteInfo {
	roomCode := s.generateRoomCodeLocked()
	expiresAt := int64(0)

	if s.shared.invites.ttl > 0 {
		expiresAt = time.Now().Add(s.shared.invites.ttl).UnixMilli()
	} else if s.shared.invites.ttl < 0 {
		expiresAt = s.shared.invites.ttl.Milliseconds()
	}

	invite := protocol.RoomInviteInfo{
		InviteID:  newUUID(),
		RoomID:    roomID,
		RoomCode:  roomCode,
		JoinToken: newUUID(),
		ExpiresAt: expiresAt,
		Status:    protocol.InviteStatusActive,
	}
	s.shared.invites.byID[invite.InviteID] = invite
	s.shared.invites.byRoom[roomID] = invite.InviteID
	s.shared.invites.byCode[roomCode] = invite.InviteID

	return invite
}

func (s *Server) resolveInviteByCodeLocked(roomCode string) inviteResolution {
	roomCode = strings.TrimSpace(roomCode)
	if s.shared.invites.defaultCode != "" && roomCode == s.shared.invites.defaultCode {
		invite := defaultRoomInvite(s.shared.invites.defaultCode)
		return inviteResolution{invite: &invite}
	}

	inviteID := s.shared.invites.byCode[roomCode]
	if inviteID == "" {
		return inviteResolution{reason: protocol.InviteInvalidatedReasonNotFound}
	}
	invite, ok := s.shared.invites.byID[inviteID]
	if !ok {
		delete(s.shared.invites.byCode, roomCode)
		return inviteResolution{reason: protocol.InviteInvalidatedReasonNotFound}
	}
	if inviteExpired(invite, time.Now()) {
		s.invalidateInviteLocked(invite)
		return inviteResolution{reason: protocol.InviteInvalidatedReasonExpired}
	}
	if !s.hasActiveRoomLocked(invite.RoomID) {
		if _, pending := s.shared.emptyRoomCleanups[invite.RoomID]; !pending {
			s.invalidateInviteLocked(invite)
		}
		return inviteResolution{reason: protocol.InviteInvalidatedReasonRoomUnavailable}
	}
	return inviteResolution{invite: &invite}
}

func (s *Server) resolveInviteByJoinPayloadLocked(data protocol.JoinInviteInfo) inviteResolution {
	invite, ok := s.shared.invites.byID[data.InviteID]
	if !ok || invite.JoinToken != data.JoinToken {
		return inviteResolution{reason: protocol.InviteInvalidatedReasonNotFound}
	}
	if inviteExpired(invite, time.Now()) {
		s.invalidateInviteLocked(invite)
		return inviteResolution{reason: protocol.InviteInvalidatedReasonExpired}
	}
	if !s.hasActiveRoomLocked(invite.RoomID) {
		if _, pending := s.shared.emptyRoomCleanups[invite.RoomID]; !pending {
			s.invalidateInviteLocked(invite)
		}
		return inviteResolution{reason: protocol.InviteInvalidatedReasonRoomUnavailable}
	}
	return inviteResolution{invite: &invite}
}

func (s *Server) invalidateInviteLocked(invite protocol.RoomInviteInfo) {
	if _, ok := s.shared.invites.byID[invite.InviteID]; !ok {
		return
	}
	s.cleanupInviteByIDLocked(invite.InviteID)
}

func (s *Server) cleanupInviteByIDLocked(inviteID string) {
	invite, ok := s.shared.invites.byID[inviteID]
	if !ok {
		return
	}
	s.cancelEmptyRoomCleanupLocked(invite.RoomID)
	delete(s.shared.invites.byID, inviteID)
	if s.shared.invites.byRoom[invite.RoomID] == inviteID {
		delete(s.shared.invites.byRoom, invite.RoomID)
	}
	if s.shared.invites.byCode[invite.RoomCode] == inviteID {
		delete(s.shared.invites.byCode, invite.RoomCode)
	}
}

func (s *Server) cleanupInviteForRoomLocked(roomID string) {
	if inviteID := s.shared.invites.byRoom[roomID]; inviteID != "" {
		s.cleanupInviteByIDLocked(inviteID)
	}
}

func (s *Server) generateRoomCodeLocked() string {
	for {
		code := 100000 + rand.Intn(900000)
		roomCode := decimalCode(code)
		if _, exists := s.shared.invites.byCode[roomCode]; !exists && roomCode != s.shared.invites.defaultCode {
			return roomCode
		}
	}
}

func (s *Server) cleanupExpiredInvitesLocked(now time.Time) {
	for inviteID, invite := range s.shared.invites.byID {
		if inviteExpired(invite, now) {
			s.cleanupInviteByIDLocked(inviteID)
		}
	}
}

func inviteExpired(invite protocol.RoomInviteInfo, now time.Time) bool {
	return invite.ExpiresAt > 0 && invite.ExpiresAt < now.UnixMilli()
}

func defaultRoomInvite(code string) protocol.RoomInviteInfo {
	return protocol.RoomInviteInfo{
		InviteID:  "default-" + code,
		RoomID:    defaultRoomID,
		RoomCode:  code,
		JoinToken: "default-" + code,
		ExpiresAt: -1,
		Status:    protocol.InviteStatusActive,
	}
}

func decimalCode(value int) string {
	return string([]byte{
		byte('0' + value/100000%10),
		byte('0' + value/10000%10),
		byte('0' + value/1000%10),
		byte('0' + value/100%10),
		byte('0' + value/10%10),
		byte('0' + value%10),
	})
}
