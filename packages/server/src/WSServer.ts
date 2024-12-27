import type { Server } from 'node:http'
import { WebSocketServer, RawData } from 'ws'
import { Peer } from '@/Peer'
import { Action, HEART_BEAT, HEART_BEAT_TIME } from 'web-share-common'
import type { ToUser, PingData, SendData, UserInfo, SendUserInfo, Sdp } from 'web-share-common'


export class WSServer {

  ws: WebSocketServer
  opts: Required<WSServerOpts>
  peerMap = new Map<string, Peer>()
  allUsers: UserInfo[] = []

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
      this.peerMap.set(peer.id, peer)

      this.onConnection(peer)
    })

    // this.keepAliveClear()
  }

  private onConnection = (peer: Peer) => {
    const { socket } = peer
    socket.on('message', (data) => this.onMessage(peer, data))
  }

  /**
   * 广播全员
   */
  private boardcast(data: any, excludeId?: string) {
    this.peerMap.forEach(peer => {
      if (peer.id === excludeId) return
      this.send(peer, data)
    })
  }

  private send<T = any>(sender: Peer, data: SendData<T>) {
    sender.socket.send(JSON.stringify(data))
  }

  /**
   * 发给指定用户
   */
  private sendTo<T>(toId: string, data: ToUser<T>) {
    const peer = this.peerMap.get(toId)
    if (!peer) return 
    this.send(peer, data)
  }

  /**
   * 通知连接者自己的信息
   */
  private notifyUserInfo(peer: Peer) {
    const user = {
      ...peer.getInfo(),
      peerId: peer.id
    }
    /**
     * 去重
     */
    const uniqueIds = new Set(this.allUsers.map(user => user.peerId))
    if (!uniqueIds.has(peer.id)) {
      this.allUsers.push(user)
    }

    const data: SendUserInfo = {
      data: user,
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
        this.saveInfo(sender, msg)
        break

      case Action.JoinPublicRoom:
        this.notifyUserInfo(sender)
        this.boardcast(
          {
            type: Action.JoinPublicRoom,
            data: this.allUsers
          },
        )
        break

      case Action.Relay:
        const data = msg as ToUser
        this.sendTo(data.data.toId, {
          ...data,
          type: data.data.type
        })
        break

      default:
        break
    }
  }

  private saveInfo(sender: Peer, data: PingData) {
    sender[HEART_BEAT] = data.data[HEART_BEAT]
  }

  /**
   * 心跳检测，定时清理离线连接者
   */
  private keepAliveClear() {
    const delUserInfo = (peerId: string) => {
      this.allUsers = this.allUsers.filter(user => user.peerId !== peerId)
    }

    setInterval(() => {
      const clients = this.allUsers.map(user => user.name.displayName).join(', ')
      clients.length && console.log(`客户端: ${clients}`)

      let isLeave = false

      this.peerMap.forEach(peer => {
        const now = Date.now()
        if (now - peer[HEART_BEAT] > this.opts.clearTime) {
          console.log('被清理了，原因是超时')
          this.peerMap.delete(peer.id)
          isLeave = true
        }
        else if (!peer.socket) {
          console.log('被清理了，原因是没有连接')
          this.peerMap.delete(peer.id)
          isLeave = true
        }
        else if (peer.socket.readyState === WebSocket.CLOSED) {
          console.log('被清理了，原因是客户端已关闭')
          this.peerMap.delete(peer.id)
          isLeave = true
        }

        delUserInfo(peer.id)
        if (isLeave) {
          this.boardcast(
            {
              type: Action.LeavePublicRoom,
              data: this.allUsers
            },
          )
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