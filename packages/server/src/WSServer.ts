import type { Server } from 'node:http'
import { WebSocketServer, RawData, WebSocket } from 'ws'
import { Peer } from '@/Peer'
import { Action, HEART_BEAT, HEART_BEAT_TIME } from 'web-share-common'
import type { SendData, SendUserInfo } from 'web-share-common';


export class WSServer {

  ws: WebSocketServer
  opts: Required<WSServerOpts>
  /**
   * roomId -> Map<peerId, Peer>
   */
  roomMap = new Map<string, Map<string, Peer>>()

  constructor(
    server: Server,
    opts: WSServerOpts = {}
  ) {
    const defaultOpts: Required<WSServerOpts> = {
      clearTime: HEART_BEAT_TIME
    }
    this.opts = Object.assign(opts, defaultOpts)

    this.ws = new WebSocketServer({ server })
    this.ws.on('connection', (socket, request) => {
      const peer = new Peer(socket, request)

      // 将用户添加到对应房间
      this.addPeerToRoom(peer)
      this.onConnection(peer)
    })

    this.keepAliveClear()
  }

  /**
   * 将用户添加到对应房间
   */
  private addPeerToRoom(peer: Peer) {
    if (!this.roomMap.has(peer.roomId)) {
      this.roomMap.set(peer.roomId, new Map())
    }
    this.roomMap.get(peer.roomId)!.set(peer.id, peer)

    console.log(`用户 ${peer.name.displayName} (${peer.ip}) 加入房间: ${peer.roomId}`)
  }

  /**
   * 从房间中移除用户
   */
  private removePeerFromRoom(peer: Peer) {
    const room = this.roomMap.get(peer.roomId)
    if (room) {
      room.delete(peer.id)
      if (room.size === 0) {
        this.roomMap.delete(peer.roomId)
      }
    }
  }

  /**
   * 获取指定房间的所有用户
   */
  private getRoomUsers(roomId: string) {
    const room = this.roomMap.get(roomId)
    if (!room) return []
    return Array.from(room.values()).map(peer => peer.getInfo())
  }

  /**
   * 获取指定房间的用户
   */
  private getRoomPeer(roomId: string, peerId: string): Peer | undefined {
    return this.roomMap.get(roomId)?.get(peerId)
  }

  /**
   * 向房间内广播（排除指定用户）
   */
  private broadcastToRoom(roomId: string, data: any, excludeId?: string) {
    const room = this.roomMap.get(roomId)
    if (!room) return

    room.forEach(peer => {
      if (peer.id === excludeId) return
      this.send(peer, data)
    })
  }

  private onConnection = (peer: Peer) => {
    const { socket } = peer
    socket.on('message', (data) => this.onMessage(peer, data))
  }

  private send<T = any>(sender: Peer, data: SendData<T>) {
    sender.socket.send(JSON.stringify(data))
  }

  /**
   * 发给指定用户（需要在同一房间）
   */
  private sendTo<T>(fromPeer: Peer, toId: string, data: SendData<T>) {
    const targetPeer = this.getRoomPeer(fromPeer.roomId, toId)
    if (!targetPeer) {
      console.warn(`目标用户 ${toId} 不在房间 ${fromPeer.roomId} 中`)
      return
    }
    this.send(targetPeer, data)
  }

  /**
   * 通知连接者自己的信息
   */
  private notifyUserInfo(peer: Peer) {
    const data: SendUserInfo = {
      data: peer.getInfo(),
      type: Action.NotifyUserInfo
    }
    this.send(peer, data)
  }

  private onMessage = (sender: Peer, data: RawData) => {
    let msg: SendData
    try {
      msg = JSON.parse(data.toString())
    }
    catch (e) {
      console.warn("WS: Received JSON is malformed")
      return
    }

    switch (msg.type) {
      case Action.Close:
        sender.socket.terminate()
        break
      case Action.Ping:
        sender[HEART_BEAT] = Date.now()
        this.send(sender, { type: Action.Ping, data: null })
        break

      case Action.JoinRoom:
        this.notifyUserInfo(sender)
        // 只向同一房间的用户广播
        this.broadcastToRoom(sender.roomId, {
          type: Action.JoinRoom,
          data: this.getRoomUsers(sender.roomId)
        })
        break

      case Action.LeaveRoom:
        // 只向同一房间广播
        this.broadcastToRoom(sender.roomId, {
          type: Action.LeaveRoom,
          data: msg.data
        })
        break

      case Action.Relay:
        const relayData = msg.data
        // 确保只能向同一房间的用户发送
        this.sendTo(sender, relayData.toId, relayData)
        break

      default:
        break
    }
  }

  /**
   * 心跳检测，定时清理离线连接者
   */
  private keepAliveClear() {
    setInterval(() => {
      // 按房间显示客户端信息
      this.roomMap.forEach((room, roomId) => {
        if (room.size > 0) {
          const clients = Array.from(room.values())
            .map(peer => peer.name.displayName)
            .join(', ')
          console.log(`房间 ${roomId}: ${clients}`)
        }
      })

      const peersToRemove: Peer[] = []

      this.roomMap.forEach((room, roomId) => {
        room.forEach(peer => {
          const now = Date.now()
          let shouldRemove = false
          let reason = ''

          if (now - peer[HEART_BEAT] > this.opts.clearTime) {
            shouldRemove = true
            reason = '超时'
          }
          else if (!peer.socket) {
            shouldRemove = true
            reason = '没有连接'
          }
          else if (peer.socket.readyState === WebSocket.CLOSED) {
            shouldRemove = true
            reason = '客户端已关闭'
          }

          if (shouldRemove) {
            console.log(`${peer.name.displayName} 被清理了，原因是${reason}`)
            peersToRemove.push(peer)
          }
        })
      })

      // 移除离线用户并通知房间内其他用户
      peersToRemove.forEach(peer => {
        this.removePeerFromRoom(peer)
        this.broadcastToRoom(peer.roomId, {
          type: Action.LeaveRoom,
          data: peer.getInfo()
        })
      })
    }, this.opts.clearTime)
  }
}


export type WSServerOpts = {
  /**
   * 清理离线连接者的时间间隔
   * @default 1000 * 8
   */
  clearTime?: number
}
