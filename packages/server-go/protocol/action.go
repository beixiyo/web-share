// 本文件定义 WebSocket 消息动作及其取值
package protocol

// Action 标识 WebSocket 消息类型
type Action string

const (
	ActionClose             Action = "Close"
	ActionPing              Action = "Ping"
	ActionNotifyUserInfo    Action = "NotifyUserInfo"
	ActionJoinRoom          Action = "JoinRoom"
	ActionLeaveRoom         Action = "LeaveRoom"
	ActionJoinRoomByQRCode  Action = "JoinRoomByQRCode"
	ActionJoinRoomByInvite  Action = "JoinRoomByInvite"
	ActionJoinRoomByCode    Action = "JoinRoomByCode"
	ActionRoomCodeExpired   Action = "RoomCodeExpired"
	ActionUserReconnected   Action = "UserReconnected"
	ActionGetOrCreateInvite Action = "GetOrCreateInvite"
	ActionGetCurrentInvite  Action = "GetCurrentInvite"
	ActionInviteCreated     Action = "InviteCreated"
	ActionInviteInvalidated Action = "InviteInvalidated"
	ActionRefreshInvite     Action = "RefreshInvite"
	ActionRelay             Action = "Relay"
	ActionOffer             Action = "Offer"
	ActionAnswer            Action = "Answer"
	ActionCandidate         Action = "Candidate"
	ActionText              Action = "Text"
	ActionFileMetas         Action = "FileMetas"
	ActionDenyFile          Action = "DenyFile"
	ActionFileBufferIndex   Action = "FileBufferIndex"
	ActionNewFile           Action = "NewFile"
	ActionFileDone          Action = "FileDone"
	ActionProgress          Action = "Progress"
	ActionError             Action = "Error"
	ActionRTCError          Action = "RTCError"
	ActionRTCErrorBroadcast Action = "RTCErrorBroadcast"
	ActionResumeInfo        Action = "ResumeInfo"
)
