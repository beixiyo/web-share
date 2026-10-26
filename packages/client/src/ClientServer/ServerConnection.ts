import type {
  InviteInvalidatedInfo,
  JoinInviteInfo,
  JoinRoomCodeInfo,
  JoinRoomInfo,
  RoomCodeExpiredInfo,
  RoomInviteInfo,
  RTCErrorInfo,
  SendData,
  To,
  UserInfo,
  UserReconnectedInfo,
} from 'web-share-common'
import { Action, DISPLAY_NAME, HEART_BEAT_TIME, PeerIDQueryKey, ResumeTokenQueryKey, ROOM_ID, SERVER_URL, USER_INFO } from 'web-share-common'
import { Events } from './Events'

/**
 * 管理与 WebSocket 服务器的连接
 *
 * 处理连接、断开连接、消息发送和接收等功能
 * 监听各种事件 如 visibilityChange，并相应地处理 WebSocket 连接和消息
 */
export class ServerConnection {
  server: WebSocket | null = null
  allUsers: UserInfo[] = []
  private heartbeatTimer?: ReturnType<typeof setInterval>
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private reconnectAttempts = 0
  private disposed = false
  private pendingUserInfoPromise: Promise<UserInfo> | null = null
  private pendingUserInfoResolve?: (userInfo: UserInfo) => void
  private pendingUserInfoReject?: (error: Error) => void
  private pendingUserInfoTimer?: ReturnType<typeof setTimeout>

  /**
   * WebSocket 连接后，将之前的未发送的数据放入队列中
   */
  private backlogOfData: any[] = []

  opts: ServerConnectionOpts

  constructor(opts: ServerConnectionOpts) {
    this.opts = opts
    window.addEventListener('online', this.onOnline)
    this.connect()
  }

  get isConnected() {
    return this.server?.readyState === WebSocket.OPEN
  }

  send<T>(data: SendData<T>) {
    if (!this.isConnected) {
      this.backlogOfData.push(data)
      return
    }
    this.server?.send(JSON.stringify(data))
  }

  /**
   * 中转数据到指定用户
   */
  relay<T>(data: To & T) {
    const msg = { type: Action.Relay, data }
    if (!this.isConnected) {
      this.backlogOfData.push(msg)
      return
    }
    this.server?.send(JSON.stringify(msg))
  }

  /**
   * 加入房间
   */
  joinDirectRoom(roomId: string, peerId?: string) {
    peerId = peerId || sessionStorage.getItem(PeerIDQueryKey) || undefined
    if (!peerId) {
      this.opts.onError?.({ message: this.formatError('peer_not_found'), code: 'peer_not_found' })
      return
    }

    const data: JoinRoomInfo = {
      roomId,
      peerId,
    }

    this.send({
      type: Action.JoinRoomByQRCode,
      data,
    })
  }

  /**
   * 通过统一邀请加入房间
   */
  joinRoomByInvite(inviteId: string, joinToken: string) {
    const data: JoinInviteInfo = {
      inviteId,
      joinToken,
    }

    this.send({
      type: Action.JoinRoomByInvite,
      data,
    })
  }

  /**
   * 通过房间码加入房间
   */
  joinRoomWithCode(roomCode: string) {
    const data: JoinRoomCodeInfo = {
      roomCode,
    }

    this.send({
      type: Action.JoinRoomByCode,
      data,
    })
  }

  /**
   * 统一邀请协议：获取或创建邀请
   */
  getOrCreateInvite() {
    this.send({
      type: Action.GetOrCreateInvite,
      data: null,
    })
  }

  /**
   * 获取当前房间邀请
   */
  getCurrentInvite() {
    this.send({
      type: Action.GetCurrentInvite,
      data: null,
    })
  }

  /**
   * 统一邀请协议：刷新邀请
   */
  refreshInvite() {
    this.send({
      type: Action.RefreshInvite,
      data: null,
    })
  }

  /** 保存公开身份信息；只有私有 NotifyUserInfo 响应可以更改恢复令牌 */
  saveUserInfoToSession(data: UserInfo) {
    const { resumeToken: _resumeToken, ...user } = data
    sessionStorage.setItem(PeerIDQueryKey, user.peerId)
    sessionStorage.setItem(ROOM_ID, user.roomId)
    sessionStorage.setItem(DISPLAY_NAME, user.name.displayName)
    sessionStorage.setItem(USER_INFO, JSON.stringify(user))
  }

