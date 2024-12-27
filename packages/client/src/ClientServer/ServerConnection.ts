import { Action, DISPLAY_NAME, HEART_BEAT, HEART_BEAT_TIME, PEER_ID } from 'web-share-common'
import type { ToUser, PingData, SendData, UserInfo, SendUserInfo, Sdp, To, Candidate, FileMeta, ProgressData } from 'web-share-common'
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
  server: WebSocket | null = null
  allUsers: UserInfo[] = []
  opts: Required<ServerConnectionOpts>

  constructor(opts: ServerConnectionOpts = {}) {
    const defaultOpts: Required<ServerConnectionOpts> = {
      leaveTime: 1000 * 10
    }
    this.opts = Object.assign(opts, defaultOpts)
    this.connect()
    this.bindEvent()
  }

  send<T>(data: SendData<T>) {
    if (!this.isConnected) return
    this.server?.send(JSON.stringify(data))
  }

  /**
   * 中转数据到指定用户
   */
  relay<T>(data: ToUser<T>) {
    if (!this.isConnected) return
    this.server?.send(JSON.stringify(data))
  }

  bindEvent() {
    // @ts-ignore
    if (window.navigator.connection) {
      // @ts-ignore
      window.navigator.connection.addEventListener('change', () => this.reconnect())
    }

    document.addEventListener('visibilitychange', this.onVisibilityChange)
  }

  get isConnected() {
    return this.server?.readyState === WebSocket.OPEN
  }

  get isConnecting() {
    return this.server?.readyState === WebSocket.CONNECTING
  }

  get isOffline() {
    return !navigator.onLine
  }

  get isClose() {
    return this.server?.readyState === WebSocket.CLOSED
  }

  private connect() {
    if (this.isConnected || this.isConnecting || this.isOffline) return

    const ws = new WebSocket(ServerConnection.endPoint())
    ws.binaryType = 'arraybuffer'
    ws.onopen = this.onOpen
    ws.onmessage = this.onMessage
    ws.onclose = this.onClose
    ws.onerror = this.onError

    this.server = ws
    this.heartBeat()
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
      case Action.NotifyUserInfo:
        this.saveInfo(data.data)
        Events.emit(Action.NotifyUserInfo, data.data)
        break

      case Action.JoinPublicRoom:
        this.saveAllUsers(data.data)
        Events.emit(Action.JoinPublicRoom, data.data)
        break
      case Action.LeavePublicRoom:
        this.saveAllUsers(data.data)
        Events.emit(Action.LeavePublicRoom, data.data)
        break

      case Action.Offer:
        this.handleOffer(data.data)
        break
      case Action.Answer:
        this.handleAnswer(data.data)
        break
      case Action.Candidate:
        this.handleCandidate(data.data)
        break

      case Action.Progress:
        this.handleProgress(data.data)
        break

      default:
        break
    }
  }

  private handleOffer(data: To & Sdp) {
    Events.emit(Action.Offer, data)
  }

  private handleAnswer(data: To & Sdp) {
    Events.emit(Action.Answer, data)
  }

  private handleCandidate(data: To & Candidate) {
    Events.emit(Action.Candidate, data)
  }

  private handleProgress(data: To & ProgressData) {
    Events.emit(Action.Progress, data)
  }

  private saveInfo(data: UserInfo) {
    sessionStorage.setItem(PEER_ID, data.peerId)
    sessionStorage.setItem(DISPLAY_NAME, data.name.displayName)
  }

  private saveAllUsers(users: UserInfo[]) {
    this.allUsers = users
  }

  private onClose = () => {
    console.log('WS: server close')
  }

  private onError = (error: any) => {
    console.error(error)
  }

  private reconnect() {
    this.server?.close()
    this.connect()
  }

  private onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && this.isClose) {
      this.reconnect()
    }
    else if (document.visibilityState === 'hidden') {
      clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.server?.close()
      }, this.opts.leaveTime)
    }
  }

  private static endPoint() {
    const peerId = sessionStorage.getItem(PEER_ID)
    const server = import.meta.env.SERVER || 'localhost'
    const port = import.meta.env.PORT || '3001'
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'

    const url = new URL(`${protocol}://${server}:${port}/`)

    if (peerId) {
      url.searchParams.set(PEER_ID, peerId)
    }

    return url
  }

  private heartBeat() {
    clearInterval(this.pingTimer)
    this.pingTimer = setInterval(() => {
      const data: PingData = {
        data: {
          heartBeat: Date.now()
        },
        type: Action.Ping
      }
      this.send(data)
    }, HEART_BEAT_TIME - 1000)
  }
}


export type ServerConnectionOpts = {
  /**
   * 页面不可见时，多久断开连接
   * @default 1000 * 10
   */
  leaveTime?: number
}