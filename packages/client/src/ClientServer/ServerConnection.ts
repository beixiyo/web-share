import { Action, DISPLAY_NAME, HEART_BEAT_TIME, PEER_ID, USER_INFO } from 'web-share-common'
import type { SendData, UserInfo, To, FileMeta } from 'web-share-common'
import { Events } from './Events'
import { WS } from '@jl-org/tool'


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

  opts: ServerConnectionOpts

  constructor(opts: ServerConnectionOpts = {}) {
    this.opts = opts
    this.connect()
  }

  send<T>(data: SendData<T>) {
    if (!this.server?.isConnected) return
    this.server?.send(JSON.stringify(data))
  }

  /**
   * 中转数据到指定用户
   */
  relay<T>(data: To & T) {
    if (!this.server?.isConnected) return
    this.server?.send(JSON.stringify({
      type: Action.Relay,
      data
    }))
  }

  private connect() {
    if (this.server?.isConnected || this.server?.isConnecting || this.server?.isOffline) return

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
      heartbeatInterval: HEART_BEAT_TIME - 1000,
      genHeartbeatMsg: () => ({
        data: null,
        type: Action.Ping
      }),
      onVisible: onConnect
    })

    onConnect(ws.connect())
  }

  private onOpen = () => {
    console.log('WS: server open')
    this.send({
      type: Action.JoinPublicRoom,
      data: null
    })
  }

  private onMessage = (ev: MessageEvent) => {
    const data = JSON.parse(ev.data) as SendData<any>

    switch (data.type) {
      /**
       * 通知
       */
      case Action.NotifyUserInfo:
        this.saveToSession(data.data)
        this.opts.onNotifyUserInfo?.(data.data)
        break

      /**
       * 房间
       */
      case Action.JoinPublicRoom:
        this.saveAllUsers(data.data)
        this.opts.onJoinPublicRoom?.(data.data)
        break
      case Action.LeavePublicRoom:
        this.rmUser(data.data)
        this.opts.onLeavePublicRoom?.(data.data)
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
        Events.emit(Action.FileMetas, data)
        break

      default:
        break
    }
  }

  private saveToSession(data: UserInfo) {
    sessionStorage.setItem(PEER_ID, data.peerId)
    sessionStorage.setItem(DISPLAY_NAME, data.name.displayName)
    sessionStorage.setItem(USER_INFO, JSON.stringify(data))
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

  private static endPoint() {
    const peerId = sessionStorage.getItem(PEER_ID)
    const server = import.meta.env.SERVER || location.hostname
    const port = import.meta.env.PORT || '3001'
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'

    const url = new URL(`${protocol}://${server}:${port}/`)

    if (peerId) {
      url.searchParams.set(PEER_ID, peerId)
    }

    return url
  }

}


export type ServerConnectionOpts = {
  onNotifyUserInfo?: (user: UserInfo) => void
  onJoinPublicRoom?: (user: UserInfo[]) => void
  onLeavePublicRoom?: (user: UserInfo) => void
}