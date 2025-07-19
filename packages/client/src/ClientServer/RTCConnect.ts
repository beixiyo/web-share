import type { Optional } from '@jl-org/ts-tool'
import type { Candidate, Sdp, To } from 'web-share-common'
import { Action } from 'web-share-common'
import { CHUNK_SIZE } from '@/config'

/**
 * RTCConnect 类 - 专门负责 WebRTC 连接的建立、维护和状态管理
 *
 * 这是一个独立的 WebRTC 连接管理器，提供简洁易用的 API 来处理：
 * - WebRTC 连接的建立和维护
 * - 信令状态管理
 * - 数据通道管理
 * - ICE 连接处理
 * - 发送队列控制
 *
 * @example
 * ```typescript
 * const rtcConnect = new RTCConnect({
 *   peerId: 'user123',
 *   iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
 *   onChannelOpen: (channel) => console.log('通道已打开'),
 *   onChannelClose: () => console.log('通道已关闭'),
 *   onChannelError: (error) => console.error('通道错误:', error),
 *   onMessage: (data) => console.log('收到消息:', data),
 *   onIceCandidate: (candidate) => sendToRemote(candidate),
 *   onConnectionStateChange: (state) => console.log('连接状态:', state),
 *   onError: (error) => console.error('RTC错误:', error)
 * })
 *
 * // 发起连接
 * await rtcConnect.createOffer('target-peer-id')
 *
 * // 处理远程 offer
 * await rtcConnect.handleOffer(remoteOffer)
 *
 * // 发送数据
 * rtcConnect.sendJSON({ type: 'message', data: 'hello' })
 * rtcConnect.send(new ArrayBuffer(1024))
 * ```
 */
export class RTCConnect {
  private config: Optional<Required<RTCConnectConfig>, 'bufferedAmountLowThreshold'>
  private pc: RTCPeerConnection | null = null
  private channel: RTCDataChannel | null = null
  private isCaller = false
  private remotePeerId?: string

  constructor(config: RTCConnectConfig) {
    /** 设置默认配置 */
    this.config = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      channelLabel: 'data-channel',
      channelOptions: { ordered: true },
      bufferedAmountLowThreshold: undefined,
      autoReconnect: true,
      connectionTimeout: 30000,
      onChannelOpen: () => {},
      onChannelClose: () => {},
      onChannelError: () => {},
      onMessage: () => {},
      onIceCandidate: () => {},
      onConnectionStateChange: () => {},
      onError: () => {},
      ...config,
    }

