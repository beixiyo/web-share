import type { InviteInvalidatedInfo, JoinInviteInfo, JoinRoomCodeInfo, JoinRoomInfo, RoomCodeExpiredInfo, RoomInviteInfo, RTCErrorInfo, SendData, To, UserInfo, UserReconnectedInfo } from 'web-share-common'
import { WS } from '@jl-org/tool'
import { Action, DISPLAY_NAME, HEART_BEAT_TIME, PEER_ID, ROOM_ID, SERVER_URL, USER_INFO } from 'web-share-common'
import { Events } from './Events'

/**
 * 管理与 WebSocket 服务器的连接
 *
 * 处理连接、断开连接、消息发送和接收等功能
 * 监听各种事件 如 visibilityChange，并相应地处理 WebSocket 连接和消息
 */
export class ServerConnection {
  declare timer: number
  declare pingTimer: number
  server: WS | null = null
  allUsers: UserInfo[] = []
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
    this.connect()
  }

  get isConnected() {
    return this.server?.isConnected
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
    if (!this.isConnected)
      return
    this.server?.send(JSON.stringify({
      type: Action.Relay,
      data,
    }))
  }

  /**
   * 加入房间
   */
  joinDirectRoom(roomId: string, peerId?: string) {
    peerId = peerId || sessionStorage.getItem(PEER_ID) || undefined
    if (!peerId) {
      this.opts.onError?.({ message: '找不到用户' })
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

  saveUserInfoToSession(data: UserInfo) {
    sessionStorage.setItem(PEER_ID, data.peerId)
    sessionStorage.setItem(ROOM_ID, data.roomId)
    sessionStorage.setItem(DISPLAY_NAME, data.name.displayName)
    sessionStorage.setItem(USER_INFO, JSON.stringify(data))
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
        this.finishPendingUserInfoRequest(new Error('获取用户信息超时'))
      }, timeout)

      this.connect()
      this.send({
        type: Action.JoinRoom,
        data: this.userInfo,
      })
    })
      .finally(() => {
        this.pendingUserInfoPromise = null
      })

    return this.pendingUserInfoPromise
  }

  connect() {
    if (this.server?.isConnected || this.server?.isConnecting || this.server?.isOffline)
      return

    const onConnect = (socket: WebSocket) => {
      // socket.binaryType = 'arraybuffer'
      socket.onopen = this.onOpen
      socket.onmessage = this.onMessage
      socket.onclose = this.onClose
      socket.onerror = this.onError

      this.server = ws
    }

    const ws = new WS({
      url: ServerConnection.endPoint().href,
      leaveTime: -1,
      heartbeatInterval: HEART_BEAT_TIME,
      stopOnHidden: false,
      genHeartbeatMsg: () => ({
        data: null,
        type: Action.Ping,
      }),
      // onVisible: onConnect,
    })

    onConnect(ws.connect())
  }

  private onOpen = () => {
    console.log('WS: server open')
    const userInfo = this.userInfo
    this.send({
      type: Action.JoinRoom,
      data: userInfo,
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
      case Action.NotifyUserInfo:
        this.saveUserInfoToSession(data.data)
        this.finishPendingUserInfoRequest(undefined, data.data)
        this.opts.onNotifyUserInfo(data.data)
        break

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
          message: `RTC连接出现错误: ${data.data?.errorMessage || '未知错误'}`,
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

  private onClose = () => {
    console.log('WS: server close')
  }

  private onError = (error: any) => {
    console.error(error)
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

  static getUrl(port?: string) {
    port = port || location.port
    const hostname = location.hostname
    const protocol = location.protocol
    const href = `${protocol}//${hostname}:${port}`

    return {
      hostname,
      port,
      protocol,
      href,
    }
  }

  static endPoint() {
    const peerId = sessionStorage.getItem(PEER_ID)
    let {
      hostname,
      port,
      protocol,
    } = ServerConnection.getUrl('3001')
    protocol = protocol === 'https:'
      ? 'wss'
      : 'ws'

    const url = new URL(import.meta.env[SERVER_URL] || `${protocol}://${hostname}:${port}/`)

    if (peerId) {
      url.searchParams.set(PEER_ID, peerId)
    }

    return url
  }
}

export type ServerConnectionOpts = {
  onNotifyUserInfo: (user: UserInfo) => void
  onJoinRoom: (user: UserInfo[]) => void
  onLeaveRoom: (user: UserInfo) => void

  onInviteCreated?: (data: RoomInviteInfo) => void
  onInviteInvalidated?: (data: InviteInvalidatedInfo) => void
  onUserReconnected?: (data: UserReconnectedInfo) => void
  onRTCErrorBroadcast?: (data: RTCErrorInfo) => void
  onError?: (data: { message: string }) => void
  onRoomCodeExpired?: (data: RoomCodeExpiredInfo) => void
}
