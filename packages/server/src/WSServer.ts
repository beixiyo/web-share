import type { Server } from 'node:http'
import type { InviteInvalidatedInfo, RoomInviteInfo, UserReconnectedInfo } from 'web-share-common'
import type { RawData } from 'ws'
import type { ResolvedWSServerOpts, WSServerOpts } from './types'
import { randomBytes } from 'node:crypto'
import { Action, HEART_BEAT, InviteInvalidatedReason, ResumeTokenQueryKey } from 'web-share-common'
import { WebSocket, WebSocketServer } from 'ws'
/** WebSocket 信令服务：装配房间、邀请和具有私有恢复凭据的连接生命周期 */
import { Peer } from '@/Peer'
import { resolveOptions } from './constants'
import { DisconnectScheduler } from './DisconnectScheduler'
import { InviteManager } from './InviteManager'
import { RoomManager } from './RoomManager'
import { RTCErrorBroadcastManager } from './RTCErrorBroadcastManager'
import { sendOrTerminateSlowSocket } from './utils/send'

const RELAY_ACTIONS = new Set<string>([Action.Offer, Action.Answer, Action.Candidate, Action.FileMetas])

/** 房间成员身份仅由服务端签发的恢复令牌证明，公开 peerId 不作为凭据 */
export class WSServer {
  readonly ws: WebSocketServer
  readonly opts: ResolvedWSServerOpts

  private roomManager = new RoomManager()
  private inviteManager: InviteManager
  private disconnectScheduler: DisconnectScheduler
  private rtcErrorBroadcastManager = new RTCErrorBroadcastManager()
  private sessions = new Map<string, Peer>()
  private peerTokens = new WeakMap<Peer, string>()
  private timers: ReturnType<typeof setInterval>[] = []
  private closed = false
  private closePromise?: Promise<void>

  constructor(server: Server, opts: WSServerOpts = {}) {
    this.opts = resolveOptions(opts)
    this.inviteManager = new InviteManager(
      {
        inviteTTL: this.opts.inviteTTL,
        roomEmptyGraceMs: this.opts.roomEmptyGraceMs,
        defaultRoomCode: this.opts.defaultRoomCode,
      },
      roomId => this.roomManager.hasActiveRoom(roomId),
    )
    this.roomManager.setOnRoomEmpty((roomId) => {
      if (!this.closed)
        this.inviteManager.scheduleEmptyRoomCleanup(roomId)
    })
    this.disconnectScheduler = new DisconnectScheduler(this.opts.disconnectDelay, peer => this.executeDisconnect(peer))

    this.ws = new WebSocketServer({ server, maxPayload: 10 * 1024 * 1024 })
    this.ws.on('connection', (socket, request) => {
      /** 拒绝握手的提前返回路径也必须有 error 监听 */
      socket.on('error', error => console.warn('WebSocket 连接错误:', error))
      if (this.closed) {
        socket.close(1012, 'Server closed')
        return
      }

      let previous: Peer | undefined
      let token: string
      let peer: Peer
      try {
        const requestedToken = new URL(request.url ?? '/', 'http://server').searchParams.get(ResumeTokenQueryKey)
        previous = requestedToken
          ? this.sessions.get(requestedToken)
          : undefined
        token = previous
          ? requestedToken!
          : randomBytes(32).toString('hex')
        peer = new Peer(socket, request, {
          peerId: previous?.id,
          roomId: previous?.roomId,
        })
      }
      catch (error) {
        console.warn('拒绝无效 WebSocket 握手:', error)
        socket.close(1008, 'Invalid connection metadata')
        return
      }
      this.onConnection(peer, token, previous)
    })

    this.timers.push(setInterval(() => this.clearInactivePeers(), this.opts.clearTime))
    this.timers.push(setInterval(() => {
      this.rtcErrorBroadcastManager.cleanup()
      this.inviteManager.cleanupExpiredInvites()
    }, 20 * 1000))
  }

  /** 幂等关闭信令层，取消全部任务并终止所有 WS；HTTP server 的所有者仍负责关闭 HTTP */
  close(): Promise<void> {
    if (this.closePromise)
      return this.closePromise

    this.closed = true
    this.timers.forEach(clearInterval)
    this.timers = []
    this.disconnectScheduler.close()
    this.inviteManager.close()
    this.sessions.clear()
    this.roomManager.clear()
    this.ws.clients.forEach(socket => socket.terminate())
    this.closePromise = new Promise(resolve => this.ws.close(() => resolve()))
    return this.closePromise
  }

