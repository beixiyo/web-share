import type { Peer } from '@/Peer'

/**
 * 断连延迟调度：WebSocket 关闭后延迟一段时间再执行真正断开，便于移动端切后台重连。
 * 单一职责：只做“延迟 + 一次执行”，具体移除与广播由外部回调完成。
 */
export class DisconnectScheduler {
  private pendingDisconnects = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private disconnectDelayMs: number,
    /** 真正执行断开时调用（移除 peer、广播离开等） */
    private onExecuteDisconnect: (peer: Peer) => void,
  ) {}

  /** 取消该 peer 的待执行断开 */
  cancel(peerId: string) {
    const timeout = this.pendingDisconnects.get(peerId)
    if (!timeout)
      return
    clearTimeout(timeout)
    this.pendingDisconnects.delete(peerId)
  }

  hasPending(peerId: string): boolean {
    return this.pendingDisconnects.has(peerId)
  }

  /**
   * 安排断开：immediate 则立即执行，否则延迟 disconnectDelayMs 后执行。
   */
  scheduleDisconnect(peer: Peer, immediate = false) {
    if (immediate) {
      this.onExecuteDisconnect(peer)
      return
    }
    this.cancel(peer.id)
    console.log(`延迟处理用户断开连接: ${peer.name.displayName} (${this.disconnectDelayMs}ms)`)
    const timeout = setTimeout(() => {
      this.pendingDisconnects.delete(peer.id)
      this.onExecuteDisconnect(peer)
    }, this.disconnectDelayMs)
    this.pendingDisconnects.set(peer.id, timeout)
  }
}
