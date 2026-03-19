import type { Server } from 'node:http'
import type { InviteInvalidatedInfo, JoinInviteInfo, JoinRoomCodeInfo, JoinRoomInfo, RoomInviteInfo, SendData, SendUserInfo, UserInfo, UserReconnectedInfo } from 'web-share-common'
import type { RawData } from 'ws'
import type { ResolvedWSServerOpts, WSServerOpts } from './types'
import { Action, HEART_BEAT } from 'web-share-common'
import { WebSocket, WebSocketServer } from 'ws'
import { Peer } from '@/Peer'
import { defaultOpts } from './constants'
import { DeviceReconnectManager } from './DeviceReconnectManager'
import { DisconnectScheduler } from './DisconnectScheduler'
import { InviteManager } from './InviteManager'
import { RoomManager } from './RoomManager'
import { RTCErrorBroadcastManager } from './RTCErrorBroadcastManager'

/**
 * WebSocket 信令服务：组合房间、邀请、设备重连、断连调度与消息分发，职责仅为装配与路由。
 */
export class WSServer {
  ws: WebSocketServer
  opts: ResolvedWSServerOpts

  private roomManager: RoomManager
  private inviteManager: InviteManager
  private deviceManager: DeviceReconnectManager
  private disconnectScheduler: DisconnectScheduler
  private rtcErrorBroadcastManager: RTCErrorBroadcastManager

  constructor(
    server: Server,
    opts: WSServerOpts = {},
  ) {
    this.opts = Object.assign({}, defaultOpts, opts)

    this.roomManager = new RoomManager()
    this.inviteManager = new InviteManager(
      {
        inviteTTL: this.opts.inviteTTL,
        roomEmptyGraceMs: this.opts.roomEmptyGraceMs,
        defaultRoomCode: this.opts.defaultRoomCode,
      },
      roomId => this.roomManager.hasActiveRoom(roomId),
    )
    this.roomManager.setOnRoomEmpty(roomId => this.inviteManager.scheduleEmptyRoomCleanup(roomId))

    this.deviceManager = new DeviceReconnectManager(this.opts.disconnectDelay)
    this.disconnectScheduler = new DisconnectScheduler(
      this.opts.disconnectDelay,
      peer => this.executeDisconnect(peer),
    )
    this.rtcErrorBroadcastManager = new RTCErrorBroadcastManager()

    this.ws = new WebSocketServer({ server, maxPayload: 10 * 1024 * 1024 })
    this.ws.on('connection', (socket, request) => {
      const peer = new Peer(socket, request)
      this.onConnection(peer)
    })

    this.startKeepAliveClear()
    setInterval(() => {
      this.rtcErrorBroadcastManager.cleanup()
      this.deviceManager.cleanupExpired()
      this.inviteManager.cleanupExpiredInvites()
    }, 20 * 1000)
  }

  private onConnection(peer: Peer) {
    this.inviteManager.cancelEmptyRoomCleanup(peer.roomId)
    if (this.disconnectScheduler.hasPending(peer.id)) {
      this.disconnectScheduler.cancel(peer.id)
      console.log(`用户 ${peer.name.displayName} 在断开超时前重新连接，取消断开任务`)
    }

    const reconnection = this.deviceManager.detectReconnection(peer)
    if (reconnection) {
      const oldPeer = this.roomManager.getPeerById(reconnection.oldPeerId)
      if (oldPeer) {
        console.log(`检测到用户重连: ${peer.name.displayName} (${peer.ip}), 旧peerId: ${reconnection.oldPeerId}, 新peerId: ${peer.id}`)
        this.roomManager.removePeer(oldPeer)
      }
    }

    this.roomManager.addPeer(peer)
    console.log(`用户 ${peer.name.displayName} (${peer.ip}) 加入房间: ${peer.roomId}`)

    if (reconnection) {
      this.roomManager.broadcastToRoom(peer.roomId, {
        type: Action.UserReconnected,
        data: {
          oldPeerId: reconnection.oldPeerId,
          newPeerId: peer.id,
          userInfo: peer.getInfo(),
        } satisfies UserReconnectedInfo,
      }, peer.id)
    }

    const { socket } = peer
    socket.on('message', data => this.onMessage(peer, data))
    socket.on('close', (code, reason) => {
      console.log(`${peer.name.displayName} WebSocket连接关闭 (code: ${code}, reason: ${reason})`)
      this.disconnectScheduler.scheduleDisconnect(peer)
    })
    socket.on('error', (err) => {
      console.log(`${peer.name.displayName} WebSocket连接错误:`, err)
      this.disconnectScheduler.scheduleDisconnect(peer)
    })
  }