  private onConnection(peer: Peer, token: string, previous?: Peer) {
    this.disconnectScheduler.cancel(peer.id)
    this.inviteManager.cancelEmptyRoomCleanup(peer.roomId)
    this.sessions.set(token, peer)
    this.peerTokens.set(peer, token)
    this.roomManager.addPeer(peer)

    const { socket } = peer
    socket.on('message', data => this.onMessage(peer, data))
    socket.on('close', () => {
      this.handleSocketClosed(peer)
    })
    socket.on('error', () => {
      if (this.isCurrentSession(peer)) {
        this.handleSocketClosed(peer)
        socket.terminate()
      }
    })

    if (previous) {
      /** 先切换映射，再关闭旧连接；其排队中的 message/close 不得影响新会话 */
      previous.socket.close(4001, 'Session replaced')
      this.roomManager.broadcastToRoom(peer.roomId, {
        type: Action.UserReconnected,
        data: { oldPeerId: previous.id, newPeerId: peer.id, userInfo: peer.getInfo() } satisfies UserReconnectedInfo,
      }, peer.id)
    }
  }

  /** 离线会话仍可在宽限内恢复，不依赖在线房间索引 */
  private isCurrentSession(peer: Peer): boolean {
    const token = this.peerTokens.get(peer)
    return !this.closed && token !== undefined && this.sessions.get(token) === peer
  }

  private isCurrentPeer(peer: Peer): boolean {
    return this.isCurrentSession(peer) && this.roomManager.getRoomPeer(peer.roomId, peer.id) === peer
  }

  /** 立即发布离线状态；恢复凭据由独立的宽限计时器回收 */
  private handleSocketClosed(peer: Peer) {
    if (!this.isCurrentSession(peer))
      return
    this.removeOnlinePeer(peer)
    this.disconnectScheduler.scheduleDisconnect(peer)
  }

  /** 仅在确实移除了当前在线成员时广播，避免过期清理重复通知 */
  private removeOnlinePeer(peer: Peer) {
    if (this.roomManager.removePeer(peer))
      this.roomManager.broadcastToRoom(peer.roomId, { type: Action.LeaveRoom, data: peer.getInfo() })
  }

  private executeDisconnect(peer: Peer) {
    if (!this.isCurrentSession(peer))
      return

    this.disconnectScheduler.cancel(peer.id)
    this.removeOnlinePeer(peer)
    const token = this.peerTokens.get(peer)!
    this.sessions.delete(token)
    this.peerTokens.delete(peer)
    peer.socket.terminate()
  }

  private send(peer: Peer, data: { type: Action, [key: string]: unknown }) {
    if (!this.isCurrentPeer(peer) || peer.socket.readyState !== WebSocket.OPEN)
      return
    sendOrTerminateSlowSocket(peer.socket, JSON.stringify(data))
  }

  private sendError(peer: Peer, message: string) {
    this.send(peer, { type: Action.Error, data: { message } })
  }

  private sendRoomState(peer: Peer) {
    /** 恢复令牌只通过当前连接的私有 NotifyUserInfo 发放 */
    this.send(peer, {
      type: Action.NotifyUserInfo,
      data: { ...peer.getInfo(), resumeToken: this.peerTokens.get(peer)! },
    })
    this.roomManager.broadcastToRoom(peer.roomId, { type: Action.JoinRoom, data: this.roomManager.getRoomUsers(peer.roomId) })
  }

  private sendInviteInvalidated(peer: Peer, reason: InviteInvalidatedInfo['reason'], invite?: Partial<RoomInviteInfo>) {
    const messages: Record<InviteInvalidatedInfo['reason'], string> = {
      [InviteInvalidatedReason.Expired]: '邀请已过期，请重新生成',
      [InviteInvalidatedReason.NotFound]: '邀请不存在或已失效',
      [InviteInvalidatedReason.RoomUnavailable]: '邀请对应的房间不可用',
      [InviteInvalidatedReason.Restarted]: '服务已重启，请重新生成邀请',
      [InviteInvalidatedReason.Revoked]: '邀请已被刷新，请使用最新邀请',
      [InviteInvalidatedReason.NoActiveInvite]: '当前房间没有可用邀请',
    }
    this.send(peer, {
      type: Action.InviteInvalidated,
      data: { inviteId: invite?.inviteId, roomCode: invite?.roomCode, reason, message: messages[reason] },
    })
  }

  private onMessage(sender: Peer, raw: RawData) {
    if (!this.isCurrentPeer(sender))
      return

    let message: unknown
    try {
      message = JSON.parse(raw.toString())
    }
    catch {
      this.sendError(sender, '消息必须是合法 JSON')
      return
    }
    if (!isRecord(message) || typeof message.type !== 'string' || !('data' in message)) {
      this.sendError(sender, '消息必须包含 type 和 data')
      return
    }

    try {
      this.dispatch(sender, message.type, message.data)
    }
    catch (error) {
      console.error('处理 WebSocket 消息失败:', error)
      this.sendError(sender, '消息处理失败')
    }
  }

