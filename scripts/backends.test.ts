/**
 * 用真实 WebSocket 连接验证 TS 与 Go 信令后端的协议兼容和关键生命周期行为
 * 隔离实例须设置 LAN_CIDRS=192.168.4.0/23，以复现真实局域网跨第三段地址的回归
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Action, PeerIDQueryKey, ResumeTokenQueryKey } from '../packages/common/src/index.ts'

const require = createRequire(fileURLToPath(new URL('../packages/server/package.json', import.meta.url)))
const WebSocket = require('ws').WebSocket as {
  new(url: URL, options: { headers: Record<string, string> }): TestSocket
  OPEN: number
  CLOSED: number
  CONNECTING: number
}

const DEFAULT_ROOM_CODE = process.env.TEST_DEFAULT_ROOM_CODE ?? process.env.DEFAULT_ROOM_CODE ?? '442385'
const MESSAGE_TIMEOUT_MS = Number(process.env.BACKEND_TEST_MESSAGE_TIMEOUT_MS) || 4000
const RECONNECT_SETTLE_MS = Number(process.env.BACKEND_TEST_RECONNECT_SETTLE_MS) || 900
const QUIET_WINDOW_MS = Number(process.env.BACKEND_TEST_QUIET_WINDOW_MS) || 150
let nextNetwork = 20

const userAgents = {
  chromeLinux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0',
  edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:124.0) Gecko/124.0 Firefox/124.0',
  chromeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  safariIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  edgeLinux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  reconnect: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 OPR/109.0.0.0',
} as const

class TestPeer {
  private readonly socket: TestSocket
  private messages: Message[] = []
  private publicMessages: Message[] = []
  private listeners = new Set<() => void>()

  private constructor(socket: TestSocket) {
    this.socket = socket
    socket.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString())
        if (parsed?.type !== Action.NotifyUserInfo) this.publicMessages.push(parsed)
        this.messages.push(
          typeof parsed?.type === 'string'
            ? parsed
            : { type: '__raw__', data: parsed },
        )
      }
      catch (error) {
        this.messages.push({ type: '__invalid_json__', data: String(error) })
      }
      for (const listener of this.listeners) listener()
    })
    socket.on('error', (error: Error) => {
      this.messages.push({ type: '__socket_error__', data: error.message })
      for (const listener of this.listeners) listener()
    })
  }

  static async connect(endpoint: string, userAgent: string, options: ConnectOptions): Promise<TestPeer> {
    const url = new URL(endpoint)
    url.searchParams.set(PeerIDQueryKey, options.peerId ?? randomUUID())
    if (options.resumeToken) url.searchParams.set(ResumeTokenQueryKey, options.resumeToken)

    const socket = new WebSocket(url, { headers: { 'User-Agent': userAgent, 'X-Forwarded-For': options.ip } })
    const peer = new TestPeer(socket)

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`WebSocket 连接超时：${endpoint}`)), MESSAGE_TIMEOUT_MS)
        socket.once('open', () => {
          clearTimeout(timer)
          resolve()
        })
        socket.once('error', (error: Error) => {
          clearTimeout(timer)
          reject(error)
        })
      })
      return peer
    }
    catch (error) {
      socket.terminate()
      throw error
    }
  }

  send(type: Action, data: unknown) {
    if (this.socket.readyState !== WebSocket.OPEN) throw new Error(`无法发送 ${type}：WebSocket 尚未打开`)
    this.socket.send(JSON.stringify({ type, data }))
  }

  sendRaw(data: string) {
    this.socket.send(data)
  }

  expectPrivateTokensHidden(...tokens: string[]) {
    const publicData = JSON.stringify(this.publicMessages)
    expect(publicData).not.toContain('resumeToken')
    for (const token of tokens) expect(publicData).not.toContain(token)
  }

  async next(type: string, timeoutMs = MESSAGE_TIMEOUT_MS): Promise<Message> {
    return this.nextWhere((message) => message.type === type, type, timeoutMs)
  }

  async nextWhere(predicate: (message: Message) => boolean, description: string, timeoutMs = MESSAGE_TIMEOUT_MS): Promise<Message> {
    const deadline = Date.now() + timeoutMs
    while (true) {
      const socketErrorIndex = this.messages.findIndex((message) => message.type === '__socket_error__')
      if (socketErrorIndex !== -1) {
        const [socketError] = this.messages.splice(socketErrorIndex, 1)
        throw new Error(`等待${description}时 WebSocket 出错：${socketError.data}`)
      }

      const index = this.messages.findIndex(predicate)
      if (index !== -1) return this.messages.splice(index, 1)[0]

      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) throw new Error(`等待${description}超时`)

      await new Promise<void>((resolve, reject) => {
        const listener = () => {
          clearTimeout(timer)
          this.listeners.delete(listener)
          resolve()
        }
        const timer = setTimeout(() => {
          this.listeners.delete(listener)
          reject(new Error(`等待${description}超时`))
        }, remainingMs)
        this.listeners.add(listener)
      })
    }
  }

  async expectNoWhere(predicate: (message: Message) => boolean, description: string, durationMs = QUIET_WINDOW_MS) {
    expect(this.messages.some(predicate), `收到意外的${description}消息`).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, durationMs))
    expect(this.messages.some(predicate), `收到意外的${description}消息`).toBe(false)
  }

  async expectNo(type: string, durationMs = QUIET_WINDOW_MS) {
    await this.expectNoWhere((message) => message.type === type, type, durationMs)
  }

  async expectClosed() {
    if (this.socket.readyState === WebSocket.CLOSED) return
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('被恢复替换的旧连接没有关闭')), MESSAGE_TIMEOUT_MS)
      this.socket.once('close', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.socket.terminate()
        resolve()
      }, 1000)
      this.socket.once('close', () => {
        clearTimeout(timer)
        resolve()
      })
      if (this.socket.readyState === WebSocket.OPEN) this.socket.close(1000, '兼容性测试清理')
      else if (this.socket.readyState === WebSocket.CONNECTING) this.socket.terminate()
    })
  }
}

async function enterRoom(peer: TestPeer) {
  peer.send(Action.JoinRoom, {})
  const info = await peer.next(Action.NotifyUserInfo)
  const joined = await peer.next(Action.JoinRoom)
  return { info: info.data as PrivateUserInfo, users: joined.data as Array<{ peerId: string }> }
}

async function joinWithInvite(peer: TestPeer, invite: RoomInvite) {
  peer.send(Action.JoinRoomByInvite, { inviteId: invite.inviteId, joinToken: invite.joinToken })
  const info = await peer.next(Action.NotifyUserInfo)
  await peer.next(Action.JoinRoom)
  return info.data as PrivateUserInfo
}

async function inviteCreated(peer: TestPeer) {
  const message = await peer.next(Action.InviteCreated)
  return message.data as RoomInvite
}

const backends = [
  ['TS', process.env.TS_WS_URL],
  ['Go', process.env.GO_WS_URL],
] as const

if (backends.some(([, endpoint]) => !endpoint)) throw new Error('请显式设置隔离实例的 TS_WS_URL 和 GO_WS_URL')

/** 真实网络测试使用有界超时，给多次消息往返和连接清理留出时间 */
const TEST_TIMEOUT_MS = MESSAGE_TIMEOUT_MS * 12 + RECONNECT_SETTLE_MS + QUIET_WINDOW_MS * 2 + 2000

