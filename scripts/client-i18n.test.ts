/** 验证客户端真实 i18n 模块的复数、语言切换和浏览器语言状态同步 */
import { afterAll, describe, expect, test } from 'bun:test'

const originalDescriptors = new Map(
  ['localStorage', 'navigator', 'document'].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
)
const values = new Map<string, string>([['language', 'en']])
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
}
const documentElement = { lang: '' }
const documentMock = {
  documentElement,
  createElement: () => ({ content: {} }),
}

Object.defineProperties(globalThis, {
  localStorage: { configurable: true, value: storage },
  navigator: { configurable: true, value: { language: 'zh-CN' } },
  document: { configurable: true, value: documentMock },
})

const { default: i18n } = await import('../packages/client/src/i18n/index.ts')

afterAll(() => {
  for (const [key, descriptor] of originalDescriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})

describe('客户端 i18n', () => {
  test('复数文案和语言切换同步翻译、document.lang 与持久化语言', () => {
    expect(i18n.global.locale.value).toBe('en')
    expect(documentElement.lang).toBe('en')
    expect(storage.getItem('language')).toBe('en')

    for (
      const [count, expected] of [
        [0, '0 files'],
        [1, '1 file'],
        [2, '2 files'],
      ] as const
    ) {
      expect(i18n.global.t('acceptModal.fileCount', { count }, count)).toBe(expected)
    }

    i18n.global.locale.value = 'zh'
    expect(documentElement.lang).toBe('zh')
    expect(storage.getItem('language')).toBe('zh')
    for (const count of [0, 1, 2]) {
      expect(i18n.global.t('acceptModal.fileCount', { count }, count)).toBe(`${count} 个文件`)
    }

    i18n.global.locale.value = 'en'
    expect(documentElement.lang).toBe('en')
    expect(storage.getItem('language')).toBe('en')
  })
})
