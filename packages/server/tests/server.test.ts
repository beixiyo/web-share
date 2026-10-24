import type { IncomingMessage, Server } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'
import type { UserInfo } from 'web-share-common'
import { createServer } from 'node:http'
import { createConnection } from 'node:net'
/** 验证配置、客户端地址及连接清理边界；跨后端协议流程由 scripts/backends.test.ts 覆盖 */
import { afterEach, describe, expect, test } from 'bun:test'
import { Action, ResumeTokenQueryKey } from 'web-share-common'
import { WebSocket } from 'ws'
import { readDefaultOptions, readPort, resolveOptions } from '../src/constants'
import { Peer } from '../src/Peer'
import { getHttpsOptions } from '../src/utils/httpsOpts'
import { sendOrTerminateSlowSocket } from '../src/utils/send'
import { WSServer } from '../src/WSServer'

const servers: Array<{ http: Server, signaling: WSServer }> = []
const sockets: WebSocket[] = []
const tcpSockets: Socket[] = []
const timers: ReturnType<typeof setInterval>[] = []

/** 构造仅包含地址解析依赖的请求，无需实际访问外部代理 */
function request(remoteAddress: string, headers: Record<string, string> = {}): IncomingMessage {
  return { socket: { remoteAddress }, headers, url: '/' } as IncomingMessage
}

/** 启动真实本地 HTTP/WS 服务，使用随机端口避免并行测试冲突 */
async function fixture(opts: { clearTime: number, disconnectDelay: number }) {
  const http = createServer()
  const signaling = new WSServer(http, { ...opts, roomEmptyGraceMs: 0 })
  servers.push({ http, signaling })
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
  return { signaling, endpoint: `ws://127.0.0.1:${(http.address() as AddressInfo).port}` }
}

/** 连接当前服务，并保留原始协议消息用于验证真实 WS 行为 */
async function connect(endpoint: string, token?: string) {
  const url = new URL(endpoint)
  if (token)
    url.searchParams.set(ResumeTokenQueryKey, token)
  const socket = new WebSocket(url)
  sockets.push(socket)
  const messages: Array<{ type: Action, data: any }> = []
  socket.on('message', raw => messages.push(JSON.parse(raw.toString())))
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
  const send = (type: Action, data: unknown) => socket.send(JSON.stringify({ type, data }))
  const next = async (type: Action) => {
    for (let index = 0; index < 100; index++) {
      const found = messages.findIndex(message => message.type === type)
      if (found >= 0)
        return messages.splice(found, 1)[0]
      await Bun.sleep(5)
    }
    throw new Error(`等待 ${type} 超时`)
  }
  send(Action.JoinRoom, {})
  const info = (await next(Action.NotifyUserInfo)).data as UserInfo
  return { socket, messages, send, next, info }
}