  private executeDisconnect(peer: Peer) {
    if (!this.roomManager.removePeer(peer)) {
      console.log(`用户 ${peer.name.displayName} 已经不在房间中或已重新连接，跳过执行断开`)
      return
    }
    console.log(`执行用户断开连接: ${peer.name.displayName}`)
    this.deviceManager.cleanupDevice(peer)
    this.roomManager.broadcastToRoom(peer.roomId, { type: Action.LeaveRoom, data: peer.getInfo() })
  }

  private send<T>(peer: Peer, data: SendData<T>) {
    if (peer.socket.readyState !== WebSocket.OPEN)
      return
    try {
      peer.socket.send(JSON.stringify(data))
    }
    catch (error) {
      console.warn(`发送消息失败 (${peer.name.displayName}):`, error)
    }
  }

  private sendTo<T>(fromPeer: Peer, toId: string, data: SendData<T>) {
    const target = this.roomManager.getRoomPeer(fromPeer.roomId, toId)
    if (!target) {
      console.warn(`目标用户 ${toId} 不在房间 ${fromPeer.roomId} 中`)
      return
    }
    this.send(target, data)
  }

  private sendInviteInvalidated(
    peer: Peer,
    reason: InviteInvalidatedInfo['reason'],
    invite?: Partial<RoomInviteInfo>,
  ) {
    const messages: Record<InviteInvalidatedInfo['reason'], string> = {
      expired: '邀请已过期，请重新生成',
      not_found: '邀请不存在或已失效',
      room_unavailable: '邀请对应的房间不可用',
      restarted: '服务已重启，请重新生成邀请',
      revoked: '邀请已被刷新，请使用最新邀请',
      no_active_invite: '当前房间没有可用邀请',
    }
    this.send(peer, {
      type: Action.InviteInvalidated,
      data: {
        inviteId: invite?.inviteId,
        roomCode: invite?.roomCode,
        reason,
        message: messages[reason],
      } satisfies InviteInvalidatedInfo,
    })
  }

  private onMessage = (sender: Peer, data: RawData) => {
    let msg: SendData
    try {
      msg = JSON.parse(data.toString())
    }
    catch {
      console.warn('WS: Received JSON is malformed')
      return
    }

    switch (msg.type) {
      case Action.Close:
        sender.socket.terminate()
        break
      case Action.Ping:
        sender[HEART_BEAT] = Date.now()
        this.deviceManager.updateLastSeen(sender)
        this.send(sender, { type: Action.Ping, data: null })
        break

      case Action.JoinRoom: {
        const joinData = msg.data as UserInfo
        if (joinData.roomId && joinData.roomId !== sender.roomId) {
          console.log(`${sender.name.displayName} 加入房间`)
          this.removePeerFromCurrentRoomAndJoin(sender, joinData.roomId)
        }
        this.send(sender, { type: Action.NotifyUserInfo, data: sender.getInfo() } satisfies SendUserInfo)
        this.roomManager.broadcastToRoom(sender.roomId, { type: Action.JoinRoom, data: this.roomManager.getRoomUsers(sender.roomId) })
        break
      }

      case Action.LeaveRoom:
        console.log(`${sender.name.displayName} 离开房间`)
        this.disconnectScheduler.scheduleDisconnect(sender, true)
        break

      case Action.GetOrCreateInvite: {
        const invite = this.inviteManager.getOrCreateInvite(sender.roomId)
        this.send(sender, { type: Action.InviteCreated, data: invite })
        console.log(`用户 ${sender.name.displayName} 创建了统一邀请: ${invite.roomCode}，有效期: ${invite.expiresAt}`)
        break
      }

      case Action.GetCurrentInvite: {
        const invite = this.inviteManager.getActiveInviteForRoom(sender.roomId)
        if (!invite) {
          this.sendInviteInvalidated(sender, 'no_active_invite')
          break
        }
        this.send(sender, { type: Action.InviteCreated, data: invite })
        break
      }

      case Action.RefreshInvite: {
        const invite = this.inviteManager.refreshInvite(sender.roomId)
        this.send(sender, { type: Action.InviteCreated, data: invite })
        console.log(`用户 ${sender.name.displayName} 刷新了邀请: ${invite.roomCode}`)
        break
      }

      case Action.JoinRoomByQRCode: {
        const { roomId, peerId } = msg.data as JoinRoomInfo
        if (this.roomManager.hasPeer(roomId, peerId)) {
          this.removePeerFromCurrentRoomAndJoin(sender, roomId)
          this.send(sender, { type: Action.NotifyUserInfo, data: sender.getInfo() } satisfies SendUserInfo)
          this.roomManager.broadcastToRoom(roomId, { type: Action.JoinRoom, data: this.roomManager.getRoomUsers(roomId) })
        }
        else {
          const fallback = this.inviteManager.getInviteForRoom(roomId)
          if (fallback && this.inviteManager.isPendingEmptyRoomCleanup(roomId))
            this.sendInviteInvalidated(sender, 'room_unavailable', fallback)
          else
            this.sendInviteInvalidated(sender, 'not_found')
        }
        break
      }

      case Action.JoinRoomByInvite: {
        const result = this.inviteManager.resolveInviteByJoinPayload(msg.data as JoinInviteInfo)
        if ('invite' in result) {
          const { invite } = result
          this.removePeerFromCurrentRoomAndJoin(sender, invite.roomId)
          this.send(sender, { type: Action.NotifyUserInfo, data: sender.getInfo() } satisfies SendUserInfo)
          this.roomManager.broadcastToRoom(invite.roomId, { type: Action.JoinRoom, data: this.roomManager.getRoomUsers(invite.roomId) })
          console.log(`用户 ${sender.name.displayName} 通过邀请 ${invite.roomCode} 加入房间: ${invite.roomId}`)
        }
        else {
          this.sendInviteInvalidated(sender, result.reason)
        }
        break
      }

      case Action.JoinRoomByCode: {
        const { roomCode } = msg.data as JoinRoomCodeInfo
        const result = this.inviteManager.resolveInviteByCode(roomCode)
        if ('invite' in result) {
          const { invite } = result
          this.removePeerFromCurrentRoomAndJoin(sender, invite.roomId)
          this.send(sender, { type: Action.NotifyUserInfo, data: sender.getInfo() } satisfies SendUserInfo)
          this.roomManager.broadcastToRoom(invite.roomId, { type: Action.JoinRoom, data: this.roomManager.getRoomUsers(invite.roomId) })
          console.log(`用户 ${sender.name.displayName} 通过房间码 ${roomCode} 加入房间: ${invite.roomId}`)
        }
        else {
          this.sendInviteInvalidated(sender, result.reason, { roomCode })
        }
        break
      }

      case Action.Relay: {
        /** 强制设置 fromId 为发送者真实 ID，防止伪造 */
        const relayData = msg.data as { toId: string, fromId?: string }
        relayData.fromId = sender.id
        this.sendTo(sender, relayData.toId, msg.data)
        break
      }

      case Action.RTCError: {
        const errorData = msg.data as { errorType?: string }
        const errorType = errorData?.errorType || 'UNKNOWN_ERROR'
        console.log(`收到来自 ${sender.name.displayName} 的RTC错误:`, msg.data)
        if (!this.rtcErrorBroadcastManager.canBroadcast(sender.roomId, errorType)) {
          console.warn(`跳过RTC错误广播，房间 ${sender.roomId} 的错误类型 ${errorType} 过于频繁`)
          break
        }
        this.roomManager.broadcastToRoom(sender.roomId, { type: Action.RTCErrorBroadcast, data: msg.data }, sender.id)
        break
      }

      default:
        break
    }
  }