  get userInfo() {
    return JSON.parse(sessionStorage.getItem(USER_INFO) || '{}') as UserInfo
  }

  requestUserInfo(timeout = 10000): Promise<UserInfo> {
    if (this.pendingUserInfoPromise) {
      return this.pendingUserInfoPromise
    }

    this.pendingUserInfoPromise = new Promise<UserInfo>((resolve, reject) => {
      this.pendingUserInfoResolve = resolve
      this.pendingUserInfoReject = reject
      this.pendingUserInfoTimer = setTimeout(() => {
        this.finishPendingUserInfoRequest(new Error(this.formatError('user_info_timeout')))
      }, timeout)

      this.connect()
      this.send({
        type: Action.JoinRoom,
        data: {},
      })
    })
      .finally(() => {
        this.pendingUserInfoPromise = null
      })

    return this.pendingUserInfoPromise
  }

  connect() {
    if (this.disposed || this.isConnected || this.server?.readyState === WebSocket.CONNECTING || !navigator.onLine)
      return

    clearTimeout(this.reconnectTimer)
    const socket = new WebSocket(ServerConnection.endPoint().href)
    this.server = socket
    socket.onopen = () => {
      if (this.server !== socket || this.disposed)
        return
      this.reconnectAttempts = 0
      this.onOpen()
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = setInterval(() => {
        if (this.isConnected)
          socket.send(JSON.stringify({ type: Action.Ping, data: null }))
      }, HEART_BEAT_TIME)
    }
    socket.onmessage = (event) => {
      if (this.server === socket && !this.disposed)
        this.onMessage(event)
    }
    socket.onclose = (event) => {
      if (this.server !== socket)
        return
      clearInterval(this.heartbeatTimer)
      this.server = null
      /** 被同一会话的新连接替换时，旧页面不应自动重连并反复抢占 */
      if (event.code === 4001) {
        this.close()
        this.opts.onError?.({ message: this.formatError('session_replaced'), code: 'session_replaced' })
        return
      }
      this.scheduleReconnect()
    }
    socket.onerror = this.onError
  }

  /** 释放连接、心跳、重连计时器和网络监听；可重复调用 */
  close() {
    if (this.disposed)
      return
    this.disposed = true
    clearInterval(this.heartbeatTimer)
    clearTimeout(this.reconnectTimer)
    window.removeEventListener('online', this.onOnline)
    const socket = this.server
    this.server = null
    socket?.close()
    this.backlogOfData = []
    this.finishPendingUserInfoRequest(new Error(this.formatError('connection_closed')))
  }

  /** 网络恢复时使用最新私有令牌重新握手 */
  private onOnline = () => {
    if (this.disposed)
      return
    clearInterval(this.heartbeatTimer)
    const socket = this.server
    this.server = null
    socket?.close()
    this.connect()
  }

