import type { RTCBaseData } from 'web-share-common'

/**
 * 传输层接口，用于统一 RTC DataChannel 和 WebSocket 传输
 */
export interface ITransport {
  /** 发送 JSON 消息 */
  sendJSON: <T>(data: RTCBaseData<T>) => void
  /** 发送二进制数据 */
  send: (data: ArrayBuffer) => void
  /** 检查传输是否已关闭 */
  isClosed: () => boolean
  /** 检查缓冲区是否过高（流控） */
  isAmountHigh: () => boolean
  /** 等待传输空闲 */
  waitUntilIdle: () => Promise<void>
  /** 传输类型 */
  type: 'rtc' | 'ws'
}
