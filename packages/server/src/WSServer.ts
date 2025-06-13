import type { Server } from 'node:http'
import { WebSocketServer, RawData, WebSocket } from 'ws'
import { Peer } from '@/Peer'
import { Action, HEART_BEAT, HEART_BEAT_TIME } from 'web-share-common'
import type { JoinRoomInfo, RoomInfo, SendData, SendUserInfo, UserInfo, RoomCodeInfo, JoinRoomCodeInfo } from 'web-share-common'


export class WSServer {

  ws: WebSocketServer
  opts: Required<WSServerOpts>
  /**
   * roomId -> Map<peerId, Peer>
   */
  roomMap = new Map<string, Map<string, Peer>>()
  /**
   * roomCode -> roomId 映射
   */
  roomCodeMap = new Map<string, string>()

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
        // 清理对应的房间码映射
        this.cleanupRoomCode(peer.roomId)
      }
    }
  }

  /**
   * 清理房间码映射
   */
  private cleanupRoomCode(roomId: string) {
    for (const [code, mappedRoomId] of this.roomCodeMap.entries()) {
      if (mappedRoomId === roomId) {
        this.roomCodeMap.delete(code)
        console.log(`清理房间码映射: ${code} -> ${roomId}`)
        break
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

  /**
   * 生成6位随机数字房间码
   */
  private generateRoomCode(): string {
    let code: string
    do {
      code = Math.floor(100000 + Math.random() * 900000).toString()
    } while (this.roomCodeMap.has(code))
    return code
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
        const data = msg.data as UserInfo
        if (data.roomId) {
          this.addToNewRoom(sender, data.roomId)
        }

        this.notifyUserInfo(sender)
        this.broadcastToRoom(sender.roomId, {
          type: Action.JoinRoom,
          data: this.getRoomUsers(sender.roomId)
        })
        break

      case Action.LeaveRoom:
        this.broadcastToRoom(sender.roomId, {
          type: Action.LeaveRoom,
          data: msg.data
        })
        break

      // 用户 A 请求创建一个用于直接连接的房间
      case Action.CreateDirectRoom:
        const directRoomId = `direct_${crypto.randomUUID()}`
        // 将用户 A 移动到这个新房间
        this.addToNewRoom(sender, directRoomId)
        // 通知用户 A 新的房间 ID，以便生成二维码
        const roomInfo: RoomInfo = {
          roomId: directRoomId,
          peerInfo: sender.getInfo()
        }
        this.send(sender, { type: Action.DirectRoomCreated, data: roomInfo })
        break

      // 用户 B 通过扫码请求加入指定房间
      case Action.JoinDirectRoom:
        const { roomId, peerId } = msg.data as JoinRoomInfo
        const roomToJoin = this.roomMap.get(roomId)

        if (roomToJoin?.has(peerId)) {
          this.addToNewRoom(sender, roomId)

          // 通知房间内的所有用户（主要是用户 A 和用户 B）有新用户加入
          this.notifyUserInfo(sender) // 通知 B 自己的信息
          this.broadcastToRoom(roomId, {
            type: Action.JoinRoom,
            data: this.getRoomUsers(roomId)
          })
        }
        else {
          this.send(sender, { type: Action.Error, data: { message: '指定的房间或用户不存在' } })
        }
        break

      // 用户请求创建带连接码的房间
      case Action.CreateRoomWithCode:
        const roomCode = this.generateRoomCode()
        const codeRoomId = `code_${crypto.randomUUID()}`

        // 建立房间码到房间ID的映射
        this.roomCodeMap.set(roomCode, codeRoomId)

        // 将用户移动到新房间
        this.addToNewRoom(sender, codeRoomId)

        // 通知用户房间码创建成功
        const roomCodeInfo: RoomCodeInfo = {
          roomCode,
          roomId: codeRoomId,
          peerInfo: sender.getInfo()
        }
        this.send(sender, { type: Action.RoomCodeCreated, data: roomCodeInfo })
        console.log(`用户 ${sender.name.displayName} 创建房间码: ${roomCode}`)
        break

      // 用户通过房间码加入房间
      case Action.JoinRoomWithCode:
        const { roomCode: joinCode } = msg.data as JoinRoomCodeInfo
        const targetRoomId = this.roomCodeMap.get(joinCode)

        if (targetRoomId && this.roomMap.has(targetRoomId)) {
          this.addToNewRoom(sender, targetRoomId)

          // 通知加入者自己的信息
          this.notifyUserInfo(sender)

          // 通知房间内所有用户有新用户加入
          this.broadcastToRoom(targetRoomId, {
            type: Action.JoinRoom,
            data: this.getRoomUsers(targetRoomId)
          })

          console.log(`用户 ${sender.name.displayName} 通过房间码 ${joinCode} 加入房间: ${targetRoomId}`)
        }
        else {
          this.send(sender, { type: Action.Error, data: { message: '房间码不存在或已过期' } })
        }
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

  private addToNewRoom(peer: Peer, roomId: string) {
    this.removePeerFromRoom(peer)   // 从旧房间移除
    peer.roomId = roomId      // 更新用户的 roomId
    this.addPeerToRoom(peer)        // 加入新房间
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
