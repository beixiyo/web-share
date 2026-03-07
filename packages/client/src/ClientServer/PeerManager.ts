import type { Candidate, FileMeta, Sdp, To, UserReconnectedInfo } from 'web-share-common'
import type { ServerConnection } from './ServerConnection'
import { Action } from 'web-share-common'
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
