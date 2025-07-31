import type { Server } from 'node:http'
import type { JoinRoomCodeInfo, JoinRoomInfo, RoomCodeInfo, RoomInfo, SendData, SendUserInfo, UserInfo, UserReconnectedInfo } from 'web-share-common'
import type { RawData } from 'ws'
import { Action, ErrorCode, HEART_BEAT, HEART_BEAT_TIME } from 'web-share-common'
import { WebSocket, WebSocketServer } from 'ws'
import { Peer } from '@/Peer'
import { RTCErrorBroadcastManager } from './RTCErrorBroadcastManager'

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
  /**
   * 用户设备信息映射，用于检测重连
   * deviceKey -> { peerId, roomId, displayName, lastSeen }
   */
  deviceMap = new Map<string, {
    peerId: string
    roomId: string
    displayName: string
    lastSeen: number
  }>()

  private rtcErrorBroadcastManager: RTCErrorBroadcastManager

  constructor(
    server: Server,
    opts: WSServerOpts = {},
  ) {
    const defaultOpts: Required<WSServerOpts> = {
      clearTime: HEART_BEAT_TIME * 1.5,
    }
    this.opts = Object.assign(opts, defaultOpts)

    this.ws = new WebSocketServer({ server })
    this.ws.on('connection', (socket, request) => {
      const peer = new Peer(socket, request)

      /** 将用户添加到对应房间 */
      this.addPeerToRoom(peer)
      this.onConnection(peer)
    })

    this.keepAliveClear()

    /** 全局错误广播管理器实例 */
    this.rtcErrorBroadcastManager = new RTCErrorBroadcastManager()

    /** 定期清理过期记录 */
    setInterval(() => {
      this.rtcErrorBroadcastManager.cleanup()
    }, 20 * 1000)
  }

  /**
   * 生成设备唯一标识
   */
  private generateDeviceKey(peer: Peer): string {
    /**
     * 使用稳定字段(IP + 设备名称 + 浏览器)生成设备唯一标识。
     * 同一设备短时间内重复连接将得到相同的 key，
     * 便于服务器识别并进行重连处理。
     */
    return `${peer.ip}_${peer.name.deviceName}_${peer.name.browser}`
      .replace(/\s+/g, '_')
      .toLowerCase()
  }

  /**
   * 检测用户重连并处理
   */
  private detectAndHandleReconnection(peer: Peer): string | null {
    const deviceKey = this.generateDeviceKey(peer)
    const existingDevice = this.deviceMap.get(deviceKey)

    if (existingDevice && existingDevice.peerId !== peer.id) {
      /** 检查旧连接是否仍然活跃（5分钟内有活动） */
      const now = Date.now()
      const timeSinceLastSeen = now - existingDevice.lastSeen

      if (timeSinceLastSeen < 5 * 60 * 1000) { // 5分钟内
        /** 找到旧的peer并移除 */
        const oldRoom = this.roomMap.get(existingDevice.roomId)
        const oldPeer = oldRoom?.get(existingDevice.peerId)

        if (oldPeer) {
          console.log(`检测到用户重连: ${peer.name.displayName} (${peer.ip})`)
          console.log(`旧peerId: ${existingDevice.peerId}, 新peerId: ${peer.id}`)

          /** 移除旧连接 */
          this.removePeerFromRoom(oldPeer)

          /** 返回旧的peerId用于通知其他用户 */
          return existingDevice.peerId
        }
      }
    }

    /** 更新设备映射 */
    this.deviceMap.set(deviceKey, {
      peerId: peer.id,
      roomId: peer.roomId,
      displayName: peer.name.displayName,
      lastSeen: Date.now(),
    })

    return null
  }

  /**
   * 将用户添加到对应房间
   */
  private addPeerToRoom(peer: Peer) {
    /** 检测重连 */
    const oldPeerId = this.detectAndHandleReconnection(peer)

    if (!this.roomMap.has(peer.roomId)) {
      this.roomMap.set(peer.roomId, new Map())
    }
    this.roomMap.get(peer.roomId)!.set(peer.id, peer)

    console.log(`用户 ${peer.name.displayName} (${peer.ip}) 加入房间: ${peer.roomId}`)

    /** 如果检测到重连，通知房间内其他用户 */
    if (oldPeerId) {
      const reconnectionInfo: UserReconnectedInfo = {
        oldPeerId,
        newPeerId: peer.id,
        userInfo: peer.getInfo(),
      }

      this.broadcastToRoom(peer.roomId, {
        type: Action.UserReconnected,
        data: reconnectionInfo,
      }, peer.id) // 排除重连的用户自己
    }
  }

  /**
   * 从房间中移除用户
   */
  private removePeerFromRoom(peer: Peer) {
    const room = this.roomMap.get(peer.roomId)
    if (room && room.has(peer.id)) {
      room.delete(peer.id)
      console.log(`用户 ${peer.name.displayName} 已从房间 ${peer.roomId} 中移除`)

      if (room.size === 0) {
        this.roomMap.delete(peer.roomId)
        console.log(`房间 ${peer.roomId} 已清空并删除`)
        /** 清理对应的房间码映射 */
        this.cleanupRoomCode(peer.roomId)
      }
    }

    /** 清理设备映射 */
    this.cleanupDeviceMapping(peer)
  }

  /**
   * 清理设备映射
   */
  private cleanupDeviceMapping(peer: Peer) {
    const deviceKey = this.generateDeviceKey(peer)
    const existingDevice = this.deviceMap.get(deviceKey)

    /** 只有当映射的peerId匹配时才删除 */
    if (existingDevice && existingDevice.peerId === peer.id) {
      this.deviceMap.delete(deviceKey)
      console.log(`清理设备映射: ${deviceKey}`)
    }
  }

  /**
   * 更新设备最后活跃时间
   */
  private updateDeviceLastSeen(peer: Peer) {
    const deviceKey = this.generateDeviceKey(peer)
    const existingDevice = this.deviceMap.get(deviceKey)

    if (existingDevice && existingDevice.peerId === peer.id) {
      existingDevice.lastSeen = Date.now()
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
    if (!room)
      return []
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
  private broadcastToRoom(roomId: string, data: SendData<UserInfo[] | UserInfo | UserReconnectedInfo>, excludeId?: string) {
    console.log(`广播到房间 ${roomId}: ${data.type}`)

    const room = this.roomMap.get(roomId)
    if (!room)
      return

    room.forEach((peer) => {
      if (peer.id === excludeId)
        return
      this.send(peer, data)
    })
  }

  private onConnection = (peer: Peer) => {
    const { socket } = peer
    socket.on('message', data => this.onMessage(peer, data))

    /** 监听WebSocket关闭事件 */
    socket.on('close', (code, reason) => {
      console.log(`${peer.name.displayName} WebSocket连接关闭 (code: ${code}, reason: ${reason})`)
      this.handlePeerDisconnect(peer)
    })

    /** 监听WebSocket错误事件 */
    socket.on('error', (error) => {
      console.log(`${peer.name.displayName} WebSocket连接错误:`, error)
      this.handlePeerDisconnect(peer)
    })
  }

  /**
   * 处理用户断开连接
   */
  private handlePeerDisconnect(peer: Peer) {
    console.log(`处理用户断开连接: ${peer.name.displayName}`)

    /** 检查用户是否仍在房间中，避免重复处理 */
    const room = this.roomMap.get(peer.roomId)
    if (!room || !room.has(peer.id)) {
      console.log(`用户 ${peer.name.displayName} 已经不在房间中，跳过断开连接处理`)
      return
    }

    /** 从房间中移除用户 */
    this.removePeerFromRoom(peer)

    /** 通知房间内其他用户该用户已离开 */
    this.broadcastToRoom(peer.roomId, {
      type: Action.LeaveRoom,
      data: peer.getInfo(),
    })
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
      type: Action.NotifyUserInfo,
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

  /**
   * 广播房间码失效消息给所有客户端
   */
  private broadcastRoomCodeExpired(expiredRoomCode: string) {
    console.log(`广播房间码失效消息: ${expiredRoomCode}`)

    /** 向所有连接的客户端广播房间码失效消息 */
    this.roomMap.forEach((room) => {
      room.forEach((peer) => {
        this.send(peer, {
          type: Action.RoomCodeExpired,
          data: {
            roomCode: expiredRoomCode,
            message: '房间码已过期',
          },
        })
      })
    })
  }

  private onMessage = (sender: Peer, data: RawData) => {
    let msg: SendData
    try {
      msg = JSON.parse(data.toString())
    }
    catch (e) {
      console.warn('WS: Received JSON is malformed')
      return
    }

    switch (msg.type) {
      case Action.Close:
        sender.socket.terminate()
        break
      case Action.Ping:
        sender[HEART_BEAT] = Date.now()
        /** 更新设备映射的最后活跃时间 */
        this.updateDeviceLastSeen(sender)
        this.send(sender, { type: Action.Ping, data: null })
        break

      case Action.JoinRoom:
        const data = msg.data as UserInfo
        if (data.roomId) {
          console.log(`${sender.name.displayName} 加入房间`)
          this.addToNewRoom(sender, data.roomId)
        }

        this.notifyUserInfo(sender)
        this.broadcastToRoom(sender.roomId, {
          type: Action.JoinRoom,
          data: this.getRoomUsers(sender.roomId),
        })
        break

      case Action.LeaveRoom:
        console.log(`${sender.name.displayName} 离开房间`)
        this.handlePeerDisconnect(sender)
        break

      /** 用户 A 请求创建一个用于直接连接的房间 */
      case Action.CreateQRCodeRoom:
        const directRoomId = `direct_${crypto.randomUUID()}`
        /** 将用户 A 移动到这个新房间 */
        this.addToNewRoom(sender, directRoomId)
        /** 通知用户 A 新的房间 ID，以便生成二维码 */
        const roomInfo: RoomInfo = {
          roomId: directRoomId,
          peerInfo: sender.getInfo(),
        }
        this.send(sender, { type: Action.QRCodeCreated, data: roomInfo })
        break

      /** 用户 B 通过扫码请求加入指定房间 */
      case Action.JoinRoomByQRCode:
        const { roomId, peerId } = msg.data as JoinRoomInfo
        const roomToJoin = this.roomMap.get(roomId)

        if (roomToJoin?.has(peerId)) {
          this.addToNewRoom(sender, roomId)

          /** 通知房间内的所有用户（主要是用户 A 和用户 B）有新用户加入 */
          this.notifyUserInfo(sender) // 通知 B 自己的信息
          this.broadcastToRoom(roomId, {
            type: Action.JoinRoom,
            data: this.getRoomUsers(roomId),
          })
        }
        else {
          this.send(sender, {
            type: Action.Error,
            data: {
              code: ErrorCode.QRCodeExpired,
              message: '指定的房间或用户不存在',
            },
          })
        }
        break

      /** 用户请求创建带连接码的房间 */
      case Action.CreateCodeRoom:
        const roomCode = this.generateRoomCode()
        const codeRoomId = `code_${crypto.randomUUID()}`

        /** 建立房间码到房间ID的映射 */
        this.roomCodeMap.set(roomCode, codeRoomId)

        /** 将用户移动到新房间 */
        this.addToNewRoom(sender, codeRoomId)

        /** 通知用户房间码创建成功 */
        const roomCodeInfo: RoomCodeInfo = {
          roomCode,
          roomId: codeRoomId,
          peerInfo: sender.getInfo(),
        }
        this.send(sender, { type: Action.RoomCodeCreated, data: roomCodeInfo })
        console.log(`用户 ${sender.name.displayName} 创建房间码: ${roomCode}`)
        break

      /** 用户通过房间码加入房间 */
      case Action.JoinRoomByCode:
        const { roomCode: joinCode } = msg.data as JoinRoomCodeInfo
        const targetRoomId = this.roomCodeMap.get(joinCode)

        if (targetRoomId && this.roomMap.has(targetRoomId)) {
          this.addToNewRoom(sender, targetRoomId)

          /** 通知加入者自己的信息 */
          this.notifyUserInfo(sender)

          /** 通知房间内所有用户有新用户加入 */
          this.broadcastToRoom(targetRoomId, {
            type: Action.JoinRoom,
            data: this.getRoomUsers(targetRoomId),
          })

          console.log(`用户 ${sender.name.displayName} 通过房间码 ${joinCode} 加入房间: ${targetRoomId}`)
        }
        else {
          /** 房间码无效，广播房间码失效消息 */
          this.broadcastRoomCodeExpired(joinCode)
          this.send(sender, { type: Action.Error, data: { message: '房间码不存在或已过期' } })
        }
        break

      case Action.Relay:
        const relayData = msg.data
        /** 确保只能向同一房间的用户发送 */
        this.sendTo(sender, relayData.toId, relayData)
        break

      case Action.RTCError:
        /** 处理 RTC 错误，广播给房间内所有其他成员 */
        console.log(`收到来自 ${sender.name.displayName} 的RTC错误:`, msg.data)

        /** 检查是否可以广播错误（防止频繁广播） */
        const errorData = msg.data as any
        const errorType = errorData?.errorType || 'UNKNOWN_ERROR'

        if (!this.rtcErrorBroadcastManager.canBroadcast(sender.roomId, errorType)) {
          console.warn(`跳过RTC错误广播，房间 ${sender.roomId} 的错误类型 ${errorType} 过于频繁`)
          break
        }

        this.broadcastToRoom(sender.roomId, {
          type: Action.RTCErrorBroadcast,
          data: msg.data,
        }, sender.id) // 排除发送错误的用户
        break

      default:
        break
    }
  }

  private addToNewRoom(peer: Peer, roomId: string) {
    this.removePeerFromRoom(peer) // 从旧房间移除
    peer.roomId = roomId // 更新用户的 roomId
    this.addPeerToRoom(peer) // 加入新房间
  }

  /**
   * 心跳检测，定时清理离线连接者
   */
  private keepAliveClear() {
    setInterval(() => {
      /** 按房间显示客户端信息 */
      this.roomMap.forEach((room, roomId) => {
        if (room.size > 0) {
          const clients = Array.from(room.values())
            .map(peer => peer.name.displayName)
            .join(', ')
          console.log(`房间 ${roomId}: ${clients}`)
        }
      })

      const peersToRemove: Peer[] = []

      this.roomMap.forEach((room) => {
        room.forEach((peer) => {
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

      /** 移除离线用户并通知房间内其他用户 */
      peersToRemove.forEach((peer) => {
        /** 检查peer是否仍在房间中，避免重复处理 */
        const room = this.roomMap.get(peer.roomId)
        if (room && room.has(peer.id)) {
          this.removePeerFromRoom(peer)
          this.broadcastToRoom(peer.roomId, {
            type: Action.LeaveRoom,
            data: peer.getInfo(),
          })
        }
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
