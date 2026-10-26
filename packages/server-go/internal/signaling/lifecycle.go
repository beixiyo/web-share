// 本文件负责断开连接计时器、房间清理和定期维护
package signaling

import (
	"time"

	"github.com/beixiyo/web-share/packages/server-go/protocol"
)

// markOfflineLocked 只处理在线成员，离线后的 session 仍可用于精确恢复
func (s *Server) markOfflineLocked(p *peer) []outbound {
	if !s.removePeerLocked(p) {
		return nil
	}
	return s.roomBroadcastLocked(p.shared.roomID, protocol.ActionLeaveRoom, p.userInfo(p.shared.roomID), "")
}

// executeDisconnectLocked 结束会话；即使已经离线，也必须撤销令牌及过期任务
func (s *Server) executeDisconnectLocked(p *peer) []outbound {
	if !s.isCurrentSessionLocked(p) {
		return nil
	}
	messages := s.markOfflineLocked(p)
	s.cancelDisconnectLocked(p)
	s.cleanupSessionLocked(p)
	p.retired.Store(true)
	p.stopWriter()
	return messages
}

func (s *Server) scheduleDisconnect(p *peer, immediate bool) {
	s.shared.mu.Lock()
	if !s.isCurrentSessionLocked(p) {
		s.shared.mu.Unlock()
		return
	}
	if immediate {
		messages := s.executeDisconnectLocked(p)
		s.enqueueBatchLocked(messages)
		s.shared.mu.Unlock()
		return
	}
	// 正常关闭立即离线并提交通知，宽限计时器只保留恢复身份
	// 重复关闭回调既不重复广播，也不延长现有过期时间
	s.enqueueBatchLocked(s.markOfflineLocked(p))
	if s.shared.disconnects[p] != nil {
		s.shared.mu.Unlock()
		return
	}
	job := &disconnectJob{}
	s.shared.disconnects[p] = job

	// AfterFunc 的回调在 timer 所属的独立 goroutine 中运行，因此仍要重新取得服务锁
	job.timer = time.AfterFunc(s.options.DisconnectDelay, func() {
		s.shared.mu.Lock()
		if s.shared.closed || s.shared.disconnects[p] != job {
			s.shared.mu.Unlock()
			return
		}
		delete(s.shared.disconnects, p)
		messages := s.executeDisconnectLocked(p)
		s.enqueueBatchLocked(messages)
		s.shared.mu.Unlock()
	})
	s.shared.mu.Unlock()
}

func (s *Server) cancelDisconnectLocked(p *peer) {
	if job := s.shared.disconnects[p]; job != nil {
		if job.timer != nil {
			job.timer.Stop()
		}
		delete(s.shared.disconnects, p)
	}
}

func (s *Server) scheduleEmptyRoomCleanupLocked(roomID string) {
	s.cancelEmptyRoomCleanupLocked(roomID)
	if s.options.RoomEmptyGrace <= 0 {
		s.cleanupInviteForRoomLocked(roomID)
		return
	}
	job := &roomCleanupJob{}
	s.shared.emptyRoomCleanups[roomID] = job

	// 计时器到期时房间可能已重新有人；回调会在锁内复查当前状态
	job.timer = time.AfterFunc(s.options.RoomEmptyGrace, func() {
		s.shared.mu.Lock()
		if s.shared.closed || s.shared.emptyRoomCleanups[roomID] != job {
			s.shared.mu.Unlock()
			return
		}
		delete(s.shared.emptyRoomCleanups, roomID)

		if !s.hasActiveRoomLocked(roomID) {
			s.cleanupInviteForRoomLocked(roomID)
		}
		s.shared.mu.Unlock()
	})
}

func (s *Server) cancelEmptyRoomCleanupLocked(roomID string) {
	if job := s.shared.emptyRoomCleanups[roomID]; job != nil {
		if job.timer != nil {
			job.timer.Stop()
		}
		delete(s.shared.emptyRoomCleanups, roomID)
	}
}

func (s *Server) canBroadcastRTCErrorLocked(roomID string, errorType string, now time.Time) bool {
	roomHistory := s.shared.rtcErrors[roomID]
	if roomHistory == nil {
		roomHistory = make(map[string][]time.Time)
		s.shared.rtcErrors[roomID] = roomHistory
	}
	history := roomHistory[errorType]
	valid := history[:0]
	for _, timestamp := range history {
		if now.Sub(timestamp) < rtcErrorWindow {
			valid = append(valid, timestamp)
		}
	}
	if len(valid) >= rtcErrorMaxCount {
		roomHistory[errorType] = valid
		return false
	}
	roomHistory[errorType] = append(valid, now)
	return true
}

func (s *Server) handleExpiredCleanup() {
	now := time.Now()
	s.shared.mu.Lock()
	s.cleanupExpiredInvitesLocked(now)
	for roomID, roomHistory := range s.shared.rtcErrors {
		for errorType, history := range roomHistory {
			valid := history[:0]
			for _, timestamp := range history {
				if now.Sub(timestamp) < rtcErrorWindow {
					valid = append(valid, timestamp)
				}
			}
			if len(valid) == 0 {
				delete(roomHistory, errorType)
			} else {
				roomHistory[errorType] = valid
			}
		}
		if len(roomHistory) == 0 {
			delete(s.shared.rtcErrors, roomID)
		}
	}
	s.shared.mu.Unlock()
}

func (s *Server) sweepKeepalive() {
	deadline := time.Now().Add(-s.options.ClearTime)
	// HTTP 连接处理也会改 rooms；持锁收集并提交断开，避免遍历期间成员被增删
	s.shared.mu.Lock()
	var stalePeers []*peer

	for _, room := range s.shared.rooms {
		for _, p := range room.members {
			lastHeartbeat := time.Unix(0, p.lastHeartbeat.Load())
			// 已检测关闭的连接由 reader 即时离线，巡检不影响其会话恢复宽限
			if p.socketClosed.Load() {
				continue
			}
			if lastHeartbeat.Before(deadline) {
				stalePeers = append(stalePeers, p)
			}
		}
	}

	var messages []outbound
	for _, p := range stalePeers {
		messages = append(messages, s.executeDisconnectLocked(p)...)
	}
	s.enqueueBatchLocked(messages)
	s.shared.mu.Unlock()
}

func (s *Server) runCleanupLoop() {
	defer s.backgroundWG.Done()
	clearInterval := s.options.ClearTime
	if clearInterval <= 0 {
		clearInterval = time.Millisecond
	}
	keepaliveTicker := time.NewTicker(clearInterval)
	cleanupTicker := time.NewTicker(cleanupPeriod)
	defer keepaliveTicker.Stop()
	defer cleanupTicker.Stop()

	// 这是一个长期运行的 goroutine；select 每轮等待停止信号或任一 ticker 通知
	for {
		select {
		case <-s.ctx.Done():
			return
		case <-keepaliveTicker.C:
			s.sweepKeepalive()
		case <-cleanupTicker.C:
			s.handleExpiredCleanup()
		}
	}
}
