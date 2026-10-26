/** 根据显式或本机 IPv4 CIDR 将客户端地址映射到稳定房间 */
import { isIPv4 } from 'node:net'
import { networkInterfaces as getNetworkInterfaces } from 'node:os'

/** 规范化 IPv4 CIDR，并拒绝格式错误或 IPv6 网段 */
export function normalizeLanCIDRs(cidrs: readonly string[]): string[] {
  return cidrs.map((cidr) => {
    const parsed = parseIPv4CIDR(cidr)
    return `${numberToIPv4(parsed.network)}/${parsed.prefixLength}`
  })
}

/** 创建房间解析器；未提供 CIDR 时读取本机非 internal IPv4 网卡前缀 */
export function createRoomResolver(cidrs?: readonly string[]): RoomResolver {
  const networks = (cidrs ?? getLocalIPv4CIDRs()).map(parseIPv4CIDR).sort((a, b) => b.prefixLength - a.prefixLength)

  return (ip) => {
    if (!ip) return 'unknown'
    if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('127.')) return 'local'
    if (ip.includes(':')) return `ipv6_${ip}`
    if (!isIPv4(ip)) return 'unknown'

    const address = ipv4ToNumber(ip)
    const network = networks.find((candidate) => (address & candidate.mask) === candidate.network)
    if (!network) return `public_${ip.replaceAll('.', '_')}`

    return `lan_${numberToIPv4(network.network).replaceAll('.', '_')}_${network.prefixLength}`
  }
}

/** 使用进程启动时识别的本机 IPv4 前缀解析客户端地址 */
export const defaultRoomResolver = createRoomResolver()

function getLocalIPv4CIDRs(): string[] {
  return Object.values(getNetworkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => !address.internal && address.family === 'IPv4' && address.cidr)
    .map((address) => address.cidr!)
}

function parseIPv4CIDR(value: string): ParsedIPv4CIDR {
  const parts = value.trim().split('/')
  if (parts.length !== 2 || !isIPv4(parts[0])) throw new Error(`无效的 IPv4 CIDR: ${value}`)

  const prefixLength = Number(parts[1])
  if (!/^(0|[1-9]\d?)$/.test(parts[1]) || !Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) {
    throw new Error(`无效的 IPv4 CIDR 前缀: ${value}`)
  }

  const mask = prefixLength === 0
    ? 0
    : (0xFFFFFFFF << (32 - prefixLength)) >>> 0
  return { network: ipv4ToNumber(parts[0]) & mask, prefixLength, mask }
}

function ipv4ToNumber(ip: string): number {
  return ip.split('.').reduce((result, part) => ((result << 8) | Number(part)) >>> 0, 0)
}

function numberToIPv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xFF).join('.')
}

type ParsedIPv4CIDR = {
  network: number
  prefixLength: number
  mask: number
}

/** 将已规范化的客户端 IP 映射到房间 ID */
export type RoomResolver = (ip: string) => string
