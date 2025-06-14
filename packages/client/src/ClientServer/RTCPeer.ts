import type { Candidate, FileMeta, ProgressData, RTCBaseData, RTCTextData, Sdp, SendData, To } from 'web-share-common'
import type { FileInfo } from '@/types/fileInfo'
import { compressImg, FileChunker, getImg, isStr, type MIMEType } from '@jl-org/tool'
import { Action, SELECTED_PEER_ID } from 'web-share-common'
import { Peer, type PeerOpts } from './Peer'

export class RTCPeer extends Peer {
  private isCaller = false
  private opts: PeerOpts & RTCPeerOpts
  onChannelReady?: Function
  private remotePeerId?: string

  declare pc: RTCPeerConnection | null
  channel: RTCDataChannel | null = null

  downloadRafId: number[] = []
  /** 文件传输器尚未创建完毕时，接收的数据缓冲区 */
  downloadBuffer: Uint8Array[] = []

  /**
   * sendFiles 时传递的 Promise.resolve
   * 当对方同意接收文件时执行，触发文件传输
   */
  private onAcceptFile?: Function
  /**
   * sendFiles 时传递的失败回调
   * 当对方拒绝接收文件时执行
   */
  private onDenyFile?: Function

  constructor(opts: PeerOpts & RTCPeerOpts) {
    super(opts)
    this.opts = opts
    this.connect()
  }

  connect() {
    if (this.pc) {
      this.close()
    }

    if (!this.pc || this.isSignalClose) {
      this.pc = new RTCPeerConnection({
        iceServers: [
          {
            urls: 'stun:stun.l.google.com:19302',
          },
        ],
      })

      this.pc.ondatachannel = this.onChannelOpened
      this.pc.onicecandidate = this.onIceCandidate

      this.pc.onconnectionstatechange = () => {
        console.log('RTC: 连接状态:', this.pc?.connectionState)
        if (this.pc?.connectionState === 'failed') {
          this.broadcastRTCError('RTC连接失败', 'CONNECTION_FAILED')
        }
      }

      this.pc.oniceconnectionstatechange = () => {
        console.log('ICE 连接状态:', this.pc?.iceConnectionState)
        if (this.pc?.iceConnectionState === 'failed') {
          this.broadcastRTCError('ICE连接失败', 'ICE_CONNECTION_FAILED')
        }
      }
    }

    /**
     * 重连
     */
    if (this.isCaller) {
      const targetId = this.toId
      if (!targetId)
        return
      this.sendOffer(targetId)
    }
  }

  get isSignalClose() {
    return this.pc?.signalingState === 'closed'
  }

  get isChannelClose() {
    return this.channel?.readyState === 'closed'
  }

  get channelAmountIsHigh() {
    if (!this.channelIsReady(this.channel))
      return false
    return this.channel.bufferedAmount > this.channel.bufferedAmountLowThreshold
  }

  get toId() {
    return this.remotePeerId || sessionStorage.getItem(SELECTED_PEER_ID)
  }

  /**
   * Channel 是否已连接上
   */
  get isChannelOpen() {
    return this.channel?.readyState === 'open'
  }

  channelIsReady(channel: RTCDataChannel | null): channel is RTCDataChannel {
    return channel?.readyState === 'open'
  }

  close() {
    if (this.channel) {
      this.channel.onclose = null // 移除事件处理器，防止意外调用
      this.channel.onmessage = null
      this.channel.onerror = null
      this.channel.onopen = null
      if (this.channel.readyState !== 'closed') {
        this.channel.close()
      }
      this.channel = null
    }

    if (this.pc) {
      this.pc.onicecandidate = null
      this.pc.ondatachannel = null
      this.pc.oniceconnectionstatechange = null
      this.pc.onconnectionstatechange = null
      this.pc.onsignalingstatechange = null
      if (this.pc.signalingState !== 'closed') {
        this.pc.close()
      }
      this.pc = null
    }

    console.log(`RTCPeer ${this.peerId} 已关闭.`)
  }

