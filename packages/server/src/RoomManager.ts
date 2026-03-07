import type { SendData, UserInfo, UserReconnectedInfo } from 'web-share-common'
import { Peer } from '@/Peer'

/**
 * 房间管理：维护 roomId -> Map<peerId, Peer>，提供加入/移除/广播/查询。
 * 单一职责：房间与成员的生命周期，不关心邀请、设备、断连延迟。
 */
export class RoomManager {
  /**
   * roomId -> Map<peerId, Peer>
   */
  private roomMap = new Map<string, Map<string, Peer>>()

  /** 房间变为空时回调（由外部在组合时挂接邀请清理等） */
  private onRoomEmpty: (roomId: string) => void = () => {}

  setOnRoomEmpty(cb: (roomId: string) => void) {
    this.onRoomEmpty = cb
  }

  hasActiveRoom(roomId: string): boolean {
    const room = this.roomMap.get(roomId)
    return !!(room && room.size > 0)
  }

  addPeer(peer: Peer) {
    if (!this.roomMap.has(peer.roomId)) {
      this.roomMap.set(peer.roomId, new Map())
    }
    this.roomMap.get(peer.roomId)!.set(peer.id, peer)
  }

  removePeer(peer: Peer): boolean {
    const room = this.roomMap.get(peer.roomId)
    if (!room || !room.has(peer.id))
      return false
    if (room.get(peer.id) !== peer)
      return false

    room.delete(peer.id)
    if (room.size === 0) {
      this.roomMap.delete(peer.roomId)
      this.onRoomEmpty(peer.roomId)
    }
    return true
  }

  getRoomPeer(roomId: string, peerId: string): Peer | undefined {
    return this.roomMap.get(roomId)?.get(peerId)
  }

  hasPeer(roomId: string, peerId: string): boolean {
    return this.roomMap.get(roomId)?.has(peerId) ?? false
  }

  /** 根据 peerId 在任意房间查找 Peer（用于重连时移除旧连接） */
  getPeerById(peerId: string): Peer | undefined {
    for (const room of this.roomMap.values()) {
      const peer = room.get(peerId)
      if (peer)
        return peer
    }
    return undefined
  }

  getRoomUsers(roomId: string): UserInfo[] {
    const room = this.roomMap.get(roomId)
    if (!room)
      return []
    return Array.from(room.values()).map(p => p.getInfo())
  }

  broadcastToRoom<T = UserInfo[] | UserInfo | UserReconnectedInfo>(
    roomId: string,
    data: SendData<T>,
    excludePeerId?: string,
  ) {
    const room = this.roomMap.get(roomId)
    if (!room)
      return
    room.forEach((peer) => {
      if (peer.id === excludePeerId)
        return
      peer.socket.send(JSON.stringify(data))
    })
  }

  /** 供心跳清理等遍历所有 peer 使用 */
  forEachPeer(fn: (peer: Peer) => void) {
    this.roomMap.forEach(room => room.forEach(fn))
  }

  /** 供心跳清理收集待移除的 peer */
  getRoomMap() {
    return this.roomMap
  }
}
