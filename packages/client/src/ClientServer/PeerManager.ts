import type { Candidate, FileMeta, Sdp, To, UserReconnectedInfo } from 'web-share-common'
import type { ServerConnection } from './ServerConnection'
import { Action, USER_INFO } from 'web-share-common'
import { modal } from '@/utils'
import { Events } from './Events'
import { RTCPeer, type RTCPeerOpts } from './RTCPeer'

/**
 * 管理所有对等方连接
 */
export class PeerManager {
  peerMap: Map<string, RTCPeer> = new Map()

  constructor(
    public server: ServerConnection,
  ) {
    if (typeof RTCPeerConnection === 'undefined') {
      modal.error({
        title: 'WebRTC 不可用',
        content: 'WebRTC 在你的设备不可用，请尝试关闭浏览器扩展，或者开启无痕模式。如果还不能用，请更新浏览器版本，推荐使用 Chrome 浏览器',
      })
      return
    }

    Events.on(Action.Offer, this.onOffer)
    Events.on(Action.Answer, this.onAnswer)
    Events.on(Action.Candidate, this.onCandidate)

    // @3. [接收方] 收到文件元数据，展示前端 UI
    Events.on(Action.FileMetas, this.onFileMetas)

    /** 监听页面可见性变化，而不是页面隐藏 */
    this.setupVisibilityHandling()
  }

  /**
   * 设置页面可见性处理
   */
  private setupVisibilityHandling() {
    let isPageHidden = false

    /** 监听页面可见性变化 */
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        isPageHidden = true
        console.log('页面切换到后台，标记为隐藏状态')
      }
      else if (document.visibilityState === 'visible' && isPageHidden) {
        isPageHidden = false
        console.log('页面从后台恢复，重新同步用户状态')
        /** 页面恢复时重新同步用户状态 */
        this.syncUserStatusOnResume()
      }
    })

    /**
     * 只在真正关闭页面时发送离开消息
     * 移动端切后台也会触发
     */
    window.addEventListener('beforeunload', () => {
      const userInfo = sessionStorage.getItem(USER_INFO)
      console.log('页面即将关闭，发送离开消息', userInfo)
      if (!userInfo)
        return

      this.server.send({
        type: Action.LeaveRoom,
        data: JSON.parse(userInfo),
      })
    })
  }

  /**
   * 页面恢复时同步用户状态
   */
  private syncUserStatusOnResume() {
    /** 重新请求房间用户列表 */
    const userInfo = sessionStorage.getItem(USER_INFO)
    if (!userInfo)
      return

    const parsedUserInfo = JSON.parse(userInfo)
    this.server.send({
      type: Action.JoinRoom,
      data: parsedUserInfo,
    })
  }

  /**
   * 创建或获取一个对等方
   */
  createPeer(peerId: string, opts: RTCPeerOpts = {}) {
    if (this.peerMap.has(peerId)) {
      return this.getPeer(peerId)!
    }

    const peer = new RTCPeer({
      peerId,
      server: this.server,
      ...opts,
    })

    this.peerMap.set(peerId, peer)
    return peer
  }

  getPeer(peerId: string) {
    return this.peerMap.get(peerId)
  }

  rmPeer(peerId: string) {
    const peer = this.peerMap.get(peerId)
    if (peer) {
      console.log(`Removing peer: ${peerId}, closing its connection.`)
      peer.close()
      this.peerMap.delete(peerId)
    }
  }

  /**
   * 处理用户重连，清理旧连接并重新建立连接
   */
  handleUserReconnection(reconnectionInfo: UserReconnectedInfo) {
    const { oldPeerId, newPeerId, userInfo } = reconnectionInfo

    console.log(`处理用户重连: ${userInfo.name.displayName}`)
    console.log(`旧peerId: ${oldPeerId}, 新peerId: ${newPeerId}`)

    /** 清理旧连接 */
    this.rmPeer(oldPeerId)

    /** 创建新连接 */
    const newPeer = this.createPeer(newPeerId)

    console.log(`用户 ${userInfo.name.displayName} 重连完成，新连接已建立`)

    return newPeer
  }

  /***************************************************
   *                    Events
   ***************************************************/

  onOffer = (offer: Sdp & To) => {
    const peer = this.getPeer(offer.toId)
    if (peer) {
      peer.handleOffer(offer)
    }
  }

  onAnswer = (answer: Sdp & To) => {
    const peer = this.getPeer(answer.toId)
    if (peer) {
      peer.handleAnswer(answer)
    }
  }

  onCandidate = (candidate: Candidate & To) => {
    const peer = this.getPeer(candidate.toId)
    if (peer) {
      peer.handleCandidate(candidate)
    }
  }

  onFileMetas = (data: To & { data: FileMeta[] }) => {
    const peer = this.getPeer(data.toId)
    if (peer) {
      peer.handleFileMetas(data.data)
    }
  }
}