  /***************************************************
   *                    Send
   ***************************************************/

  sendText(text: string) {
    const data: RTCTextData = {
      data: text,
      type: Action.Text,
    }
    this.sendJSON(data)
  }

  /**
   * 发送文件
   * @param promiseResolver 对方同意后，会触发 resolve
   * @param onDeny 对方拒绝后，触发的回调
   */
  async sendFiles(
    files: File[],
    onDenyFile?: VoidFunction,
  ) {
    /**
     * 发送文件后，复制 resolve，等待被调用后执行下载文件
     */
    const { promise, resolve } = Promise.withResolvers<void>()
    this.onAcceptFile = resolve
    this.onDenyFile = onDenyFile

    return promise.then(async () => {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const fileInfo: FileInfo = {
          lastModified: file.lastModified,
          name: file.name,
          size: file.size,
          type: file.type as MIMEType,
        }
        this.sendJSON({ type: Action.NewFile, data: fileInfo })
        const chunker = new FileChunker(file, {
          chunkSize: this.chunkSize,
          startOffset: 0,
        })

        while (!chunker.done) {
          if (this.isChannelClose) {
            console.error('RTC: channel 已关闭, 中断文件传输')
            return
          }
          const blob = chunker.next()
          const arrayBuffer = await blob.arrayBuffer()

          if (this.channelAmountIsHigh) {
            await this.waitUntilChannelIdle()
            this.send(arrayBuffer)
          }
          else {
            this.send(arrayBuffer)
          }

          const progressData: ProgressData = {
            curIndex: i,
            progress: chunker.progress,
            total: this.fileMetaCache.length,
            filename: this.fileMetaCache[i].name,
          }
          this.sendJSON({ type: Action.Progress, data: progressData })
          this.opts.onProgress?.(progressData)
        }

        this.sendJSON({ type: Action.FileDone, data: null })
      }

      this.fileMetaCache = []
    })
  }

  /**
   * 发送元数据和预览图
   */
  async sendFileMetas(files: File[]) {
    if (!this.toId) {
      return console.warn('没有指定对方 ID，无法发送文件元数据')
    }

    console.log(`发送 ${files[0].name}`)
    const getMeta = (file: File) => ({
      name: file.name,
      size: file.size,
      type: file.type,
      totalChunkSize: Math.ceil(file.size / this.chunkSize),
      fromId: this.peerId,
    })

    let hasImg = false
    this.fileMetaCache = files.map(getMeta)

    const proms = files.map((file) => {
      return new Promise<FileMeta>(async (resolve, reject) => {
        const res: FileMeta = getMeta(file)

        if (res.type.includes('image') && !hasImg) {
          hasImg = true
          const url = URL.createObjectURL(file)
          const img = await getImg(url)
          if (!img) {
            return reject('文件预览失败')
          }

          const base64 = await compressImg(img, 'base64', 0.1, 'image/webp')
          res.base64 = base64
        }

        resolve(res)
      })
    })

    const data = await Promise.all(proms)

    /**
     * 通过 WS 发送，因为 WebRTC 接收文件大小有限
     */
    this.server.relay({
      data,
      toId: this.toId,
      fromId: this.peerId,
      type: Action.FileMetas,
    })
  }

  /***************************************************
   *                    handler
   ***************************************************

  /**
   * 向指定用户发送 offer
   * @param toId 目标用户 ID
   * @param onChannelReady 通道连接成功回调，你可以用 Promise.withResolvers
   */
  async sendOffer(toId: string, onChannelReady?: Function) {
    if (!this.pc) {
      this.connect()
      this.broadcastRTCError('PeerConnection 为空，无法发送 offer', 'SEND_OFFER_ERROR')
      return
    }

    if (this.isChannelOpen) {
      console.log('RTC: channel 已经打开，无法发送 offer')
      onChannelReady?.()
      return
    }

    if (!this.channel || this.isChannelClose) {
      this.openChannel()
    }

    this.remotePeerId = toId
    this.onChannelReady = onChannelReady

    try {
      const offer = await this.pc.createOffer()
      await this.pc.setLocalDescription(offer)

      const data: To & Sdp = {
        toId,
        fromId: this.peerId,
        sdp: this.pc.localDescription!,
        type: Action.Offer,
      }
      this.server.relay(data)

      console.log(`向 ${toId} 发送 offer`, this.pc.localDescription)
    }
    catch (error) {
      this.broadcastRTCError(`创建或发送 offer 失败: ${error}`, 'SEND_OFFER_ERROR')
    }
  }

  async handleOffer(offer: Sdp & To) {
    if (!this.pc) {
      this.connect()
      this.broadcastRTCError('PeerConnection 尚未初始化，无法处理 offer', 'HANDLE_OFFER_ERROR')
      return
    }

    this.isCaller = false // 标记为接收方
    this.remotePeerId = offer.fromId

    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(offer.sdp))
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)

      const data: To & Sdp = {
        toId: offer.fromId,
        fromId: this.peerId,
        sdp: this.pc.localDescription!,
        type: Action.Answer,
      }
      this.server.relay(data)

      console.log(`接收到 ${offer.fromId} 的 offer`, offer.sdp)
      console.log(`发送 answer 给 ${data.toId}`, this.pc.localDescription)
    }
    catch (error) {
      this.broadcastRTCError(`处理 offer 失败: ${error}`, 'HANDLE_OFFER_ERROR')
    }
  }

  async handleAnswer(answer: Sdp & To) {
    if (!this.pc) {
      this.connect()
      this.broadcastRTCError('PeerConnection 尚未初始化，无法处理 answer', 'HANDLE_ANSWER_ERROR')
      return
    }

    try {
      console.log(`接收到 ${answer.fromId} 的 answer`, answer.sdp)
      await this.pc.setRemoteDescription(new RTCSessionDescription(answer.sdp))
    }
    catch (error) {
      this.broadcastRTCError(`处理 answer 失败: ${error}`, 'HANDLE_ANSWER_ERROR')
    }
  }

  async handleCandidate(candidate: Candidate & To) {
    if (!this.pc) {
      this.connect()
      this.broadcastRTCError('PeerConnection 尚未初始化，无法处理 ICE candidate', 'HANDLE_CANDIDATE_ERROR')
      return
    }

    try {
      console.log(`接收到 ${candidate.fromId} 的 ICE candidate`, candidate.candidate)
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate.candidate))
    }
    catch (error) {
      this.broadcastRTCError(`处理 ICE candidate 失败: ${error}`, 'HANDLE_CANDIDATE_ERROR')
    }
  }

  handleFileMetas(fileMeta: FileMeta[]) {
    this.opts.onFileMetas?.(fileMeta, (data) => {
      const { promise } = data
      promise
        .then(() => {
          this.sendJSON({
            type: Action.AcceptFile,
            data: null,
          })
        })
        .catch(() => {
          this.sendJSON({
            type: Action.DenyFile,
            data: null,
          })
        })
    })
  }

  /***************************************************
   *                    Private
   ***************************************************/

  /**
   * 广播 RTC 错误到房间内所有成员
   */
  private broadcastRTCError(errorMessage: string, errorType: string) {
    console.error(`RTC错误 [${errorType}]: ${errorMessage}`)

    /** 通过服务端广播错误消息 */
    this.server.send({
      type: Action.RTCError,
      data: {
        errorMessage,
        errorType,
        fromPeerId: this.peerId,
        timestamp: Date.now(),
      },
    })

    /** 延迟刷新页面，给广播一些时间 */
    setTimeout(() => {
      window.location.reload()
      console.log('RTC错误导致页面刷新')
    }, 100)
  }

  private sendJSON<T>(data: RTCBaseData<T>) {
    if (!this.channelIsReady(this.channel))
      return
    this.channel.send(JSON.stringify(data))
  }

  private send(data: any) {
    if (!this.channelIsReady(this.channel))
      return
    this.channel.send(data)
  }

  private openChannel() {
    if (!this.pc) {
      this.connect()
      return
    }

    const channel = this.pc.createDataChannel('data-channel', {
      ordered: true,
    })
    channel.onopen = this.onChannelOpened as any

    this.isCaller = true
  }

  private onChannelOpened = (e: RTCDataChannelEvent) => {
    if (!this.pc) {
      this.connect()
      return
    }
    console.log('RTC: channel 已打开，对端ID:', this.peerId)

    const channel = e.channel || e.target
    this.channel = channel

    channel.binaryType = 'arraybuffer'
    /**
     * maxMessageSize = 256KB
     * 设置阈值为可以容纳分块大小多一点
     */
    channel.bufferedAmountLowThreshold = this.pc.sctp!.maxMessageSize - this.chunkSize - 50

    channel.onclose = this.onClose
    channel.onerror = this.onChannelError
    channel.onmessage = this.onMessage
    this.onChannelReady?.()
  }

  private onIceCandidate = (e: RTCPeerConnectionIceEvent) => {
    const toId = this.toId
    if (!e.candidate || !toId)
      return

    const data: To & Candidate = {
      toId,
      fromId: this.peerId,
      candidate: e.candidate,
      type: Action.Candidate,
    }
    this.server.relay(data)

    console.log(`向 ${toId} 发送 ICE candidate`, e.candidate)
  }

  private onMessage = async (e: MessageEvent) => {
    if (isStr(e.data)) {
      const data = JSON.parse(e.data) as SendData

      switch (data.type) {
        case Action.Text:
          this.opts.onText?.(data.data)
          break

        /**
         * 文件传输前
         */
        case Action.AcceptFile:
          this.onAcceptFile?.()
          break
        case Action.DenyFile:
          this.onDenyFile?.()
          break

        /**
         * 文件传输中
         */
        case Action.NewFile:
          const fileInfo: FileInfo = data.data
          await this.createFile(fileInfo)
          this.appendDownloadBuffer()
          break
        case Action.FileDone:
          this.stopAllRaf()
          await this.appendBuffer()
          this.download()
          break
        case Action.Progress:
          this.opts.onProgress?.(data.data)
          break

        default:
          console.warn('RTC: 未知的消息类型', data.type)
      }
    }
    else {
      this.downloadBuffer.push(e.data)
    }
  }

  private async appendBuffer() {
    let data = this.downloadBuffer.shift()
    while (data) {
      await this.wirteFileBuffer(data)
      data = this.downloadBuffer.shift()
    }
  }

  private appendDownloadBuffer() {
    const consume = () => {
      const id = requestAnimationFrame(async () => {
        await this.appendBuffer()
        this.downloadRafId.push(id)
        requestAnimationFrame(consume)
      })
    }

    consume()
  }

  private stopAllRaf() {
    this.downloadRafId.forEach(cancelAnimationFrame)
    this.downloadRafId = []
  }

  private onClose = () => {
    console.log('RTC: channel 已关闭', this.peerId)
    if (!this.isCaller)
      return
    this.connect() // reopen the channel
  }

  private onChannelError = (error: Event) => {
    console.warn('RTC Channel: 对方关闭了连接', error)
    this.broadcastRTCError(`数据通道错误: ${error.type}`, 'CHANNEL_ERROR')
    this.opts.onOtherChannelClose?.(error)
  }

  private waitUntilChannelIdle() {
    return new Promise<void>((resolve) => {
      this.channel!.onbufferedamountlow = () => {
        resolve()
      }
    })
  }
}

export type RTCPeerOpts = {
  /**
   * 当对方传递文件元信息时触发
   * @param acceptCallback 回调函数内包含一个 PromiseWithResolvers，当你同意接收文件时，resolve 他就会通知对方
   */
  onFileMetas?: (
    fileMetas: FileMeta[],
    acceptCallback: (promiseResolver: PromiseWithResolvers<void>) => void
  ) => void

  onText?: (text: string) => void

  onProgress?: (data: ProgressData) => void

  onOtherChannelClose?: (error: Event) => void
}
