import type { WebSocket } from 'ws'
/** 有界 WebSocket 发送，慢连接超过累计队列限制时终止，避免挤占整个服务的内存 */
import { Buffer } from 'node:buffer'

/** 单连接待发送队列的上限，包含本次消息的 UTF-8 字节数 */
export const MAX_SEND_QUEUE_BYTES = 16 * 1024 * 1024

/** 发送已序列化消息；连接不再可用或发送队列超限时返回 false，并终止超限/发送失败的连接 */
export function sendOrTerminateSlowSocket(socket: WebSocket, message: string): boolean {
  if (socket.readyState !== socket.OPEN)
    return false

  if (socket.bufferedAmount + Buffer.byteLength(message) > MAX_SEND_QUEUE_BYTES) {
    socket.terminate()
    return false
  }

  try {
    socket.send(message)
    return true
  }
  catch (error) {
    console.warn('WebSocket 消息发送失败:', error)
    socket.terminate()
    return false
  }
}
