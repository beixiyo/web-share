import type { Candidate, FileMeta, ProgressData, ResumeInfo, RTCBaseData, RTCTextData, Sdp, SendData, To } from 'web-share-common'
import type { FileInfo } from '@/types/fileInfo'
import { isStr } from '@jl-org/tool'
import { Action, SELECTED_PEER_ID } from 'web-share-common'
import i18n from '@/i18n'
import { FileDownloadManager, FileSendManager, Message } from '@/utils'
import type { FileDownloadError } from '@/utils/handleFile/FileDownloadManager'
import type { FileSendError } from '@/utils/handleFile/FileSendManager'
import { ResumeManager } from '@/utils/handleOfflineFile'
import { Peer, type PeerOpts } from './Peer'
import { RTCConnect, type RTCConnectError } from './RTCConnect'

/**
 * WebRTC 连接管理和消息路由
 */
export class RTCPeer extends Peer {
  private opts: PeerOpts & RTCPeerOpts
  onChannelReady?: Function
  private isRecoveringConnection = false

  /** RTC 连接管理器 */
  private rtcConnect: RTCConnect

  /** 上次成功连接的远端 peerId，跨 rebuild 持久化 */
  private lastRemotePeerId?: string

  /** 文件传输管理器 */
  private fileDownloadManager: FileDownloadManager
  private fileSendManager: FileSendManager
  private originalFiles: Map<string, File> = new Map()

  private onDenyFile?: VoidFunction

