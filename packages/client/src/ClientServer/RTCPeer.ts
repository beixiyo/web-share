import type { Candidate, FileMeta, ProgressData, ResumeInfo, RTCBaseData, RTCTextData, Sdp, SendData, To } from 'web-share-common'
import type { FileInfo } from '@/types/fileInfo'
import { isStr } from '@jl-org/tool'
import { Action, SELECTED_PEER_ID } from 'web-share-common'
import { FileDownloadManager, FileSendManager } from '@/utils'
import { ResumeManager } from '@/utils/handleOfflineFile'
import { Peer, type PeerOpts } from './Peer'
import { RTCConnect } from './RTCConnect'

/**
 * WebRTC 连接管理和消息路由
 */
export class RTCPeer extends Peer {
  private opts: PeerOpts & RTCPeerOpts
  onChannelReady?: Function

  /** RTC 连接管理器 */
  private rtcConnect: RTCConnect

  /** 文件传输管理器 */
  private fileDownloadManager: FileDownloadManager
  private fileSendManager: FileSendManager
  private originalFiles: Map<string, File> = new Map()

  private onDenyFile?: VoidFunction

  constructor(opts: PeerOpts & RTCPeerOpts) {
    super(opts)
    this.opts = opts

    /** 初始化 RTC 连接管理器 */
    this.rtcConnect = new RTCConnect({
      peerId: this.peerId,
      onChannelOpen: (channel) => {
        console.log('RTC: channel 已打开，对端ID:', this.peerId)
        this.onChannelReady?.()
      },
      onChannelClose: () => {
        console.log('RTC: channel 已关闭', this.peerId)
      },
      onChannelError: (error) => {
        console.warn('RTC Channel: 对方关闭了连接', error)
        this.broadcastRTCError(`数据通道错误: ${error.type}`, 'CHANNEL_ERROR')
        this.opts.onOtherChannelClose?.(error)
      },
      onMessage: this.onMessage,
      onIceCandidate: (candidateData) => {
        this.server.relay(candidateData)
        console.log(`向 ${candidateData.toId} 发送 ICE candidate`, candidateData.candidate)
      },
      onConnectionStateChange: (state) => {
        console.log('RTC: 连接状态:', state)
        if (state === 'failed') {
          this.broadcastRTCError('RTC连接失败', 'CONNECTION_FAILED')
        }
      },
      onError: (error) => {
        this.broadcastRTCError(error, 'RTC_CONNECT_ERROR')
      },
    })

    /** 初始化文件下载管理器 */
    this.fileDownloadManager = new FileDownloadManager({
      sendJSON: data => this.sendJSON(data),
      onError: error => this.broadcastRTCError(error, 'FILE_DOWNLOAD_ERROR'),
      isChannelClosed: () => this.isChannelClose,
    })

    /** 初始化文件发送管理器 */
    this.fileSendManager = new FileSendManager({
      sendJSON: data => this.sendJSON(data),
      send: data => this.send(data),
      relay: data => this.server.relay(data),
      waitUntilChannelIdle: () => this.waitUntilChannelIdle(),
      isChannelAmountHigh: () => this.channelAmountIsHigh,
      isChannelClosed: () => this.isChannelClose,
      getToId: () => this.toId || undefined,
      getPeerId: () => this.peerId,
      getOriginalFile: (fileHash: string) => this.originalFiles.get(fileHash),
      onProgress: this.opts.onProgress,
      onError: error => this.broadcastRTCError(error, 'FILE_SEND_ERROR'),
    })
  }

  /**
   * 连接到远程对等方
   * 如果是重连，会自动发送 offer
   */
  connect() {
    // RTCConnect 会自动处理连接初始化
    /** 如果需要重连，检查是否有目标 ID */
    if (this.rtcConnect.remoteId) {
      this.sendOffer(this.rtcConnect.remoteId)
    }
  }

  get isSignalClose() {
    return this.rtcConnect.isSignalClose
  }

  get isChannelClose() {
    return this.rtcConnect.isChannelClose
  }

  get channelAmountIsHigh() {
    return this.rtcConnect.channelAmountIsHigh
  }

  get toId() {
    return this.rtcConnect.remoteId || sessionStorage.getItem(SELECTED_PEER_ID)
  }

  /**
   * Channel 是否已连接上
   */
  get isChannelOpen() {
    return this.rtcConnect.isChannelOpen
  }

  channelIsReady(channel: RTCDataChannel | null): channel is RTCDataChannel {
    return channel?.readyState === 'open'
  }