  /** 有界退避避免服务不可用时持续创建连接 */
  private scheduleReconnect() {
    if (this.disposed || !navigator.onLine)
      return
    const delay = Math.min(200 * 2 ** this.reconnectAttempts++, 5000)
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  private onOpen = () => {
    console.log('WS: server open')
    this.send({
      type: Action.JoinRoom,
      data: {},
    })

    let backlog = this.backlogOfData.shift()
    while (backlog) {
      this.send(backlog)
      backlog = this.backlogOfData.shift()
    }
  }

  private onMessage = (ev: MessageEvent) => {
    const data = JSON.parse(ev.data) as SendData<any>

    switch (data.type) {
      /**
       * 通知
       */
      case Action.NotifyUserInfo: {
        const { resumeToken, ...user } = data.data as UserInfo
        if (resumeToken)
          sessionStorage.setItem(ResumeTokenQueryKey, resumeToken)
        else sessionStorage.removeItem(ResumeTokenQueryKey)
        this.saveUserInfoToSession(user)
        this.finishPendingUserInfoRequest(undefined, user)
        this.opts.onNotifyUserInfo(user)
        break
      }

      /**
       * 房间
       */
      case Action.JoinRoom:
        this.saveAllUsers(data.data)
        this.opts.onJoinRoom(data.data)
        break
      case Action.LeaveRoom:
        this.rmUser(data.data)
        this.opts.onLeaveRoom(data.data)
        break

      /**
       * 信令
       */
      case Action.Offer:
        Events.emit(Action.Offer, data)
        break
      case Action.Answer:
        Events.emit(Action.Answer, data)
        break
      case Action.Candidate:
        Events.emit(Action.Candidate, data)
        break

      /**
       * 文件传输前
       */
      case Action.FileMetas:
        // @2. [接收方] 收到文件元数据，展示前端 UI
        Events.emit(Action.FileMetas, data)
        break

      /**
       * 统一邀请协议
       */
      case Action.InviteCreated:
        this.opts.onInviteCreated?.(data.data)
        break
      case Action.InviteInvalidated:
        this.opts.onInviteInvalidated?.(data.data)
        break

      /**
       * 用户重连
       */
      case Action.UserReconnected:
        this.opts.onUserReconnected?.(data.data)
        break

      case Action.Error:
        this.opts.onError?.(data.data)
        break

      /**
       * 房间码失效
       */
      case Action.RoomCodeExpired:
        this.opts.onRoomCodeExpired?.(data.data)
        break

      /**
       * RTC错误广播
       */
      case Action.RTCErrorBroadcast:
        console.warn('收到RTC错误广播:', data.data)
        this.opts.onRTCErrorBroadcast?.(data.data as RTCErrorInfo)
        this.opts.onError?.({
          message: this.formatError('rtc_error'),
          code: 'rtc_error',
        })
        break

      default:
        break
    }
  }

  private saveAllUsers(users: UserInfo[]) {
    this.allUsers = users
  }

  private rmUser(user: UserInfo) {
    this.allUsers = this.allUsers.filter(u => u.peerId !== user.peerId)
  }

  private onError = (error: any) => {
    console.error(error)
  }

  /** 在错误发生时调用展示策略，避免缓存过期语言 */
  private formatError(code: ServerConnectionErrorCode): string {
    return this.opts.formatError?.(code) ?? code
  }

  private finishPendingUserInfoRequest(error?: Error, userInfo?: UserInfo) {
    if (this.pendingUserInfoTimer) {
      clearTimeout(this.pendingUserInfoTimer)
      this.pendingUserInfoTimer = undefined
    }

    if (error) {
      this.pendingUserInfoReject?.(error)
    }
    else if (userInfo) {
      this.pendingUserInfoResolve?.(userInfo)
    }

    this.pendingUserInfoResolve = undefined
    this.pendingUserInfoReject = undefined
  }

  /** 获取页面源地址，可显式覆盖端口；默认使用页面当前端口 */
  static getUrl(port?: string) {
    const url = new URL(location.origin)

    if (port) {
      url.port = port
    }

    return {
      hostname: url.hostname,
      port: url.port,
      protocol: url.protocol,
      href: url.origin,
    }
  }

  static endPoint() {
    const resumeToken = sessionStorage.getItem(ResumeTokenQueryKey)
    /** 开发时覆盖信令端口，生产环境沿用页面地址 */
    const { href } = ServerConnection.getUrl(
      import.meta.env.DEV
        ? '3001'
        : undefined,
    )
    const url = new URL(import.meta.env[SERVER_URL] || href.replace(/^http/, 'ws'))

    url.searchParams.delete(PeerIDQueryKey)
    url.searchParams.delete(ResumeTokenQueryKey)
    if (resumeToken)
      url.searchParams.set(ResumeTokenQueryKey, resumeToken)

    return url
  }
}

/** 稳定的客户端连接错误类别，供调用方决定展示策略 */
export type ServerConnectionErrorCode = 'peer_not_found' | 'session_replaced' | 'rtc_error' | 'user_info_timeout' | 'connection_closed'

export type ServerConnectionOpts = {
  /**
   * 将本地错误类别格式化为当前语言；由调用方注入，不影响服务端原始错误
   * @default 未提供时返回稳定错误码
   */
  formatError?: (code: ServerConnectionErrorCode) => string

  onNotifyUserInfo: (user: UserInfo) => void
  onJoinRoom: (user: UserInfo[]) => void
  onLeaveRoom: (user: UserInfo) => void

  onInviteCreated?: (data: RoomInviteInfo) => void
  onInviteInvalidated?: (data: InviteInvalidatedInfo) => void
  onUserReconnected?: (data: UserReconnectedInfo) => void
  onRTCErrorBroadcast?: (data: RTCErrorInfo) => void
  onError?: (data: { message: string; code?: ServerConnectionErrorCode }) => void
  onRoomCodeExpired?: (data: RoomCodeExpiredInfo) => void
}