    this.initialize()
  }

  /***************************************************
   *                  状态管理 Getters
   ***************************************************/

  /**
   * 信令连接是否关闭
   */
  get isSignalClose(): boolean {
    return this.pc?.signalingState === 'closed'
  }

  /**
   * 数据通道是否关闭
   */
  get isChannelClose(): boolean {
    return this.channel?.readyState === 'closed'
  }

  /**
   * 数据通道是否已打开
   */
  get isChannelOpen(): boolean {
    return this.channel?.readyState === 'open'
  }

  /**
   * 通道缓冲区是否过高
   */
  get channelAmountIsHigh(): boolean {
    if (!this.channelIsReady(this.channel))
      return false
    return this.channel.bufferedAmount > this.channel.bufferedAmountLowThreshold
  }

  /**
   * 获取当前连接状态
   */
  get connectionState(): RTCPeerConnectionState | null {
    return this.pc?.connectionState || null
  }

  /**
   * 获取当前信令状态
   */
  get signalingState(): RTCSignalingState | null {
    return this.pc?.signalingState || null
  }

  /**
   * 获取当前 ICE 连接状态
   */
  get iceConnectionState(): RTCIceConnectionState | null {
    return this.pc?.iceConnectionState || null
  }

  /**
   * 获取远程对等方 ID
   */
  get remoteId(): string | undefined {
    return this.remotePeerId
  }

  /***************************************************
   *                  发送控制逻辑
   ***************************************************/

  /**
   * 等待通道空闲
   * 当通道缓冲区过高时，等待直到缓冲区降低到阈值以下
   *
   * @returns Promise<void> 当通道空闲时 resolve
   *
   * @example
   * ```typescript
   * if (rtcConnect.channelAmountIsHigh) {
   *   await rtcConnect.waitUntilChannelIdle()
   * }
   * rtcConnect.send(largeData)
   * ```
   */
  waitUntilChannelIdle(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.channelIsReady(this.channel)) {
        resolve()
        return
      }

      this.channel.onbufferedamountlow = () => {
        resolve()
      }
    })
  }

  /**
   * 发送 JSON 数据
   *
   * @param data 要发送的数据对象
   * @returns boolean 是否发送成功
   *
   * @example
   * ```typescript
   * const success = rtcConnect.sendJSON({
   *   type: 'message',
   *   data: { text: 'Hello World' }
   * })
   * ```
   */
  sendJSON<T>(data: T): boolean {
    if (!this.channelIsReady(this.channel)) {
      this.config.onError('通道未就绪，无法发送 JSON 数据')
      return false
    }

    try {
      this.channel.send(JSON.stringify(data))
      return true
    }
    catch (error) {
      this.config.onError(`发送 JSON 数据失败: ${error}`)
      return false
    }
  }

  /**
   * 发送二进制数据
   *
   * @param data 要发送的二进制数据
   * @returns boolean 是否发送成功
   *
   * @example
   * ```typescript
   * const buffer = new ArrayBuffer(1024)
   * const success = rtcConnect.send(buffer)
   * ```
   */
  send(data: Parameters<RTCDataChannel['send']>[0]): boolean {
    if (!this.channelIsReady(this.channel)) {
      this.config.onError('通道未就绪，无法发送数据')
      return false
    }

    try {
      this.channel.send(data)
      return true
    }
    catch (error) {
      this.config.onError(`发送数据失败: ${error}`)
      return false
    }
  }

  /***************************************************
   *                  外部控制接口
   ***************************************************/

  /**
   * 设置远程对等方 ID
   *
   * @param peerId 远程对等方 ID
   */
  setRemotePeerId(peerId: string): void {
    this.remotePeerId = peerId
  }

  /**
   * 设置 ICE 服务器配置
   *
   * @param iceServers ICE 服务器配置数组
   */
  setIceServers(iceServers: RTCIceServer[]): void {
    this.config.iceServers = iceServers
    if (this.pc) {
      /** 重新初始化连接以应用新的 ICE 服务器 */
      this.initialize()
    }
  }

  /**
   * 设置通道缓冲区低阈值
   *
   * @param threshold 缓冲区低阈值（字节）
   */
  setBufferedAmountLowThreshold(threshold: number): void {
    if (this.channel) {
      this.channel.bufferedAmountLowThreshold = threshold
    }
  }

  /**
   * 更新配置
   *
   * @param newConfig 新的配置选项
   */
  updateConfig(newConfig: Partial<RTCConnectConfig>): void {
    Object.assign(this.config, newConfig)
  }

  /***************************************************
   *                  连接管理
   ***************************************************/

  /**
   * 创建并发送 Offer
   *
   * @param targetId 目标对等方 ID
   * @returns Promise<RTCSessionDescription | null> 创建的 offer 描述
   *
   * @example
   * ```typescript
   * const offer = await rtcConnect.createOffer('target-peer-id')
   * if (offer) {
   *   // 通过信令服务器发送 offer
   *   signalingServer.send({ type: 'offer', offer, targetId })
   * }
   * ```
   */
  async createOffer(targetId: string): Promise<RTCSessionDescription | null> {
    if (!this.pc) {
      this.config.onError('PeerConnection 未初始化，无法创建 offer')
      return null
    }

    if (this.isChannelOpen) {
      console.warn('RTC: channel 已经打开，无法发送 offer')
      return this.pc.localDescription
    }

    if (!this.channel || this.isChannelClose) {
      this.openChannel()
    }

    this.remotePeerId = targetId
    this.isCaller = true

    try {
      const offer = await this.pc.createOffer()
      await this.pc.setLocalDescription(offer)
      return this.pc.localDescription
    }
    catch (error) {
      this.config.onError(`创建 offer 失败: ${error}`)
      return null
    }
  }

  /**
   * 处理远程 Offer
   *
   * @param offer 远程 offer 数据
   * @returns Promise<RTCSessionDescription | null> 创建的 answer 描述
   *
   * @example
   * ```typescript
   * const answer = await rtcConnect.handleOffer({
   *   sdp: remoteOffer,
   *   fromId: 'remote-peer-id'
   * })
   * if (answer) {
   *   // 通过信令服务器发送 answer
   *   signalingServer.send({ type: 'answer', answer, targetId: fromId })
   * }
   * ```
   */
  async handleOffer(offer: Sdp & To): Promise<RTCSessionDescription | null> {
    if (!this.pc) {
      this.config.onError('PeerConnection 未初始化，无法处理 offer')
      return null
    }

    /** 检查信令状态，只有在 stable 状态下才能处理 offer */
    if (this.pc.signalingState !== 'stable') {
      this.config.onError(`处理 offer 失败: 当前信令状态为 ${this.pc.signalingState}，期望状态为 stable`)
      return null
    }

    this.isCaller = false
    this.remotePeerId = offer.fromId

    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(offer.sdp))
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)
      return this.pc.localDescription
    }
    catch (error) {
      this.config.onError(`处理 offer 失败: ${error}`)
      return null
    }
  }

  /**
   * 处理远程 Answer
   *
   * @param answer 远程 answer 数据
   * @returns Promise<boolean> 是否处理成功
   */
  async handleAnswer(answer: Sdp & To): Promise<boolean> {
    if (!this.pc) {
      this.config.onError('PeerConnection 未初始化，无法处理 answer')
      return false
    }

    /** 检查信令状态，只有在 have-local-offer 状态下才能处理 answer */
    if (this.pc.signalingState !== 'have-local-offer') {
      this.config.onError(`处理 answer 失败: 当前信令状态为 ${this.pc.signalingState}，期望状态为 have-local-offer`)
      return false
    }

    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(answer.sdp))
      return true
    }
    catch (error) {
      this.config.onError(`处理 answer 失败: ${error}`)
      return false
    }
  }

  /**
   * 处理 ICE Candidate
   *
   * @param candidate ICE candidate 数据
   * @returns Promise<boolean> 是否处理成功
   */
  async handleCandidate(candidate: Candidate & To): Promise<boolean> {
    if (!this.pc) {
      this.config.onError('PeerConnection 未初始化，无法处理 ICE candidate')
      return false
    }

    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate.candidate))
      return true
    }
    catch (error) {
      this.config.onError(`处理 ICE candidate 失败: ${error}`)
      return false
    }
  }

  /**
   * 重新连接
   * 当连接断开时，尝试重新建立连接
   *
   * @returns Promise<boolean> 是否重连成功
   */
  async reconnect(): Promise<boolean> {
    if (!this.config.autoReconnect) {
      return false
    }

    try {
      this.close()
      this.initialize()

      if (this.isCaller && this.remotePeerId) {
        const offer = await this.createOffer(this.remotePeerId)
        return offer !== null
      }

      return true
    }
    catch (error) {
      this.config.onError(`重连失败: ${error}`)
      return false
    }
  }

  /**
   * 关闭连接
   * 清理所有资源和事件监听器
   */
  close(): void {
    /** 清理数据通道 */
    if (this.channel) {
      this.channel.onclose = null
      this.channel.onmessage = null
      this.channel.onerror = null
      this.channel.onopen = null
      this.channel.onbufferedamountlow = null

      if (this.channel.readyState !== 'closed') {
        this.channel.close()
      }
      this.channel = null
    }

    /** 清理 PeerConnection */
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

    /** 重置状态 */
    this.isCaller = false
    this.remotePeerId = undefined
  }

  /***************************************************
   *                  私有方法
   ***************************************************/

  /**
   * 初始化 PeerConnection
   */
  private initialize(): void {
    if (this.pc && !this.isSignalClose) {
      return
    }

    this.pc = new RTCPeerConnection({
      iceServers: this.config.iceServers,
    })

    /** 设置事件监听器 */
    this.pc.ondatachannel = this.onDataChannel
    this.pc.onicecandidate = this.onIceCandidate
    this.pc.onconnectionstatechange = this.onConnectionStateChange
    this.pc.oniceconnectionstatechange = this.onIceConnectionStateChange
    this.pc.onsignalingstatechange = this.onSignalingStateChange
  }

  /**
   * 打开数据通道
   */
  private openChannel(): void {
    if (!this.pc) {
      this.initialize()
      return
    }

    const channel = this.pc.createDataChannel(
      this.config.channelLabel,
      this.config.channelOptions,
    )

    channel.onopen = this.onChannelOpen as any
    this.isCaller = true
  }

  /**
   * 检查通道是否就绪
   */
  private channelIsReady(channel: RTCDataChannel | null): channel is RTCDataChannel {
    return channel?.readyState === 'open'
  }

  /***************************************************
   *                  事件处理器
   ***************************************************/

  private onDataChannel = (e: RTCDataChannelEvent): void => {
    const channel = e.channel
    this.setupChannel(channel)
  }

  private onChannelOpen = (e: Event): void => {
    const channel = e.target as RTCDataChannel || (e as any).channel
    this.setupChannel(channel)
  }

  private setupChannel(channel: RTCDataChannel): void {
    this.channel = channel
    channel.binaryType = 'arraybuffer'

    /** 设置缓冲区阈值 */
    if (this.config.bufferedAmountLowThreshold !== undefined) {
      channel.bufferedAmountLowThreshold = this.config.bufferedAmountLowThreshold
    }
    else if (this.pc?.sctp?.maxMessageSize) {
      /** 默认设置为最大消息大小减去分块大小和一些余量 */
      channel.bufferedAmountLowThreshold = this.pc.sctp.maxMessageSize - CHUNK_SIZE - 50
    }

    /** 设置事件监听器 */
    channel.onclose = this.onChannelClose
    channel.onerror = this.onChannelError
    channel.onmessage = this.onMessage

    /** 通知外部通道已打开 */
    this.config.onChannelOpen(channel)
  }

  private onChannelClose = (): void => {
    this.config.onChannelClose()

    /** 如果启用自动重连且是发起方，尝试重连 */
    if (this.config.autoReconnect && this.isCaller) {
      setTimeout(() => {
        this.reconnect()
      }, 1000)
    }
  }

  private onChannelError = (error: Event): void => {
    this.config.onChannelError(error)
  }

  private onMessage = (e: MessageEvent): void => {
    this.config.onMessage(e)
  }

  private onIceCandidate = (e: RTCPeerConnectionIceEvent): void => {
    if (e.candidate && this.remotePeerId) {
      this.config.onIceCandidate({
        candidate: e.candidate,
        toId: this.remotePeerId,
        fromId: this.config.peerId,
        type: Action.Candidate,
      })
    }
  }

  private onConnectionStateChange = (): void => {
    const state = this.pc?.connectionState
    this.config.onConnectionStateChange(state || 'closed')

    if (state === 'failed' || state === 'disconnected') {
      this.config.onError(`连接状态变为: ${state}`)

      if (this.config.autoReconnect) {
        this.reconnect()
      }
    }
  }

  private onIceConnectionStateChange = (): void => {
    const state = this.pc?.iceConnectionState

    if (state === 'failed') {
      this.config.onError(`ICE 连接状态变为: ${state}`)
    }
  }

  private onSignalingStateChange = (): void => {
    /** 可以在这里添加信令状态变化的处理逻辑 */
  }
}

