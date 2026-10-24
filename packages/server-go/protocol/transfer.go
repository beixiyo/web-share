// 本文件定义点对点消息目标、传输进度和 WebRTC 错误。
package protocol

// To 标识点对点消息的发送方和接收方
type To struct {
	ToID   string `json:"toId"`
	FromID string `json:"fromId"`
}

// ProgressData 报告文件传输进度
type ProgressData struct {
	Progress float64 `json:"progress"`
	Total    int64   `json:"total"`
	CurIndex int64   `json:"curIndex"`
	Filename string  `json:"filename"`
}

// RTCErrorInfo 描述 peer 报告的 WebRTC 错误
type RTCErrorInfo struct {
	ErrorMessage string `json:"errorMessage"`
	ErrorType    string `json:"errorType"`
	FromPeerID   string `json:"fromPeerId"`
	Timestamp    int64  `json:"timestamp"`
}