  private removePeerFromCurrentRoomAndJoin(peer: Peer, newRoomId: string) {
    this.roomManager.removePeer(peer)
    peer.roomId = newRoomId
    this.inviteManager.cancelEmptyRoomCleanup(newRoomId)
    if (this.disconnectScheduler.hasPending(peer.id))
      this.disconnectScheduler.cancel(peer.id)
    const reconnection = this.deviceManager.detectReconnection(peer)
    if (reconnection) {
      const oldPeer = this.roomManager.getPeerById(reconnection.oldPeerId)
      if (oldPeer)
        this.roomManager.removePeer(oldPeer)
    }
    this.roomManager.addPeer(peer)
    if (reconnection) {
      this.roomManager.broadcastToRoom(peer.roomId, {
        type: Action.UserReconnected,
        data: { oldPeerId: reconnection.oldPeerId, newPeerId: peer.id, userInfo: peer.getInfo() } satisfies UserReconnectedInfo,
      }, peer.id)
    }
  }

  private startKeepAliveClear() {
    setInterval(() => {
      this.roomManager.getRoomMap().forEach((room, roomId) => {
        if (room.size > 0) {
          const clients = Array.from(room.values()).map(p => p.name.displayName).join(', ')
          console.log(`房间 ${roomId}: ${clients}`)
        }
      })

      const toRemove: Peer[] = []
      this.roomManager.forEachPeer((peer) => {
        const now = Date.now()
        let reason = ''
        if (now - peer[HEART_BEAT] > this.opts.clearTime)
          reason = '超时'
        else if (!peer.socket || peer.socket.readyState === WebSocket.CLOSED)
          reason = reason || '没有连接或已关闭'
        if (reason) {
          console.log(`${peer.name.displayName} 被清理了，原因是${reason}`)
          toRemove.push(peer)
        }
      })
      toRemove.forEach(peer => this.disconnectScheduler.scheduleDisconnect(peer, true))
    }, this.opts.clearTime)
  }
}

export type { WSServerOpts } from './types'