describe.each(backends)('%s 后端', (_label, endpoint) => {
  let peers: TestPeer[] = []

  const connect = async (userAgent: string, options: Partial<ConnectOptions> = {}) => {
    const peer = await TestPeer.connect(endpoint!, userAgent, { ip: `192.168.${nextNetwork++}.10`, ...options })
    peers.push(peer)
    return peer
  }

  afterEach(async () => {
    await Promise.all(peers.map((peer) => peer.close()))
    peers = []
  })

  test('/23 网段跨第三段自动发现，网段外地址保持隔离', async () => {
    const alice = await connect(userAgents.chromeLinux, { ip: '192.168.4.165' })
    const first = await enterRoom(alice)
    const bob = await connect(userAgents.firefoxLinux, { ip: '192.168.5.199' })
    const second = await enterRoom(bob)
    expect(first.info.roomId).toBe('lan_192_168_4_0_23')
    expect(second.info.roomId).toBe(first.info.roomId)
    expect(second.users).toEqual(expect.arrayContaining([
      expect.objectContaining({ peerId: first.info.peerId }),
    ]))
    expect((await alice.next(Action.JoinRoom)).data).toContainEqual(expect.objectContaining({ peerId: second.info.peerId }))

    const outsider = await connect(userAgents.edgeWindows, { ip: '192.168.6.165' })
    const outside = await enterRoom(outsider)
    expect(outside.info.roomId).not.toBe(first.info.roomId)
    expect(outside.users).not.toContainEqual(expect.objectContaining({ peerId: first.info.peerId }))
  }, TEST_TIMEOUT_MS)

  /** 独立网段用于真实房间隔离；测试实例必须显式信任回环代理 */
  test('邀请加入、成员广播、心跳和受限信令转发保持兼容', async () => {
    const alice = await connect(userAgents.chromeLinux)
    const aliceRoom = await enterRoom(alice)
    alice.send(Action.GetOrCreateInvite, null)
    const invite = await inviteCreated(alice)
    const bob = await connect(userAgents.firefoxLinux)
    const bobInfo = await joinWithInvite(bob, invite)
    expect(bobInfo.roomId).toBe(aliceRoom.info.roomId)
    expect((await alice.next(Action.JoinRoom)).data).toContainEqual(expect.objectContaining({ peerId: bobInfo.peerId }))

    bob.send(Action.Ping, null)
    expect((await bob.next(Action.Ping)).data).toBeNull()
    const outsider = await connect(userAgents.edgeWindows)
    const outsiderRoom = await enterRoom(outsider)
    expect(outsiderRoom.info.roomId).not.toBe(aliceRoom.info.roomId)

    bob.send(Action.Relay, { type: Action.Candidate, data: {}, toId: aliceRoom.info.peerId, fromId: 'untrusted-id', marker: 'compat-relay' })
    const relay = await alice.nextWhere((message) => message.type === Action.Candidate && message.marker === 'compat-relay', '中继载荷')
    expect(relay).toMatchObject({ fromId: bobInfo.peerId, marker: 'compat-relay' })
    bob.send(Action.Relay, { type: Action.Candidate, data: {}, toId: outsiderRoom.info.peerId, marker: 'cross-room' })
    await outsider.expectNoWhere((message) => message.marker === 'cross-room', '跨房间中继')

    bob.send(Action.Relay, { type: Action.NotifyUserInfo, data: { peerId: 'invalid' }, toId: aliceRoom.info.peerId, marker: 'server-event' })
    await alice.expectNoWhere((message) => message.marker === 'server-event', '经中继伪造的服务端事件')
    alice.expectPrivateTokensHidden(aliceRoom.info.resumeToken, bobInfo.resumeToken)
    bob.expectPrivateTokensHidden(aliceRoom.info.resumeToken, bobInfo.resumeToken)
  }, TEST_TIMEOUT_MS)

  test('邀请和房间码允许加入，刷新后旧凭据失效', async () => {
    const alice = await connect(userAgents.chromeLinux)
    const { info } = await enterRoom(alice)
    alice.send(Action.GetOrCreateInvite, null)
    const firstInvite = await inviteCreated(alice)
    expect(firstInvite.roomCode).toMatch(/^[0-9]{6}$/)
    expect(firstInvite.roomId).toBe(info.roomId)
    const inviteJoiner = await connect(userAgents.safariMac)
    expect((await joinWithInvite(inviteJoiner, firstInvite)).roomId).toBe(info.roomId)

    alice.send(Action.RefreshInvite, null)
    const refreshed = await inviteCreated(alice)
    expect(refreshed.inviteId).not.toBe(firstInvite.inviteId)
    expect(refreshed.joinToken).not.toBe(firstInvite.joinToken)
    expect(refreshed.roomCode).not.toBe(firstInvite.roomCode)
    const staleJoiner = await connect(userAgents.firefoxAndroid)
    staleJoiner.send(Action.JoinRoomByInvite, { inviteId: firstInvite.inviteId, joinToken: firstInvite.joinToken })
    expect((await staleJoiner.next(Action.InviteInvalidated)).data.reason).toBe('not_found')
    staleJoiner.send(Action.JoinRoomByCode, { roomCode: firstInvite.roomCode })
    expect((await staleJoiner.next(Action.InviteInvalidated)).data.reason).toBe('not_found')
    await staleJoiner.expectNo(Action.NotifyUserInfo)
    const codeJoiner = await connect(userAgents.chromeWindows)
    codeJoiner.send(Action.JoinRoomByCode, { roomCode: refreshed.roomCode })
    expect((await codeJoiner.next(Action.NotifyUserInfo)).data.roomId).toBe(info.roomId)
  }, TEST_TIMEOUT_MS)

  test('持私有凭据重连恢复已经加入的房间，旧连接清理不移除新连接', async () => {
    const host = await connect(userAgents.firefoxLinux)
    const hostInfo = await enterRoom(host)
    host.send(Action.GetOrCreateInvite, null)
    const invite = await inviteCreated(host)
    const oldConnection = await connect(userAgents.reconnect)
    const oldInfo = await joinWithInvite(oldConnection, invite)
    expect(oldInfo.roomId).toBe(hostInfo.info.roomId)
    expect(oldInfo.resumeToken).toEqual(expect.any(String))
    expect(oldInfo.resumeToken.length).toBeGreaterThan(20)
    const newConnection = await connect(userAgents.reconnect, { resumeToken: oldInfo.resumeToken })
    const newInfo = await enterRoom(newConnection)
    expect(newInfo.info.peerId).toBe(oldInfo.peerId)
    expect(newInfo.info.roomId).toBe(oldInfo.roomId)

    await oldConnection.expectClosed()
    await new Promise((resolve) => setTimeout(resolve, RECONNECT_SETTLE_MS))
    newConnection.send(Action.Ping, null)
    await newConnection.next(Action.Ping)
    expect((await enterRoom(newConnection)).users).toContainEqual(expect.objectContaining({ peerId: oldInfo.peerId }))
    host.expectPrivateTokensHidden(oldInfo.resumeToken, newInfo.info.resumeToken)
    newConnection.expectPrivateTokensHidden(oldInfo.resumeToken, newInfo.info.resumeToken)
  }, TEST_TIMEOUT_MS)

  test('相同网络和浏览器的独立会话不互踢，公开 ID 不能替换原连接', async () => {
    const ip = `192.168.${nextNetwork++}.10`
    const first = await connect(userAgents.chromeLinux, { ip })
    const firstRoom = await enterRoom(first)
    const second = await connect(userAgents.chromeLinux, { ip, peerId: firstRoom.info.peerId })
    const secondRoom = await enterRoom(second)
    expect(secondRoom.info.peerId).not.toBe(firstRoom.info.peerId)
    expect(secondRoom.users).toEqual(expect.arrayContaining([
      expect.objectContaining({ peerId: firstRoom.info.peerId }),
      expect.objectContaining({ peerId: secondRoom.info.peerId }),
    ]))
    first.send(Action.Ping, null)
    await first.next(Action.Ping)
    first.expectPrivateTokensHidden(firstRoom.info.resumeToken, secondRoom.info.resumeToken)
    second.expectPrivateTokensHidden(firstRoom.info.resumeToken, secondRoom.info.resumeToken)
  }, TEST_TIMEOUT_MS)

  test('普通登记和旧二维码不能切房，重复本房邀请保持有效，换房通知旧成员', async () => {
    const host = await connect(userAgents.chromeLinux)
    const hostInfo = await enterRoom(host)
    host.send(Action.GetOrCreateInvite, null)
    const invite = await inviteCreated(host)
    const ip = `192.168.${nextNetwork++}.10`
    const mover = await connect(userAgents.firefoxLinux, { ip })
    const moverInfo = await enterRoom(mover)
    expect(moverInfo.info.roomId).not.toBe(hostInfo.info.roomId)
    const watcher = await connect(userAgents.edgeWindows, { ip })
    await enterRoom(watcher)

    mover.send(Action.JoinRoom, { roomId: hostInfo.info.roomId })
    expect((await mover.next(Action.NotifyUserInfo)).data.roomId).toBe(moverInfo.info.roomId)
    mover.send(Action.JoinRoomByQRCode, { roomId: hostInfo.info.roomId, peerId: hostInfo.info.peerId })
    await mover.next(Action.InviteInvalidated)
    await mover.expectNoWhere((message) => message.type === Action.NotifyUserInfo && message.data.roomId === hostInfo.info.roomId, '无凭据切房')
    expect((await joinWithInvite(mover, invite)).roomId).toBe(hostInfo.info.roomId)
    expect((await watcher.next(Action.LeaveRoom)).data.peerId).toBe(moverInfo.info.peerId)

    await joinWithInvite(mover, invite)
    mover.send(Action.GetCurrentInvite, null)
    expect((await inviteCreated(mover)).inviteId).toBe(invite.inviteId)
    const another = await connect(userAgents.safariMac)
    expect((await joinWithInvite(another, invite)).roomId).toBe(hostInfo.info.roomId)
  }, TEST_TIMEOUT_MS)

  test('默认房间邀请链接可加入，刷新撤销旧凭据且固定公开码仍可用', async () => {
    const host = await connect(userAgents.chromeLinux)
    host.send(Action.JoinRoomByCode, { roomCode: DEFAULT_ROOM_CODE })
    expect((await host.next(Action.NotifyUserInfo)).data.roomId).toBe('default')
    host.send(Action.GetOrCreateInvite, null)
    const first = await inviteCreated(host)
    const linkJoiner = await connect(userAgents.firefoxLinux)
    expect((await joinWithInvite(linkJoiner, first)).roomId).toBe('default')
    host.send(Action.RefreshInvite, null)
    const refreshed = await inviteCreated(host)
    expect(refreshed.inviteId).not.toBe(first.inviteId)
    const newcomer = await connect(userAgents.safariMac)
    newcomer.send(Action.JoinRoomByInvite, { inviteId: first.inviteId, joinToken: first.joinToken })
    expect((await newcomer.next(Action.InviteInvalidated)).data.reason).toBe('not_found')
    expect((await joinWithInvite(newcomer, refreshed)).roomId).toBe('default')
    newcomer.send(Action.JoinRoomByCode, { roomCode: DEFAULT_ROOM_CODE })
    expect((await newcomer.next(Action.NotifyUserInfo)).data.roomId).toBe('default')
  }, TEST_TIMEOUT_MS)

  test('畸形协议载荷被忽略，当前会话及后续连接仍能心跳', async () => {
    const peer = await connect(userAgents.chromeLinux)
    await enterRoom(peer)
    for (
      const payload of [
        'null',
        '[]',
        '{',
        '{"type":"JoinRoom","data":null}',
        '{"type":"Relay","data":null}',
        '{"type":"JoinRoomByCode","data":{"roomCode":42}}',
      ]
    ) {
      peer.sendRaw(payload)
      peer.send(Action.Ping, null)
      expect((await peer.next(Action.Ping)).data).toBeNull()
    }
    const nextPeer = await connect(userAgents.firefoxLinux)
    nextPeer.send(Action.Ping, null)
    expect((await nextPeer.next(Action.Ping)).data).toBeNull()
  }, TEST_TIMEOUT_MS)

  test('关闭立即离线，宽限内身份可恢复，恢复后旧计时器不移除成员，过期不重复广播', async () => {
    const graceMs = Number(process.env.BACKEND_TEST_DISCONNECT_DELAY_MS ?? 250)
    const ip = `192.168.${nextNetwork++}.10`
    const member = await connect(userAgents.chromeLinux, { ip })
    const memberInfo = await enterRoom(member)
    const watcher = await connect(userAgents.firefoxLinux, { ip })
    await enterRoom(watcher)

    await member.close()
    expect((await watcher.next(Action.LeaveRoom, Math.max(25, Math.floor(graceMs / 2)))).data.peerId).toBe(memberInfo.info.peerId)
    expect((await enterRoom(watcher)).users.some((user) => user.peerId === memberInfo.info.peerId)).toBe(false)

    const restored = await connect(userAgents.chromeLinux, { ip, resumeToken: memberInfo.info.resumeToken })
    const restoredInfo = await enterRoom(restored)
    expect(restoredInfo.info.peerId).toBe(memberInfo.info.peerId)
    expect((await watcher.next(Action.UserReconnected)).data.userInfo.peerId).toBe(memberInfo.info.peerId)
    expect((await watcher.next(Action.JoinRoom)).data).toContainEqual(expect.objectContaining({ peerId: memberInfo.info.peerId }))
    await new Promise((resolve) => setTimeout(resolve, graceMs + 50))
    restored.send(Action.Ping, null)
    await restored.next(Action.Ping)
    expect((await enterRoom(watcher)).users).toContainEqual(expect.objectContaining({ peerId: memberInfo.info.peerId }))
    await watcher.expectNo(Action.LeaveRoom, 20)

    await restored.close()
    expect((await watcher.next(Action.LeaveRoom)).data.peerId).toBe(memberInfo.info.peerId)
    await new Promise((resolve) => setTimeout(resolve, graceMs + 50))
    await watcher.expectNo(Action.LeaveRoom, 20)
    const expired = await connect(userAgents.chromeLinux, { ip, resumeToken: memberInfo.info.resumeToken })
    expect((await enterRoom(expired)).info.peerId).not.toBe(memberInfo.info.peerId)
  }, TEST_TIMEOUT_MS)
})

type Message = {
  type: string
  data: any
  marker?: string
}

type TestSocket = {
  readyState: number
  on: ((event: 'message', listener: (raw: { toString: () => string }) => void) => void) & ((event: 'error', listener: (error: Error) => void) => void)
  once: ((event: 'open' | 'close', listener: () => void) => void) & ((event: 'error', listener: (error: Error) => void) => void)
  send: (data: string) => void
  close: (code?: number, reason?: string) => void
  terminate: () => void
}

type ConnectOptions = {
  ip: string
  peerId?: string
  resumeToken?: string
}

type PrivateUserInfo = {
  peerId: string
  roomId: string
  resumeToken: string
}

type RoomInvite = {
  inviteId: string
  roomId: string
  roomCode: string
  joinToken: string
  expiresAt: number
  status: string
}
