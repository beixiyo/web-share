// 本文件定义邀请凭据、状态及失效通知。
package protocol

// JoinInviteInfo 包含通过邀请加入所需的凭据
type JoinInviteInfo struct {
	InviteID  string `json:"inviteId"`
	JoinToken string `json:"joinToken"`
}

// InviteStatus 描述邀请的生命周期状态
//
// @default 'active'
type InviteStatus string

const (
	InviteStatusActive  InviteStatus = "active"
	InviteStatusExpired InviteStatus = "expired"
	InviteStatusInvalid InviteStatus = "invalid"
)

// RoomInviteInfo 描述当前关联到房间的邀请
type RoomInviteInfo struct {
	InviteID  string       `json:"inviteId"`
	RoomID    string       `json:"roomId"`
	RoomCode  string       `json:"roomCode"`
	JoinToken string       `json:"joinToken"`
	ExpiresAt int64        `json:"expiresAt"`
	Status    InviteStatus `json:"status"`
}

// InviteInvalidatedReason 说明邀请失效的原因
type InviteInvalidatedReason string

const (
	InviteInvalidatedReasonExpired         InviteInvalidatedReason = "expired"
	InviteInvalidatedReasonNotFound        InviteInvalidatedReason = "not_found"
	InviteInvalidatedReasonRoomUnavailable InviteInvalidatedReason = "room_unavailable"
	InviteInvalidatedReasonRestarted       InviteInvalidatedReason = "restarted"
	InviteInvalidatedReasonRevoked         InviteInvalidatedReason = "revoked"
	InviteInvalidatedReasonNoActiveInvite  InviteInvalidatedReason = "no_active_invite"
)

// InviteInvalidatedInfo 通知 peer 邀请已失效
type InviteInvalidatedInfo struct {
	InviteID *string                 `json:"inviteId,omitempty"`
	RoomCode *string                 `json:"roomCode,omitempty"`
	Reason   InviteInvalidatedReason `json:"reason"`
	Message  string                  `json:"message"`
}
