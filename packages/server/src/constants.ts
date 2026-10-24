/** 在进程边界读取和校验服务配置，保留合法零值并拒绝无效定时器参数 */
import type { ResolvedWSServerOpts, WSServerOpts } from './types'

const FIVE_MINUTES = 5 * 60 * 1000
const MAX_TIMER_MS = 2 ** 31 - 1

/** 校验公开 options；默认值只在此边界归一化 */
export function resolveOptions(opts: WSServerOpts = {}, defaults = readDefaultOptions()): ResolvedWSServerOpts {
  const resolved = {
    clearTime: opts.clearTime ?? defaults.clearTime,
    disconnectDelay: opts.disconnectDelay ?? defaults.disconnectDelay,
    roomEmptyGraceMs: opts.roomEmptyGraceMs ?? defaults.roomEmptyGraceMs,
    inviteTTL: opts.inviteTTL ?? defaults.inviteTTL,
    defaultRoomCode: opts.defaultRoomCode ?? defaults.defaultRoomCode,
  }

  for (const key of ['clearTime', 'disconnectDelay', 'roomEmptyGraceMs', 'inviteTTL'] as const) {
    const value = resolved[key]
    if (!Number.isSafeInteger(value) || (key !== 'inviteTTL' && value > MAX_TIMER_MS))
      throw new Error(`${key} 必须是支持范围内的整数毫秒`)
  }
  if (resolved.clearTime <= 0)
    throw new Error('clearTime 必须大于 0')
  if (resolved.inviteTTL > Number.MAX_SAFE_INTEGER - Date.now())
    throw new Error('inviteTTL 超出时间戳范围')
  return resolved
}

/** 读取环境配置；未设置或空白值使用默认值，非法值导致启动失败 */
export function readDefaultOptions(env: NodeJS.ProcessEnv = process.env): ResolvedWSServerOpts {
  const number = (name: string, fallback: number) => {
    const value = env[name]?.trim()
    if (!value)
      return fallback
    if (!/^[+-]?\d+$/.test(value))
      throw new Error(`${name} 必须是整数毫秒`)
    return Number(value)
  }

  const defaults: ResolvedWSServerOpts = {
    clearTime: number('CLEAR_TIME', FIVE_MINUTES),
    disconnectDelay: number('DISCONNECT_DELAY', FIVE_MINUTES),
    roomEmptyGraceMs: number('ROOM_EMPTY_GRACE_MS', FIVE_MINUTES),
    inviteTTL: number('ROOM_INVITE_TTL_MS', -1),
    defaultRoomCode: env.DEFAULT_ROOM_CODE?.trim() || '442385',
  }

  return resolveOptions({}, defaults)
}

/** PORT 仅接受有效 TCP 端口，禁止非法输入静默切换到默认端口 */
export function readPort(env: NodeJS.ProcessEnv = process.env): number {
  const value = env.PORT?.trim() || '3001'
  const port = Number(value)
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT 必须为 1 到 65535 的整数')
  return port
}
