// 本文件定义用户信息、设备名称和 peer 标识常量
package protocol

// PeerIDQueryKey 是浏览器中存储本地 peer ID 的键
const PeerIDQueryKey = "__web-share__peerId"

// ResumeTokenQueryKey 是握手时恢复服务端会话使用的私有令牌键
const ResumeTokenQueryKey = "__web-share__resumeToken"

// UserInfo 描述已连接的 peer
type UserInfo struct {
	PeerID string `json:"peerId"`
	RoomID string `json:"roomId"`

	Name Name `json:"name"`

	// ResumeToken 仅随 NotifyUserInfo 私发给当前连接，不得包含在成员列表或广播中
	ResumeToken *string `json:"resumeToken,omitempty"`
}

// UserReconnectedInfo 将 peer 的旧 ID 映射到替换后的 ID
type UserReconnectedInfo struct {
	OldPeerID string   `json:"oldPeerId"`
	NewPeerID string   `json:"newPeerId"`
	UserInfo  UserInfo `json:"userInfo"`
}

// Name 包含 peer 的显示名称和平台信息
type Name struct {
	Model       string `json:"model"`
	OS          string `json:"os"`
	Browser     string `json:"browser"`
	Type        string `json:"type"`
	DeviceName  string `json:"deviceName"`
	DisplayName string `json:"displayName"`
}
