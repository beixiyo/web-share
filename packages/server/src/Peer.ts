import { cyrb53 } from '@/utils'
import crypto from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { isIP } from 'node:net'
import { UAParser } from 'ua-parser-js'
import { animals, colors, uniqueNamesGenerator } from 'unique-names-generator'
import { HEART_BEAT, type Name, type UserInfo } from 'web-share-common'
import type { WebSocket } from 'ws'
import { defaultRoomResolver, type RoomResolver } from './networkRooms'

/**
 * 连接到 WebSocket 服务器的对等方
 * 它处理对等方的 IP 地址、ID、名称等信息
 */
export class Peer {
  declare ip: string
  declare id: string
  declare socket: WebSocket
  declare roomId: string;
  [HEART_BEAT] = Date.now()

  name: Name = {
    model: '',
    os: '',
    browser: '',
    type: '',
    deviceName: '',
    displayName: '',
  }

  constructor(socket: WebSocket, request: IncomingMessage, opts: PeerOpts = {}) {
    this.socket = socket
    this.ip = getClientIP(request)
    this.roomId = opts.roomId ?? (opts.roomResolver ?? defaultRoomResolver)(this.ip)
    this.id = opts.peerId ?? crypto.randomUUID()
    this.setName(request)
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
      deviceName += ua.browser.name ?? ''
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
   * 获取对等方信息
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
    const firstWord = ip.split(':').find((el) => !!el)! // 获取第一个非空单词

    if (/^fe[c-f][0-f]$/.test(firstWord)) {
      /** 原始 IPv6 站点本地地址（fec0::/10）已弃用。范围：fec0 - feff */
      return true
    }
    /**
     * 现在使用唯一本地地址（ULA）代替站点本地地址
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

/** 按原有优先级读取客户端地址，校验并规范化后用于自动分房 */
function getClientIP(request: IncomingMessage): string {
  const candidates = [request.headers['cf-connecting-ip'], request.headers['x-forwarded-for'], request.socket.remoteAddress]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const ip = normalizeIP(candidate.split(',')[0].trim())
    if (ip) return ip
  }
  return ''
}

/** 统一 IPv6 写法，并将 IPv4-mapped IPv6 转为 IPv4 */
function normalizeIP(value: string): string | null {
  const family = isIP(value)
  if (!family || value.includes('%')) return null
  if (family === 4) return value

  const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1)
  const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/.exec(normalized)
  if (!mapped) return normalized

  const high = Number.parseInt(mapped[1], 16)
  const low = Number.parseInt(mapped[2], 16)
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
}

/** WebSocket 握手时创建 Peer 的选项。会话身份由服务端注入，不从客户端 peerId query 获取 */
export type PeerOpts = {
  /** 会话所有者恢复的服务端身份。@default 新的随机 UUID */
  peerId?: string
  /** 会话所有者恢复的房间。@default 根据客户端 IP 分配 */
  roomId?: string

  /** 由连接所有者注入的房间映射策略。@default 自动识别本机 IPv4 前缀 */
  roomResolver?: RoomResolver
}
