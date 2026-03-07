import type { Peer } from '@/Peer'

/**
 * 设备重连检测：按 deviceKey 记录设备对应的 peer，检测同设备新连接时返回旧 peer 信息。
 * 单一职责：设备标识与重连判定，不执行移除/广播。
 * 时间窗口应与断连宽限期 disconnectDelay 一致，由 WSServer 注入。
 */
export class DeviceReconnectManager {
  /**
   * 同设备在此窗口内（距 lastSeen）再次连接视为重连，应与 disconnectDelay 一致。
   */
  private reconnectWindowMs: number

  constructor(reconnectWindowMs: number) {
    this.reconnectWindowMs = reconnectWindowMs
  }

  /**
   * deviceKey -> { peerId, roomId, displayName, lastSeen }
   */
  private deviceMap = new Map<string, {
    peerId: string
    roomId: string
    displayName: string
    lastSeen: number
  }>()

  /**
   * 生成设备唯一标识（IP + 设备名 + 浏览器）
   */
  getDeviceKey(peer: Peer): string {
    return `${peer.ip}_${peer.name.deviceName}_${peer.name.browser}`
      .replace(/\s+/g, '_')
      .toLowerCase()
  }

  /**
   * 检测是否为同设备重连。若是且旧连接在窗口内，返回 { oldPeerId, oldRoomId } 并更新设备映射；
   * 否则仅更新设备映射，返回 null。
   */
  detectReconnection(peer: Peer): { oldPeerId: string, oldRoomId: string } | null {
    const deviceKey = this.getDeviceKey(peer)
    const existing = this.deviceMap.get(deviceKey)

    if (existing && existing.peerId !== peer.id) {
      const timeSinceLastSeen = Date.now() - existing.lastSeen
      if (timeSinceLastSeen < this.reconnectWindowMs) {
        const result = { oldPeerId: existing.peerId, oldRoomId: existing.roomId }
        this.updateDevice(peer)
        return result
      }
    }

    this.updateDevice(peer)
    return null
  }

  /** 移除该 peer 对应的设备映射（仅当当前映射的 peerId 一致时删除） */
  cleanupDevice(peer: Peer) {
    const deviceKey = this.getDeviceKey(peer)
    const existing = this.deviceMap.get(deviceKey)
    if (existing && existing.peerId === peer.id) {
      this.deviceMap.delete(deviceKey)
      console.log(`清理设备映射: ${deviceKey}`)
    }
  }

  /** 更新该 peer 对应设备的 lastSeen */
  updateLastSeen(peer: Peer) {
    const deviceKey = this.getDeviceKey(peer)
    const existing = this.deviceMap.get(deviceKey)
    if (existing && existing.peerId === peer.id)
      existing.lastSeen = Date.now()
  }

  private updateDevice(peer: Peer) {
    const deviceKey = this.getDeviceKey(peer)
    this.deviceMap.set(deviceKey, {
      peerId: peer.id,
      roomId: peer.roomId,
      displayName: peer.name.displayName,
      lastSeen: Date.now(),
    })
  }
}
