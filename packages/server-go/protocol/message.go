// 本文件定义通用消息封装
package protocol

// SendData 是通用的 WebSocket 消息封装
type SendData[D any, T ~string] struct {
	Type T `json:"type"`
	Data D `json:"data"`
}

// SendUserInfo 是用于返回当前用户信息的消息封装
type SendUserInfo = SendData[UserInfo, Action]
