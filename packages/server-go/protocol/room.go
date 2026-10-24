// 本文件定义房间信息、加入消息和房间码常量。
package protocol

// RoomCodeLength 是房间码的字符数
const RoomCodeLength = 6

// RoomInfo 描述房间及请求该房间的 peer
type RoomInfo struct {
	RoomID string `json:"roomId"`

	PeerInfo UserInfo `json:"peerInfo"`
}

// JoinRoomInfo 标识房间和 peer
type JoinRoomInfo struct {
	RoomID string `json:"roomId"`
	PeerID string `json:"peerId"`
}

// RoomCodeInfo 描述由短码标识的房间
type RoomCodeInfo struct {
	RoomCode string   `json:"roomCode"`
	RoomID   string   `json:"roomId"`
	PeerInfo UserInfo `json:"peerInfo"`
}

// JoinRoomCodeInfo 包含用于加入房间的房间码
type JoinRoomCodeInfo struct {
	RoomCode string `json:"roomCode"`
}

// RoomCodeExpiredInfo 表示房间码已过期
type RoomCodeExpiredInfo struct {
	RoomCode string `json:"roomCode"`
	Message  string `json:"message"`
}
