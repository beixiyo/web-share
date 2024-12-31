import type { Optional } from '@jl-org/ts-tool'


/**
 * 根据网络状态自动重连的，自动发送心跳数据的 WebSocket
 */
export class WS {

  private opts: Optional<Required<WSOpts>, 'protocols'>
  socket: WebSocket | null = null

  /** 心跳计时器 id */
  private heartbeatTimer?: number
  /** 离开页面计时器 id */
  private leaveTimer?: number

  /** 删除事件 */
  private rmNetEvent?: VoidFunction

  constructor(opts: WSOpts) {
    const defaultOpts = {
      protocols: [],
      heartbeatInterval: 5000,
      genHeartbeatMsg: () => ({ type: 'Ping', data: null }),
      leaveTime: 10000,
    }
    this.opts = {
      ...defaultOpts,
      ...opts,
    }
  }

  /**
   * socket.readyState === WebSocket.OPEN
   */
  get isConnected() {
    return this.socket?.readyState === WebSocket.OPEN
  }

  /**
   * socket.readyState === WebSocket.CONNECTING
   */
  get isConnecting() {
    return this.socket?.readyState === WebSocket.CONNECTING
  }

  /**
   * socket.readyState === WebSocket.CLOSING
   */
  get isClose() {
    return this.socket?.readyState === WebSocket.CLOSED
  }

  /**
   * 网络状态是否离线，!window.navigator.onLine
   */
  get isOffline() {
    return !window.navigator.onLine
  }

  send(message: Parameters<WebSocket['send']>[0]) {
    if (this.socket && this.isConnected) {
      this.socket.send(message)
      return
    }

    console.warn('未连接，请先调用 connect')
  }

  connect() {
    this.rmNetEvent?.()
    this.rmNetEvent = this.bindNetEvent()

    if (this.socket && this.isConnected) {
      return
    }

    this.socket = new WebSocket(this.opts.url, this.opts.protocols)
    this.heartbeat()
  }

  close() {
    if (this.socket) {
      this.rmNetEvent?.()
      this.socket.close()
      this.socket = null
    }
    clearInterval(this.heartbeatTimer)
  }

  // 私有方法 ==================================================

  /**
   * 页面不可见时，关闭连接。恢复时，重新连接
   */
  private onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && this.isClose) {
      this.connect()
    }
    else if (document.visibilityState === 'hidden') {
      clearTimeout(this.leaveTimer)
      clearInterval(this.heartbeatTimer)
      
      this.leaveTimer = window.setTimeout(() => {
        this.socket?.close()
      }, this.opts.leaveTime)
    }
  }

  /** 网络状态变更处理逻辑 */
  private bindNetEvent() {
    const onOnline = () => {
      console.log('网络恢复，尝试重连...')
      this.connect()
      this.heartbeat()
    }
    const onOffline = () => {
      console.log('网络断开，停止心跳检测')
      clearInterval(this.heartbeatTimer)
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('visibilitychange', this.onVisibilityChange)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('visibilitychange', this.onVisibilityChange)
    }
  }

  /** 开始心跳检测，定时发送心跳消息 */
  private heartbeat() {
    if (
      !this.isConnected ||
      this.opts.heartbeatInterval === -1
    ) return
    clearInterval(this.heartbeatTimer)

    this.heartbeatTimer = window.setInterval(
      () => {
        this.socket?.send(JSON.stringify(this.opts.genHeartbeatMsg()))
        console.log('发送心跳中...')
        return
      },
      this.opts.heartbeatInterval
    )
  }

}


export type WSOpts = {
  url: string
  protocols?: string | string[]
  /** 
   * 发送心跳数据间隔，单位 ms。-1 表示不发送心跳
   * @default 5000
   */
  heartbeatInterval?: number
  /**
   * 生成心跳数据函数
   * @default () => ({ type: 'Ping', data: null })
   */
  genHeartbeatMsg?: () => any
  /**
   * 页面不可见时，多久后断开连接，单位 ms
   * @default 10000
   */
  leaveTime?: number
}
