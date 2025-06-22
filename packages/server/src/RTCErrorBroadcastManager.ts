/**
 * RTC错误广播管理器 - 防止服务端错误广播无限循环
 */
export class RTCErrorBroadcastManager {
  private broadcastHistory: Map<string, Map<string, number[]>> = new Map()
  /** 5秒窗口 */
  private readonly BROADCAST_WINDOW = 5000
  /** 最大广播次数 */
  private readonly MAX_BROADCASTS = 3

  /**
   * 检查是否可以广播错误
   */
  canBroadcast(roomId: string, errorType: string): boolean {
    const now = Date.now()

    if (!this.broadcastHistory.has(roomId)) {
      this.broadcastHistory.set(roomId, new Map())
    }

    const roomHistory = this.broadcastHistory.get(roomId)!
    const errorHistory = roomHistory.get(errorType) || []

    /** 清理过期记录 */
    const validHistory = errorHistory.filter(time => now - time < this.BROADCAST_WINDOW)

    if (validHistory.length >= this.MAX_BROADCASTS) {
      console.warn(`房间 ${roomId} 的错误类型 ${errorType} 在 ${this.BROADCAST_WINDOW}ms 内已达到最大广播次数 ${this.MAX_BROADCASTS}`)
      return false
    }

    validHistory.push(now)
    roomHistory.set(errorType, validHistory)
    return true
  }

  /**
   * 清理过期的广播记录
   */
  cleanup(): void {
    const now = Date.now()
    for (const [roomId, roomHistory] of this.broadcastHistory.entries()) {
      for (const [errorType, history] of roomHistory.entries()) {
        const validHistory = history.filter(time => now - time < this.BROADCAST_WINDOW)
        if (validHistory.length === 0) {
          roomHistory.delete(errorType)
        }
        else {
          roomHistory.set(errorType, validHistory)
        }
      }

      /** 如果房间没有任何错误记录，删除房间记录 */
      if (roomHistory.size === 0) {
        this.broadcastHistory.delete(roomId)
      }
    }
  }
}