/** 完成真实 WebSocket 握手后暂停 TCP 读取，直接制造发送端背压 */
async function connectPausedTCP(endpoint: string): Promise<Socket> {
  const url = new URL(endpoint)
  const socket = createConnection({ host: url.hostname, port: Number(url.port) })
  tcpSockets.push(socket)

  const response = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TCP WebSocket 握手超时')), 500)
    let headers = ''
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    const readHeaders = (chunk: Buffer) => {
      headers += chunk.toString()
      if (!headers.includes('\r\n\r\n'))
        return

      socket.pause()
      socket.off('data', readHeaders)
      clearTimeout(timer)
      resolve(headers)
    }
    socket.on('data', readHeaders)
    socket.write([
      'GET / HTTP/1.1',
      `Host: ${url.host}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Version: 13',
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
      '',
      '',
    ].join('\r\n'))
  })

  expect(response.startsWith('HTTP/1.1 101 ')).toBe(true)
  return socket
}

afterEach(async () => {
  timers.splice(0).forEach(clearInterval)
  tcpSockets.splice(0).forEach(socket => socket.destroy())
  sockets.splice(0).forEach(socket => socket.terminate())
  for (const { http, signaling } of servers.splice(0)) {
    await signaling.close()
    http.close()
    http.closeAllConnections()
  }
})

describe('部署配置边界', () => {
  test('合法零值不回退五分钟，非法时长或端口阻止启动', () => {
    const opts = readDefaultOptions({ DISCONNECT_DELAY: '0', ROOM_EMPTY_GRACE_MS: '0' })
    expect(opts.disconnectDelay).toBe(0)
    expect(opts.roomEmptyGraceMs).toBe(0)
    for (const invalid of ['NaN', '1.5', 'Infinity']) expect(() => readDefaultOptions({ ROOM_INVITE_TTL_MS: invalid })).toThrow()
    expect(() => readDefaultOptions({ CLEAR_TIME: '0' })).toThrow()
    expect(() => resolveOptions({ disconnectDelay: 2 ** 31 })).toThrow()
    for (const port of ['0', '65536', '1.5', 'invalid']) expect(() => readPort({ PORT: port })).toThrow()
  })

  test('显式 TLS 配置不完整、文件不可读或 PEM 无效时失败，绝不退回 HTTP', () => {
    expect(getHttpsOptions({})).toBeNull()
    expect(() => getHttpsOptions({ SSL_KEY_PATH: '/missing' })).toThrow()
    expect(() => getHttpsOptions({ SSL_CERT: 'partial' })).toThrow()
    expect(() => getHttpsOptions({ SSL_KEY_PATH: '/missing/key', SSL_CERT_PATH: '/missing/cert' })).toThrow()
    expect(() => getHttpsOptions({ SSL_KEY: 'bad-key', SSL_CERT: 'bad-cert' })).toThrow()
  })
})

describe('客户端地址与分房', () => {
  test('无需代理配置即可读取 CF/XFF，按优先级选取有效地址并用于分房', () => {
    const makePeer = (headers: Record<string, string> = {}) => new Peer({} as WebSocket, request('::ffff:127.0.0.1', headers))
    expect(makePeer().ip).toBe('127.0.0.1')
    const forwarded = makePeer({ 'x-forwarded-for': '192.168.2.10, 10.2.0.1' })
    expect(forwarded.ip).toBe('192.168.2.10')
    expect(forwarded.roomId).toBe('lan_192_168_2')
    expect(makePeer({ 'cf-connecting-ip': '2001:0DB8:0:0::1', 'x-forwarded-for': '192.168.2.10' }).ip).toBe('2001:db8::1')
    expect(makePeer({ 'cf-connecting-ip': 'invalid', 'x-forwarded-for': '192.168.2.10' }).ip).toBe('192.168.2.10')
    expect(makePeer({ 'x-forwarded-for': 'invalid, 10.2.0.1' }).ip).toBe('127.0.0.1')
  })

  test('IPv6 按完整规范地址分房，同地址不同写法相同，不同地址不会共享首段房间', () => {
    const makePeer = (ip: string) => new Peer({} as WebSocket, request(ip))
    expect(makePeer('2001:db8::1').roomId).toBe('ipv6_2001:db8::1')
    expect(makePeer('2001:0DB8:0:0:0:0:0:1').roomId).toBe(makePeer('2001:db8::1').roomId)
    expect(makePeer('2001:db8::2').roomId).not.toBe(makePeer('2001:db8::1').roomId)
    expect(makePeer('fe80::1').roomId).not.toBe('local')
    expect(makePeer('::1').roomId).toBe('local')
    expect(makePeer('::ffff:c000:201').ip).toBe('192.0.2.1')
  })
})

describe('连接资源与恢复期限', () => {
  test('真实 TCP 背压在 16MiB 边界终止慢连接，其他连接仍能发送', async () => {
    const { signaling, endpoint } = await fixture({ clearTime: 10000, disconnectDelay: 0 })
    const healthyAccepted = new Promise<WebSocket>(resolve => signaling.ws.once('connection', resolve))
    const healthy = await connect(endpoint)
    const healthyPeer = await healthyAccepted
    const accepted = new Promise<WebSocket>(resolve => signaling.ws.once('connection', resolve))
    const tcp = await connectPausedTCP(endpoint)
    const slow = await accepted
    const closed = new Promise<void>(resolve => slow.once('close', () => resolve()))
    const message = 'x'.repeat(1024 * 1024)
    let maximum = 0
    let terminated = false

    for (let index = 0; index < 80; index++) {
      maximum = Math.max(maximum, slow.bufferedAmount)
      if (!sendOrTerminateSlowSocket(slow, message)) {
        terminated = true
        break
      }
    }

    expect(maximum).toBeGreaterThan(0)
    expect(maximum).toBeLessThanOrEqual(16 * 1024 * 1024)
    expect(terminated).toBe(true)
    expect(slow.readyState).not.toBe(WebSocket.OPEN)
    await closed
    tcp.destroy()
    expect(slow.readyState).toBe(WebSocket.CLOSED)

    expect(sendOrTerminateSlowSocket(healthyPeer, JSON.stringify({ type: Action.Text, data: 'still-available' }))).toBe(true)
    expect((await healthy.next(Action.Text)).data).toBe('still-available')
  })

  test('心跳超时真正关闭 socket 并废除 token，恢复后不能继承失效身份', async () => {
    const { endpoint } = await fixture({ clearTime: 30, disconnectDelay: 500 })
    const peer = await connect(endpoint)
    expect(peer.info.resumeToken).toBeString()
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('心跳清理未关闭 socket')), 500)
      peer.socket.once('close', () => {
        clearTimeout(timer)
        resolve()
      })
    })
    const replacement = await connect(endpoint, peer.info.resumeToken)
    expect(replacement.info.peerId).not.toBe(peer.info.peerId)
    expect(replacement.info.resumeToken).not.toBe(peer.info.resumeToken)
  })

  test('关闭后立即离线，巡检保留恢复凭据，重连保持身份且 close 幂等', async () => {
    const { signaling, endpoint } = await fixture({ clearTime: 30, disconnectDelay: 250 })
    const observer = await connect(endpoint)
    timers.push(setInterval(() => {
      if (observer.socket.readyState === WebSocket.OPEN)
        observer.send(Action.Ping, null)
    }, 8))
    const peer = await connect(endpoint)
    observer.messages.length = 0
    peer.socket.close()
    expect((await observer.next(Action.LeaveRoom)).data.peerId).toBe(peer.info.peerId)
    observer.send(Action.JoinRoom, {})
    const users = (await observer.next(Action.JoinRoom)).data as UserInfo[]
    expect(users.some(user => user.peerId === peer.info.peerId)).toBe(false)
    await Bun.sleep(90)
    const replacement = await connect(endpoint, peer.info.resumeToken)
    expect(replacement.info.peerId).toBe(peer.info.peerId)
    expect(replacement.info.resumeToken).toBe(peer.info.resumeToken)
    expect((await observer.next(Action.UserReconnected)).data.userInfo.peerId).toBe(peer.info.peerId)
    const closed = signaling.close()
    expect(signaling.close()).toBe(closed)
    await closed
    expect(signaling.ws.clients.size).toBe(0)
  })
})
