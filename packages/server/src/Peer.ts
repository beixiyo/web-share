import type { IncomingMessage } from 'node:http'
import type { WebSocket } from 'ws'
import crypto from 'node:crypto'
import { isStr } from '@jl-org/tool'
import { UAParser } from 'ua-parser-js'
import { animals, colors, uniqueNamesGenerator } from 'unique-names-generator'
import { HEART_BEAT, type Name, PEER_ID, type UserInfo } from 'web-share-common'
import { cyrb53 } from '@/utils'

/**
 * 连接到 WebSocket 服务器的对等方
 * 它处理对等方的 IP 地址、ID、名称等信息
 */
export class Peer {
  declare ip: string
  declare id: string
  declare socket: WebSocket
  declare roomId: string
  [HEART_BEAT] = Date.now()

  name: Name = {
    model: '',
    os: '',
    browser: '',
    type: '',
    deviceName: '',
    displayName: '',
  }

  constructor(socket: WebSocket, request: IncomingMessage) {
    this.socket = socket

    this.setIP(request)
    this.setPeerId(request)
    this.setName(request)
  }

  /**
   * 设置 IP 地址
   */
  private setIP(request: IncomingMessage) {
    if (isStr(request.headers['cf-connecting-ip'])) {
      this.ip = request.headers['cf-connecting-ip'].split(/\s*,\s*/)[0]
    }
    else if (isStr(request.headers['x-forwarded-for'])) {
      this.ip = request.headers['x-forwarded-for'].split(/\s*,\s*/)[0]
    }
    else {
      this.ip = request.socket.remoteAddress ?? ''
    }

    /** 移除用于 IPv4 转换地址的前缀 */
    if (this.ip.slice(0, 7) === '::ffff:') {
      this.ip = this.ip.slice(7)
    }

    /** 设置房间ID - 根据IP网段划分 */
    this.roomId = this.getRoomIdFromIP(this.ip)
  }

  /**
   * 根据IP地址获取房间ID
   * 同一局域网的设备会被分配到同一个房间
   */
  private getRoomIdFromIP(ip: string): string {
    // IPv6本地地址
    if (ip === '::1') {
      return 'local'
    }

    // IPv4处理
    if (!ip.includes(':')) {
      /** 本地回环地址 */
      if (ip === '127.0.0.1' || ip.startsWith('127.')) {
        return 'local'
      }

      /** 私有网络地址 - 按网段划分 */
      if (Peer.ipIsPrivate(ip)) {
        const parts = ip.split('.')

        // 10.x.x.x 网络 - 按前两段划分
        if (parts[0] === '10') {
          return `lan_10_${parts[1]}`
        }

        // 172.16.x.x - 172.31.x.x 网络 - 按前三段划分
        if (parts[0] === '172' && Number.parseInt(parts[1]) >= 16 && Number.parseInt(parts[1]) <= 31) {
          return `lan_172_${parts[1]}_${parts[2]}`
        }

        // 192.168.x.x 网络 - 按前三段划分
        if (parts[0] === '192' && parts[1] === '168') {
          return `lan_192_168_${parts[2]}`
        }
      }

      /** 公网IP - 每个IP一个房间（通常不会有文件传输需求） */
      return `public_${ip.replace(/\./g, '_')}`
    }

    // IPv6私有地址处理
    const firstWord = ip.split(':').find(el => !!el)!

    if (/^fe[c-f][0-f]$/.test(firstWord) || /^fc[0-f]{2}$/.test(firstWord) || /^fd[0-f]{2}$/.test(firstWord)) {
      // IPv6私有地址 - 按前缀划分
      return `lan_ipv6_${firstWord}`
    }

    if (firstWord === 'fe80') {
      /** 链路本地地址 */
      return 'local'
    }

    /** 其他IPv6地址 */
    return `ipv6_${firstWord}`
  }

  /**
   * 设置对等方 ID
   */
  private setPeerId(request: IncomingMessage) {
    const searchParams = new URL(request.url!, 'http://server').searchParams
    const peerId = searchParams.get(PEER_ID)

    if (peerId) {
      this.id = peerId
      return
    }
    this.id = crypto.randomUUID()
  }

  /**
   * 设置名称
   */
  private setName(request: IncomingMessage) {
    const ua = UAParser(request.headers['user-agent'])

    let deviceName = ''

    if (ua.os && ua.os.name) {
      deviceName = `${ua.os.name.replace('Mac OS', 'Mac')} `
    }

    if (ua.device.model) {
      deviceName += ua.device.model
    }
    else {
      deviceName += ua.browser.name
    }

    if (!deviceName) {
      deviceName = 'Unknown Device'
    }

    const displayName = uniqueNamesGenerator({
      length: 2,
      separator: ' ',
      dictionaries: [colors, animals],
      style: 'capital',
      seed: cyrb53(this.id),
    })

    this.name = {
      model: ua.device.model ?? '',
      os: ua.os.name ?? '',
      browser: ua.browser.name ?? '',
      type: ua.device.type ?? '',
      deviceName,
      displayName,
    }
  }

  /**
   * 获取对等方信息。
   */
  getInfo(): UserInfo {
    return {
      peerId: this.id,
      name: this.name,
      roomId: this.roomId,
    }
  }

  /**
   * 检查 IP 地址是否为私有地址
   */
  static ipIsPrivate(ip: string) {
    /** 如果 IP 是 IPv4 */
    if (!ip.includes(':')) {
      /**
       * - 10.0.0.0 - 10.255.255.255
       * - 172.16.0.0 - 172.31.255.255
       * - 192.168.0.0 - 192.168.255.255
       */
      return /^(10)\.(.*)\.(.*)\.(.*)$/.test(ip)
        || /^(172)\.(1[6-9]|2\d|3[01])\.(.*)\.(.*)$/.test(ip)
        || /^(192)\.(168)\.(.*)\.(.*)$/.test(ip)
    }

    /** 否则：IP 是 IPv6 */
    const firstWord = ip.split(':').find(el => !!el)! // 获取第一个非空单词

    if (/^fe[c-f][0-f]$/.test(firstWord)) {
      /** 原始 IPv6 站点本地地址（fec0::/10）已弃用。范围：fec0 - feff */
      return true
    }

    /**
     * 现在使用唯一本地地址（ULA）代替站点本地地址。
     * 范围：fc00 - fcff
     */
    else if (/^fc[0-f]{2}$/.test(firstWord)) {
      return true
    }

    /** 范围：fd00 - fcff */
    else if (/^fd[0-f]{2}$/.test(firstWord)) {
      return true
    }

    /** 链路本地地址（前缀为 fe80）不可路由 */
    else if (firstWord === 'fe80') {
      return true
    }

    /** 丢弃前缀 */
    else if (firstWord === '100') {
      return true
    }

    /** 任何其他 IP 地址都不是唯一本地地址（ULA） */
    return false
  }
}
