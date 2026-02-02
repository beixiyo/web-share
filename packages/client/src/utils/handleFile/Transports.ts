import type { RTCBaseData } from 'web-share-common'
import type { ITransport } from './Transport'
import type { RTCConnect } from '@/ClientServer/RTCConnect'
import type { ServerConnection } from '@/ClientServer/ServerConnection'

/**
 * WebRTC 传输实现
 */
export class RTCTransport implements ITransport {
  constructor(private rtcConnect: RTCConnect) {}

  sendJSON<T>(data: RTCBaseData<T>) {
    this.rtcConnect.sendJSON(data)
  }

  send(data: ArrayBuffer) {
    this.rtcConnect.send(new Uint8Array(data))
  }

  isClosed() {
    return this.rtcConnect.isChannelClose
  }

  isAmountHigh() {
    return this.rtcConnect.channelAmountIsHigh
  }

  waitUntilIdle() {
    return this.rtcConnect.waitUntilChannelIdle()
  }

  get type(): 'rtc' {
    return 'rtc'
  }
}

/**
 * WebSocket 传输实现（中转模式）
 */
export class WSTransport implements ITransport {
  constructor(
    private server: ServerConnection,
    private toId: string,
  ) {}

  sendJSON<T>(data: RTCBaseData<T>) {
    /** JSON 消息直接通过服务器 relay 中转 */
    this.server.relay({
      ...data,
      toId: this.toId,
      fromId: this.server.userInfo.peerId,
    })
  }

  send(data: ArrayBuffer) {
    /** 二进制数据通过专用 sendBinary 方法发送 */
    this.server.sendBinary(this.toId, data)
  }

  isClosed() {
    /** WebSocket 连接通常比 RTC 更稳定，这里简单检查是否已连接 */
    return !this.server.isConnected
  }

  isAmountHigh() {
    /**
     * WebSocket 传输在浏览器端通常没有像 RTC 那样的 bufferedAmount 限制暴露，
     * 或者我们可以通过 WebSocket 实例的 bufferedAmount 检查。
     */
    const socket = this.server.server?.socket
    return (socket?.bufferedAmount || 0) > 1024 * 1024 // 1MB 阈值
  }

  async waitUntilIdle() {
    /** 简单的等待逻辑 */
    while (this.isAmountHigh()) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }

  get type(): 'ws' {
    return 'ws'
  }
}
