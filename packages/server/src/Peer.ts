import crypto from 'crypto'
import { UAParser } from 'ua-parser-js'
import { animals, colors, uniqueNamesGenerator } from 'unique-names-generator'
import { cyrb53 } from '@/utils'
import { WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import { isStr } from '@jl-org/tool'
import { HEART_BEAT, PEER_ID, type Name } from 'web-share-common'


/**
 * 连接到 WebSocket 服务器的对等方
 * 它处理对等方的 IP 地址、ID、名称等信息
 */
export class Peer {

  declare ip: string
  declare id: string
  declare socket: WebSocket
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

    // 移除用于 IPv4 转换地址的前缀
    if (this.ip.slice(0, 7) === '::ffff:') {
      this.ip = this.ip.slice(7)
    }

    // IPv4 和 IPv6 使用不同的值来表示本地主机
    // 将所有与服务器在同一网络上的对等方放入同一个房间
    if (this.ip === '::1' || Peer.ipIsPrivate(this.ip)) {
      this.ip = '127.0.0.1'
    }
  }

  /**
   * 设置对等方 ID
   */
  private setPeerId(request: IncomingMessage) {
    const searchParams = new URL(request.url!, 'http://server').searchParams
    let peerId = searchParams.get(PEER_ID)

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
    let ua = UAParser(request.headers['user-agent'])

    let deviceName = ''

    if (ua.os && ua.os.name) {
      deviceName = ua.os.name.replace('Mac OS', 'Mac') + ' '
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
      seed: cyrb53(this.id)
    })

    this.name = {
      model: ua.device.model ?? '',
      os: ua.os.name ?? '',
      browser: ua.browser.name ?? '',
      type: ua.device.type ?? '',
      deviceName,
      displayName
    }
  }

  /**
   * 获取对等方信息。
   */
  getInfo() {
    return {
      id: this.id,
      name: this.name,
    }
  }

  /**
   * 检查 UUID 是否有效
   */
  static isValidUuid(uuid: string) {
    return /^([0-9]|[a-f]){8}-(([0-9]|[a-f]){4}-){3}([0-9]|[a-f]){12}$/.test(uuid)
  }

  /**
   * 检查 IP 地址是否为私有地址
   */
  static ipIsPrivate(ip: string) {
    // 如果 IP 是 IPv4
    if (!ip.includes(':')) {
      /**
       * - 10.0.0.0 - 10.255.255.255
       * - 172.16.0.0 - 172.31.255.255
       * - 192.168.0.0 - 192.168.255.255
       */
      return /^(10)\.(.*)\.(.*)\.(.*)$/.test(ip) ||
        /^(172)\.(1[6-9]|2[0-9]|3[0-1])\.(.*)\.(.*)$/.test(ip) ||
        /^(192)\.(168)\.(.*)\.(.*)$/.test(ip)
    }

    // 否则：IP 是 IPv6
    const firstWord = ip.split(':').find(el => !!el)! // 获取第一个非空单词

    if (/^fe[c-f][0-f]$/.test(firstWord)) {
      // 原始 IPv6 站点本地地址（fec0::/10）已弃用。范围：fec0 - feff
      return true
    }

    // 现在使用唯一本地地址（ULA）代替站点本地地址。
    // 范围：fc00 - fcff
    else if (/^fc[0-f]{2}$/.test(firstWord)) {
      return true
    }

    // 范围：fd00 - fcff
    else if (/^fd[0-f]{2}$/.test(firstWord)) {
      return true
    }

    // 链路本地地址（前缀为 fe80）不可路由
    else if (firstWord === 'fe80') {
      return true
    }

    // 丢弃前缀
    else if (firstWord === '100') {
      return true
    }

    // 任何其他 IP 地址都不是唯一本地地址（ULA）
    return false
  }
  
}