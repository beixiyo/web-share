import { Action, USER_INFO } from 'web-share-common'
import type { To, Sdp, Candidate } from 'web-share-common'
import { Events } from './Events'
import { RTCPeer, type RTCPeerOpts } from './RTCPeer'
import type { ServerConnection } from './ServerConnection'


/**
 * 管理所有对等方连接
 */
export class PeerManager {

  peerMap: Map<string, RTCPeer> = new Map()

  constructor(
    public server: ServerConnection
  ) {
    Events.on(Action.Offer, this.onOffer)
    Events.on(Action.Answer, this.onAnswer)
    Events.on(Action.Candidate, this.onCandidate)

    window.addEventListener('pagehide', e => {
      const userInfo = sessionStorage.getItem(USER_INFO)
      console.log('pagehide', userInfo)
      if (!userInfo) return

      server.send({
        type: Action.LeavePublicRoom,
        data: JSON.parse(userInfo)
      })
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
      ...opts
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

}