/**
 * RTCConnect 配置接口
 */
export interface RTCConnectConfig {
  /** 当前用户 ID */
  peerId: string

  /** ICE 服务器配置 */
  iceServers?: RTCIceServer[]

  /** 数据通道标签 */
  channelLabel?: string

  /** 数据通道选项 */
  channelOptions?: RTCDataChannelInit

  /** 缓冲区低阈值 */
  bufferedAmountLowThreshold?: number

  /** 是否启用自动重连 */
  autoReconnect?: boolean

  /** 连接超时时间（毫秒） */
  connectionTimeout?: number

  /***************************************************
   *                  事件回调
   ***************************************************/

  /**
   * 数据通道打开时的回调
   * @param channel 打开的数据通道
   */
  onChannelOpen?: (channel: RTCDataChannel) => void

  /**
   * 数据通道关闭时的回调
   */
  onChannelClose?: () => void

  /**
   * 数据通道错误时的回调
   * @param error 错误事件
   */
  onChannelError?: (error: Event) => void

  /**
   * 收到消息时的回调
   * @param event 消息事件
   */
  onMessage?: (event: MessageEvent) => void

  /**
   * ICE candidate 生成时的回调
   * @param candidate ICE candidate 数据
   */
  onIceCandidate?: (candidate: Candidate & To) => void

  /**
   * 连接状态变化时的回调
   * @param state 新的连接状态
   */
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void

  /**
   * 错误发生时的回调
   * @param error 错误信息
   * @param needReload 是否需要重新加载
   */
  onError?: (error: string, needReload?: boolean) => void
}
