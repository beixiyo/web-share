/** 验证离线连接的错误回调和 Promise 拒绝均使用调用方当前的语言策略。 */
import { afterAll, expect, test } from 'bun:test'
import { ServerConnection } from '../packages/client/src/ClientServer/ServerConnection'

const originalDescriptors = new Map(
  ['window', 'navigator', 'sessionStorage'].map(key => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
)

Object.defineProperties(globalThis, {
  window: { configurable: true, value: new EventTarget() },
  navigator: { configurable: true, value: { onLine: false } },
  sessionStorage: { configurable: true, value: { getItem: () => null } },
})

afterAll(() => {
  for (const [key, descriptor] of originalDescriptors) {
    if (descriptor)
      Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})

test('错误消息在回调和 Promise 拒绝时调用最新格式化策略', async () => {
  let language = 'en'
  const errors: string[] = []
  const client = new ServerConnection({
    formatError: code => `${language}:${code}`,
    onNotifyUserInfo: () => {},
    onJoinRoom: () => {},
    onLeaveRoom: () => {},
    onError: error => errors.push(error.message),
  })

  try {
    client.joinDirectRoom('room')
    expect(errors).toEqual(['en:peer_not_found'])

    language = 'zh'
    client.joinDirectRoom('room')
    expect(errors.at(-1)).toBe('zh:peer_not_found')
    await expect(client.requestUserInfo(5)).rejects.toThrow('zh:user_info_timeout')

    language = 'en'
    const pending = client.requestUserInfo()
    client.close()
    await expect(pending).rejects.toThrow('en:connection_closed')
  }
  finally {
    client.close()
  }
})
