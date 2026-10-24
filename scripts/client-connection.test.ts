/** 验证真实客户端连接管理器在断连后携带新令牌恢复身份，并在销毁后停止重连 */
import { afterAll, describe, expect, test } from 'bun:test'
import { ResumeTokenQueryKey, SERVER_URL, USER_INFO, type UserInfo } from '../packages/common/src/index.ts'

const endpoints = [process.env.TS_WS_URL, process.env.GO_WS_URL].filter((url): url is string => !!url)
if (endpoints.length === 0)
  throw new Error('请提供隔离实例 TS_WS_URL 或 GO_WS_URL')

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
const originalEndpoint = process.env[SERVER_URL]
const store = new Map<string, string>()
Object.defineProperties(globalThis, {
  window: { configurable: true, value: new EventTarget() },
  sessionStorage: {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  },
  location: { configurable: true, value: { origin: 'http://127.0.0.1' } },
  navigator: { configurable: true, value: { onLine: true } },
})

const { ServerConnection } = await import('../packages/client/src/ClientServer/ServerConnection.ts')

afterAll(() => {
  for (
    const [key, descriptor] of [
      ['window', originalWindow],
      ['sessionStorage', originalStorage],
      ['location', originalLocation],
      ['navigator', originalNavigator],
    ] as const
  ) {
    if (descriptor)
      Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
  if (originalEndpoint === undefined)
    delete process.env[SERVER_URL]
  else process.env[SERVER_URL] = originalEndpoint
})

/** 等待实际异步状态，超时提供失败信号而非固定睡眠猜测就绪 */
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 4000
  while (!predicate()) {
    if (Date.now() > deadline)
      throw new Error('客户端连接状态超时')
    await Bun.sleep(10)
  }
}

describe.each(endpoints)('真实客户端 %s', (endpoint) => {
  test('恢复已加入房间的身份，私有令牌独立存储，销毁后不再重连', async () => {
    store.clear()
    process.env[SERVER_URL] = endpoint
    const notices: UserInfo[] = []
    const errors: string[] = []
    const client = new ServerConnection({
      onNotifyUserInfo: info => notices.push(info),
      onJoinRoom: () => {},
      onLeaveRoom: () => {},
      onError: error => errors.push(error.message),
    })
    try {
      await until(() => notices.length > 0)
      const identity = notices.at(-1)!.peerId
      expect(store.get(ResumeTokenQueryKey)).toBeTruthy()
      expect(JSON.parse(store.get(USER_INFO)!)).not.toHaveProperty('resumeToken')
      expect(notices[0]).not.toHaveProperty('resumeToken')
      const token = store.get(ResumeTokenQueryKey)
      client.saveUserInfoToSession(notices[0])
      expect(store.get(ResumeTokenQueryKey)).toBe(token)

      client.joinRoomWithCode(process.env.TEST_DEFAULT_ROOM_CODE ?? '442385')
      await until(() => notices.at(-1)?.roomId === 'default')
      const oldSocket = client.server!
      const priorCount = notices.length
      oldSocket.close()
      await until(() => notices.length > priorCount)
      expect(client.server).not.toBe(oldSocket)
      expect(notices.at(-1)).toMatchObject({ peerId: identity, roomId: 'default' })
      expect(client.allUsers.some(user => user.peerId === identity)).toBe(true)
      expect(errors).toEqual([])

      const priorOnlineCount = notices.length
      window.dispatchEvent(new Event('online'))
      await until(() => notices.length > priorOnlineCount)
      expect(notices.at(-1)).toMatchObject({ peerId: identity, roomId: 'default' })

      client.close()
      client.close()
      const countAtClose = notices.length
      await Bun.sleep(350)
      expect(client.server).toBeNull()
      expect(notices.length).toBe(countAtClose)
    }
    finally {
      client.close()
    }
  })

  test('会话被凭据持有者替换后，旧页面停止自动重连', async () => {
    store.clear()
    process.env[SERVER_URL] = endpoint
    const errors: string[] = []
    let notices = 0
    const client = new ServerConnection({
      onNotifyUserInfo: () => notices++,
      onJoinRoom: () => {},
      onLeaveRoom: () => {},
      onError: error => errors.push(error.message),
    })
    let replacement: WebSocket | undefined
    try {
      await until(() => notices > 0)
      replacement = new WebSocket(ServerConnection.endPoint().href)
      await new Promise<void>((resolve, reject) => {
        replacement!.onopen = () => resolve()
        replacement!.onerror = () => reject(new Error('替换连接失败'))
      })
      await until(() => errors.length > 0)
      expect(client.server).toBeNull()
      const countAtReplacement = notices
      await Bun.sleep(350)
      expect(notices).toBe(countAtReplacement)
      expect(replacement.readyState).toBe(WebSocket.OPEN)
    }
    finally {
      client.close()
      replacement?.close()
    }
  })
})
