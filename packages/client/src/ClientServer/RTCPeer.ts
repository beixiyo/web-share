import { Peer, type PeerOpts } from './Peer'
import { Action, SELECTED_PEER_ID } from 'web-share-common'
import type { To, ToUser, Sdp, Candidate, RTCTextData, RTCBaseData, SendData, FileMeta, ProgressData } from 'web-share-common'
import { compressImg, FileChunker, getImg, isStr, wait, type MIMEType } from '@jl-org/tool'
import type { FileInfo } from '@/types/fileInfo'


export class RTCPeer extends Peer {

  private isCaller = false
  private opts: PeerOpts & RTCPeerOpts
  onChannelReady?: Function

  declare pc: RTCPeerConnection
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
    if (!this.pc || this.isSignalClose) {
      this.pc = new RTCPeerConnection({
        'iceServers': [
          {
            'urls': 'stun:stun.l.google.com:19302'
          }
        ],
      })

      this.pc.ondatachannel = this.onChannelOpened
      this.pc.onicecandidate = this.onIceCandidate

      this.pc.onconnectionstatechange = () => console.log('RTC: Connection state:', this.pc.connectionState)
      this.pc.oniceconnectionstatechange = () => console.log('ICE connection state:', this.pc.iceConnectionState)
    }

    /**
     * 重连
     */
    if (this.isCaller) {
      const targetId = sessionStorage.getItem(SELECTED_PEER_ID)
      if (!targetId) return
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
    if (!this.channelIsReady(this.channel)) return false
    return this.channel.bufferedAmount > this.channel.bufferedAmountLowThreshold
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
    this.channel?.close()
    this.pc?.close()
  }

  /***************************************************
   *                    Send
   ***************************************************/

  sendText(text: string) {
    const data: RTCTextData = {
      data: text,
      type: Action.Text
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
    onDenyFile?: VoidFunction
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
        const chunker = new FileChunker(file, this.chunkSize)

        while (!chunker.done) {
          if (this.isChannelClose) {
            console.error('RTC: channel closed, 中断文件传输')
            return
          }
          const blob = chunker.next()
          const arrayBuffer = await blob.arrayBuffer()
          await wait(100)

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

          const base64 = await compressImg(img, 'base64', .3, 'image/webp')
          res.base64 = base64
        }

        resolve(res)
      })
    })

    const data = await Promise.all(proms)

    this.sendJSON({
      data,
      type: Action.FileMetas
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
    this.onChannelReady = onChannelReady

    if (this.isChannelOpen) {
      console.log('RTC: channel is already open, cannot send offer')
      onChannelReady?.()
      return
    }

    if (!this.channel || this.isChannelClose) {
      this.openChannel()
    }

    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)

    const data: ToUser<Sdp> = {
      type: Action.Relay,
      data: {
        toId,
        fromId: this.peerId,
        sdp: this.pc.localDescription!,
        type: Action.Offer
      }
    }
    this.server.relay(data)

    console.log(`向 ${toId} 发送 offer`, this.pc.localDescription)
  }

  async handleOffer(offer: Sdp & To) {
    this.isCaller = false // 标记为接收方

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer.sdp))
    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer)

    const data: ToUser<Sdp> = {
      type: Action.Relay,
      data: {
        toId: offer.fromId,
        fromId: this.peerId,
        sdp: this.pc.localDescription!,
        type: Action.Answer
      }
    }

    this.server.relay(data)

    console.log(`接收到 ${offer.fromId} 的 offer`, offer.sdp)
    console.log(`发送 answer 给 ${data.data.toId}`, this.pc.localDescription)
  }

  async handleAnswer(answer: Sdp & To) {
    console.log(`接收到 ${answer.fromId} 的 answer`, answer.sdp)
    return this.pc.setRemoteDescription(new RTCSessionDescription(answer.sdp))
  }

  async handleCandidate(candidate: Candidate & To) {
    console.log(`接收到 ${candidate.fromId} 的 ICE candidate`, candidate.candidate)
    return this.pc.addIceCandidate(new RTCIceCandidate(candidate.candidate))
  }

  /***************************************************
   *                    Private
   ***************************************************/

  private sendJSON<T>(data: RTCBaseData<T>) {
    if (!this.channelIsReady(this.channel)) return
    this.channel.send(JSON.stringify(data))
  }

  private send(data: any) {
    if (!this.channelIsReady(this.channel)) return
    this.channel.send(data)
  }

  private openChannel() {
    const channel = this.pc.createDataChannel('data-channel', {
      ordered: true,
    })
    channel.onopen = this.onChannelOpened as any

    this.isCaller = true
  }

  private onChannelOpened = (e: RTCDataChannelEvent) => {
    console.log('RTC: channel opened with', this.peerId)

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
    const toId = sessionStorage.getItem(SELECTED_PEER_ID)
    if (!e.candidate || !toId) return

    const data: ToUser<Candidate> = {
      type: Action.Relay,
      data: {
        toId,
        fromId: this.peerId,
        candidate: e.candidate,
        type: Action.Candidate
      }
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
        case Action.FileMetas:
          this.saveFileMetas(data.data)
          break
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
          console.warn('RTC: unknown message type', data.type)
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

  /**
   * 保存对方的文件元信息，用来展示文件列表
   */
  protected override saveFileMetas(fileMetas: FileMeta[]) {
    super.saveFileMetas(fileMetas)
    this.opts.onFileMetas?.(fileMetas, ({ promise }) => {
      promise
        .then(() => {
          this.sendJSON({
            type: Action.AcceptFile,
            data: null
          })
        })
        .catch(() => {
          this.sendJSON({
            type: Action.DenyFile,
            data: null
          })
        })
    })
  }

  private onClose = () => {
    console.log('RTC: channel closed', this.peerId)
    if (!this.isCaller) return
    this.connect() // reopen the channel
  }

  private onChannelError = (error: Event) => {
    console.warn('RTC Channel: 对方关闭了连接', error)
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
   * @param fileMetas 文件元信息
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