  close() {
    /** 关闭 RTC 连接 */
    this.rtcConnect.close()

    /** 清理文件传输管理器 */
    this.fileDownloadManager.cleanup()
    this.fileSendManager.cleanup()

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
   */
  async sendFiles(
    files: File[],
    onDenyFile?: VoidFunction,
  ) {
    /** 存储文件以供将来检索 */
    this.originalFiles.clear()
    this.onDenyFile = onDenyFile

    const resumeManager = new ResumeManager() // 用于生成哈希的临时实例
    for (const file of files) {
      const fileHash = resumeManager.generateFileHash(file.name, file.size)
      this.originalFiles.set(fileHash, file)
    }

    return this.fileSendManager.sendFileMetas(files)
  }

  /**
   * 发送元数据和预览图
   */
  async sendFileMetas(files: File[]) {
    // @1. [发送方] 发送文件元数据
    return this.fileSendManager.sendFileMetas(files)
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
    if (this.isChannelOpen) {
      console.log('RTC: channel 已经打开，无法发送 offer')
      onChannelReady?.()
      return
    }

    this.onChannelReady = onChannelReady

    /** 创建4秒超时Promise */
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('TIMEOUT'))
      }, 4000)
    })

    try {
      /** 使用Promise.race实现超时控制 */
      const offer = await Promise.race([
        this.rtcConnect.createOffer(toId),
        timeoutPromise,
      ])

      if (!offer) {
        this.broadcastRTCError('创建 offer 失败', 'SEND_OFFER_ERROR')
        return
      }

      const data: To & Sdp = {
        toId,
        fromId: this.peerId,
        sdp: offer,
        type: Action.Offer,
      }
      this.server.relay(data)

      console.log(`向 ${toId} 发送 offer`, offer)
    }
    catch (error) {
      if (error instanceof Error && error.message === 'TIMEOUT') {
        this.broadcastRTCError('创建 offer 超时', 'SEND_OFFER_TIMEOUT')
      }
      else {
        this.broadcastRTCError(`创建或发送 offer 失败: ${error}`, 'SEND_OFFER_ERROR')
      }
    }
  }

  async handleOffer(offer: Sdp & To) {
    try {
      const answer = await this.rtcConnect.handleOffer(offer)
      if (!answer) {
        this.broadcastRTCError('处理 offer 失败', 'HANDLE_OFFER_ERROR')
        return
      }

      const data: To & Sdp = {
        toId: offer.fromId,
        fromId: this.peerId,
        sdp: answer,
        type: Action.Answer,
      }
      this.server.relay(data)

      console.log(`接收到 ${offer.fromId} 的 offer`, offer.sdp)
      console.log(`发送 answer 给 ${data.toId}`, answer)
    }
    catch (error) {
      this.broadcastRTCError(`处理 offer 失败: ${error}`, 'HANDLE_OFFER_ERROR')
    }
  }

  async handleAnswer(answer: Sdp & To) {
    try {
      console.log(`接收到 ${answer.fromId} 的 answer`, answer.sdp)
      const success = await this.rtcConnect.handleAnswer(answer)
      if (!success) {
        this.broadcastRTCError('处理 answer 失败', 'HANDLE_ANSWER_ERROR')
      }
    }
    catch (error) {
      this.broadcastRTCError(`处理 answer 失败: ${error}`, 'HANDLE_ANSWER_ERROR')
    }
  }

  async handleCandidate(candidate: Candidate & To) {
    try {
      console.log(`接收到 ${candidate.fromId} 的 ICE candidate`, candidate.candidate)
      const success = await this.rtcConnect.handleCandidate(candidate)
      if (!success) {
        this.broadcastRTCError('处理 ICE candidate 失败', 'HANDLE_CANDIDATE_ERROR')
      }
    }
    catch (error) {
      this.broadcastRTCError(`处理 ICE candidate 失败: ${error}`, 'HANDLE_CANDIDATE_ERROR')
    }
  }

  async handleFileMetas(fileMetas: FileMeta[]) {
    // @4. [接收方] 收到文件元数据，调用回调发给前端
    this.opts.onFileMetas?.(fileMetas, (data) => {
      const { promise } = data

      promise
        .then(() => {
          // @8. [接收方] 用户确认接收，开始文件下载
          this.fileDownloadManager.start(fileMetas)
        })
        .catch(() => {
          this.sendJSON({
            type: Action.DenyFile,
            data: null,
          })
          /** 清理下载管理器状态 */
          this.fileDownloadManager.cleanup()
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
    }, 30)
  }

  private sendJSON<T>(data: RTCBaseData<T>) {
    this.rtcConnect.sendJSON(data)
  }

  private send(data: any) {
    this.rtcConnect.send(data)
  }

  private waitUntilChannelIdle() {
    return this.rtcConnect.waitUntilChannelIdle()
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
        case Action.DenyFile:
          this.onDenyFile?.()
          break

        /**
         * 文件传输中
         */
        case Action.NewFile:
          const fileInfo: FileInfo = data.data
          // @12. [接收方] 收到新文件信号，开始处理...
          await this.fileDownloadManager.handleNewFile(fileInfo)
          break
        case Action.FileDone:
          // @16. [接收方] 收到文件完成信号，完成文件下载
          await this.fileDownloadManager.handleFileDone()
          break
        case Action.Progress:
          this.opts.onProgress?.(data.data)
          break

        /**
         * 断点续传相关
         */
        case Action.ResumeInfo:
          const resumeInfo: ResumeInfo = data.data
          // @10. [发送方] 收到断点续传响应，开始发送文件
          this.fileSendManager.handleResumeInfo(resumeInfo)
          break

        default:
          console.warn('RTC: 未知的消息类型', data.type)
      }
    }
    else {
      // @14. [接收方] 接收二进制数据，传递给文件下载管理器
      this.fileDownloadManager.receiveDataChunk(new Uint8Array(e.data))
    }
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