  constructor(opts: PeerOpts & RTCPeerOpts) {
    super(opts)
    this.opts = opts

    this.rtcConnect = this.createRTCConnect()

    /** 初始化文件下载管理器 */
    this.fileDownloadManager = new FileDownloadManager({
      sendJSON: data => this.sendJSON(data),
      formatError: (error: FileDownloadError) => {
        return i18n.global.t(`message.fileDownloadErrors.${error.code}`, error.params ?? {})
      },
      onError: (error) => {
        console.error(error)
        Message.error(error)
      },
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
      formatError: (error: FileSendError) => {
        return i18n.global.t(`message.fileSendErrors.${error.code}`, error.params ?? {})
      },
      onError: (error) => {
        console.error(error)
        Message.error(error)
      },
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
    return this.rtcConnect.remoteId || this.lastRemotePeerId || sessionStorage.getItem(SELECTED_PEER_ID)
  }

  /**
   * Channel 是否已连接上
   */
  get isChannelOpen() {
    return this.rtcConnect.isChannelOpen
  }

  /** 当前信令状态，用于判断是否可接受新 offer */
  get signalingState() {
    return this.rtcConnect.signalingState
  }

  /** 关闭并重建 RTC 连接 */
  rebuildRtcConnect() {
    /** 保留上次连接的远端 ID */
    if (this.rtcConnect.remoteId) {
      this.lastRemotePeerId = this.rtcConnect.remoteId
    }
    this.rtcConnect.close()
    this.rtcConnect = this.createRTCConnect()
  }

  close() {
    /** 关闭 RTC 连接 */
    this.rtcConnect.close()

    /** 清理文件传输管理器 */
    this.fileDownloadManager.cleanup()
    this.fileSendManager.cleanup()

    console.log(`RTCPeer ${this.peerId} 已关闭.`)
  }

  /**
   * 恢复 RTC 连接
   * 单次 rebuild + offer，不做重试循环（避免与对端恢复碰撞）
   */
  async recoverConnection(options: RTCRecoverOptions = {}): Promise<boolean> {
    const targetPeerId = options.targetPeerId || this.toId || undefined

    if (this.isRecoveringConnection) {
      console.warn('RTC 连接恢复中，忽略重复恢复请求')
      return false
    }

    this.isRecoveringConnection = true
    this.resetTransferState()
    this.rebuildRtcConnect()

    if (!targetPeerId) {
      this.isRecoveringConnection = false
      return false
    }

    const timeout = this.createRecoveryTimeout(10000)

    try {
      const { promise, resolve } = Promise.withResolvers<void>()
      await this.sendOffer(targetPeerId, resolve)
      await Promise.race([promise, timeout.promise])

      if (!options.silentSuccess) {
        Message.info(i18n.global.t('message.connectionRestored'))
      }
      return true
    }
    catch {
      console.warn('RTC 恢复: 等待 channel 超时，销毁 in-flight 连接')
      /** 超时后销毁正在协商的连接，防止 channel 在超时后"幽灵"打开 */
      this.onChannelReady = undefined
      this.rebuildRtcConnect()
      return false
    }
    finally {
      timeout.clear()
      this.isRecoveringConnection = false
    }
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
   * 发送文件（注册原始文件引用 + 发送元数据）
   */
  async sendFiles(
    files: File[],
    onDenyFile?: VoidFunction,
  ) {
    this.onDenyFile = onDenyFile

    /** 追加文件引用，不清空已有的（避免传输中丢失引用） */
    const resumeManager = new ResumeManager()
    for (const file of files) {
      const fileHash = resumeManager.generateFileHash(file.name, file.size, file.lastModified)
      this.originalFiles.set(fileHash, file)
    }

    return this.fileSendManager.sendFileMetas(files)
  }

  /**
   * 发送元数据和预览图（内部也注册文件引用，确保断点续传可用）
   */
  async sendFileMetas(files: File[]) {
    // @1. [发送方] 发送文件元数据
    const resumeManager = new ResumeManager()
    for (const file of files) {
      const fileHash = resumeManager.generateFileHash(file.name, file.size, file.lastModified)
      this.originalFiles.set(fileHash, file)
    }

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
  /**
   * 向指定用户发送 offer
   * @throws 创建/发送 offer 失败时抛出异常
   */
  async sendOffer(toId: string, onChannelReady?: Function): Promise<void> {
    /** 如果 channel 已打开且目标就是当前对端，直接复用 */
    if (this.isChannelOpen && this.rtcConnect.remoteId === toId) {
      console.log('RTC: channel 已连接目标对端，复用现有连接')
      onChannelReady?.()
      return
    }

    /** 切换目标对端：关闭旧连接，建立新连接 */
    if (this.isChannelOpen || this.rtcConnect.remoteId) {
      console.log(`RTC: 切换对端 ${this.rtcConnect.remoteId} → ${toId}，rebuild`)
      this.rebuildRtcConnect()
    }

    this.onChannelReady = onChannelReady

    /** 创建4秒超时 */
    let offerTimer: ReturnType<typeof setTimeout>
    const timeoutPromise = new Promise<never>((_, reject) => {
      offerTimer = setTimeout(() => {
        reject(new Error('OFFER_TIMEOUT'))
      }, 4000)
    })

    try {
      const offer = await Promise.race([
        this.rtcConnect.createOffer(toId),
        timeoutPromise,
      ])
      clearTimeout(offerTimer!)

      if (!offer) {
        throw new Error('OFFER_CREATION_FAILED')
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
      clearTimeout(offerTimer!)
      const isTimeout = error instanceof Error && error.message === 'OFFER_TIMEOUT'
      const isOfferCreationFailure = error instanceof Error && error.message === 'OFFER_CREATION_FAILED'
      const messageKey = isTimeout
        ? 'message.rtcOfferErrors.timeout'
        : (isOfferCreationFailure
            ? 'message.rtcOfferErrors.creationFailed'
            : 'message.rtcOfferErrors.sendFailed')
      const message = i18n.global.t(messageKey, { error: String(error) })
      const type = isTimeout || isOfferCreationFailure
        ? 'SEND_OFFER_TIMEOUT'
        : 'SEND_OFFER_ERROR'

      if (!this.isRecoveringConnection) {
        this.broadcastRTCError(message, type)
      }
      else {
        console.warn(`RTC恢复中 offer 失败: ${message}`)
      }
      throw new Error(message)
    }
  }

  async handleOffer(offer: Sdp & To) {
    try {
      /** 非 stable 状态时先 rebuild，让新 offer 有机会被处理 */
      if (this.rtcConnect.signalingState !== 'stable' && this.rtcConnect.signalingState !== null) {
        console.warn(`handleOffer: 信令状态为 ${this.rtcConnect.signalingState}，先 rebuild`)
        this.rebuildRtcConnect()
      }

      const answer = await this.rtcConnect.handleOffer(offer)
      if (!answer) {
        console.error('处理 offer 失败: 无法创建 answer')
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
      console.error(`处理 offer 失败: ${error}`)
    }
  }

  async handleAnswer(answer: Sdp & To) {
    try {
      console.log(`接收到 ${answer.fromId} 的 answer`, answer.sdp)
      const success = await this.rtcConnect.handleAnswer(answer)
      if (!success) {
        console.error('处理 answer 失败')
      }
    }
    catch (error) {
      console.error(`处理 answer 失败: ${error}`)
    }
  }

  async handleCandidate(candidate: Candidate & To) {
    try {
      console.log(`接收到 ${candidate.fromId} 的 ICE candidate`, candidate.candidate)
      await this.rtcConnect.handleCandidate(candidate)
    }
    catch (error) {
      console.error(`处理 ICE candidate 失败: ${error}`)
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
   * 只负责广播，不在本地触发恢复 — 由对端收到广播后主动发起恢复
   */
  private broadcastRTCError(errorMessage: string, errorType: string) {
    if (this.isRecoveringConnection) {
      console.warn(`RTC恢复中再次出现错误 [${errorType}]: ${errorMessage}`)
      return
    }

    Message.error(i18n.global.t('message.rtcError', {
      errorType,
      errorMessage,
    }))

    this.server.send({
      type: Action.RTCError,
      data: {
        errorMessage,
        errorType,
        fromPeerId: this.peerId,
        timestamp: Date.now(),
      },
    })
  }

  private createRTCConnect() {
    return new RTCConnect({
      peerId: this.peerId,
      autoReconnect: false,
      onChannelOpen: () => {
        console.log('RTC: channel 已打开，对端ID:', this.rtcConnect.remoteId)
        /** 记住成功连接的远端 ID */
        if (this.rtcConnect.remoteId) {
          this.lastRemotePeerId = this.rtcConnect.remoteId
        }
        this.onChannelReady?.()
      },
      onChannelClose: () => {
        console.log('RTC: channel 已关闭', this.peerId)

        if (this.isRecoveringConnection)
          return

        /** 不自动恢复，只通知 UI 清理状态 */
        this.resetTransferState()
        this.opts.onChannelClose?.()
      },
      onChannelError: (error) => {
        console.warn('RTC Channel: 对方关闭了连接', error)
        if (!this.isRecoveringConnection) {
          this.opts.onChannelClose?.()
        }
      },
      onMessage: this.onMessage,
      onIceCandidate: (candidateData) => {
        this.server.relay(candidateData)
        console.log(`向 ${candidateData.toId} 发送 ICE candidate`, candidateData.candidate)
      },
      onConnectionStateChange: (state) => {
        console.log('RTC: 连接状态:', state)
      },
      onError: (error) => {
        console.error(error)
        Message.error(error)
      },
      formatError: (error: RTCConnectError) => {
        return i18n.global.t(`message.rtcConnectErrors.${error.code}`, error.params ?? {})
      },
    })
  }

  private createRecoveryTimeout(duration = 100000) {
    let timer: ReturnType<typeof setTimeout>
    const promise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('RTC_RECOVER_TIMEOUT'))
      }, duration)
    })
    return { promise, clear: () => clearTimeout(timer!) }
  }

  private resetTransferState() {
    this.onDenyFile = undefined
    this.fileDownloadManager.cleanup()
    this.fileSendManager.cleanup()
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

  onChannelClose?: () => void
}

type RTCRecoverOptions = {
  targetPeerId?: string
  reason?: string
  silentSuccess?: boolean
}