  private dispatch(sender: Peer, type: string, payload: unknown) {
    const invalid = () => this.sendError(sender, '消息载荷无效')
    switch (type) {
      case Action.Close:
      case Action.Ping:
      case Action.LeaveRoom:
      case Action.GetOrCreateInvite:
      case Action.GetCurrentInvite:
      case Action.RefreshInvite:
        if (payload !== null)
          return invalid()
    }

    switch (type) {
      case Action.Close:
        sender.socket.terminate()
        break
      case Action.Ping:
        sender[HEART_BEAT] = Date.now()
        this.send(sender, { type: Action.Ping, data: null })
        break
      case Action.JoinRoom:
        if (!isRecord(payload) || (payload.roomId !== undefined && typeof payload.roomId !== 'string'))
          return invalid()
        if (payload.roomId && payload.roomId !== sender.roomId)
          this.sendError(sender, '跨房间加入必须使用邀请或房间码')
        this.sendRoomState(sender)
        break
      case Action.LeaveRoom:
        this.executeDisconnect(sender)
        break
      case Action.GetOrCreateInvite:
      case Action.RefreshInvite: {
        const invite = type === Action.RefreshInvite
          ? this.inviteManager.refreshInvite(sender.roomId)
          : this.inviteManager.getOrCreateInvite(sender.roomId)
        this.send(sender, { type: Action.InviteCreated, data: invite })
        break
      }
      case Action.GetCurrentInvite: {
        const invite = this.inviteManager.getActiveInviteForRoom(sender.roomId)
        if (invite)
          this.send(sender, { type: Action.InviteCreated, data: invite })
        else this.sendInviteInvalidated(sender, InviteInvalidatedReason.NoActiveInvite)
        break
      }
      case Action.JoinRoomByQRCode:
        /** 公开 roomId/peerId 不能授权进入其他房间，旧链接统一失效 */
        this.sendInviteInvalidated(sender, InviteInvalidatedReason.NotFound)
        break
      case Action.JoinRoomByInvite: {
        if (!isRecord(payload) || !isNonEmptyString(payload.inviteId) || !isNonEmptyString(payload.joinToken))
          return invalid()
        const result = this.inviteManager.resolveInviteByJoinPayload({ inviteId: payload.inviteId, joinToken: payload.joinToken })
        if ('invite' in result)
          this.joinAuthorizedRoom(sender, result.invite.roomId)
        else this.sendInviteInvalidated(sender, result.reason)
        break
      }
      case Action.JoinRoomByCode: {
        if (!isRecord(payload) || !isNonEmptyString(payload.roomCode))
          return invalid()
        const result = this.inviteManager.resolveInviteByCode(payload.roomCode)
        if ('invite' in result)
          this.joinAuthorizedRoom(sender, result.invite.roomId)
        else this.sendInviteInvalidated(sender, result.reason, { roomCode: payload.roomCode })
        break
      }
      case Action.Relay: {
        if (!isRecord(payload) || !isNonEmptyString(payload.toId) || typeof payload.type !== 'string' || !RELAY_ACTIONS.has(payload.type))
          return invalid()
        const target = this.roomManager.getRoomPeer(sender.roomId, payload.toId)
        if (target)
          this.send(target, { ...payload, type: payload.type as Action, fromId: sender.id })
        break
      }
      case Action.RTCError: {
        if (!isRecord(payload) || (payload.errorType !== undefined && typeof payload.errorType !== 'string'))
          return invalid()
        const errorType = typeof payload.errorType === 'string'
          ? payload.errorType
          : 'UNKNOWN_ERROR'
        if (this.rtcErrorBroadcastManager.canBroadcast(sender.roomId, errorType)) {
          this.roomManager.broadcastToRoom(sender.roomId, {
            type: Action.RTCErrorBroadcast,
            data: { ...payload, fromPeerId: sender.id },
          }, sender.id)
        }
        break
      }
      default:
        this.sendError(sender, '不支持的消息类型')
    }
  }

  private joinAuthorizedRoom(peer: Peer, roomId: string) {
    if (roomId !== peer.roomId) {
      const oldInfo = peer.getInfo()
      this.roomManager.removePeer(peer)
      this.roomManager.broadcastToRoom(oldInfo.roomId, { type: Action.LeaveRoom, data: oldInfo })
      peer.roomId = roomId
      this.inviteManager.cancelEmptyRoomCleanup(roomId)
      this.roomManager.addPeer(peer)
    }
    this.sendRoomState(peer)
  }

  private clearInactivePeers() {
    const expired: Peer[] = []
    const now = Date.now()
    this.roomManager.forEachPeer((peer) => {
      if (peer.socket.readyState !== WebSocket.OPEN) {
        /** 在线状态立即移除；重复检测不会延长会话的恢复期限 */
        this.handleSocketClosed(peer)
      }
      else if (now - peer[HEART_BEAT] > this.opts.clearTime) {
        expired.push(peer)
      }
    })
    expired.forEach(peer => this.executeDisconnect(peer))
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export type { WSServerOpts } from './types'
