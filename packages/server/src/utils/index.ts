import crypto from 'node:crypto'

/**
 * randomizer 对象用于生成随机字符串
 */
export const randomizer = (() => {
  const charCodeLettersOnly = (r: number) => r >= 65 && r <= 90
  const charCodeAllPrintableChars = (r: number) => r === 45 || r >= 47 && r <= 57 || r >= 64 && r <= 90 || r >= 97 && r <= 122

  return {
    getRandomString(length: number, lettersOnly = false) {
      const charCodeCondition = lettersOnly
        ? charCodeLettersOnly
        : charCodeAllPrintableChars

      let string = ''
      while (string.length < length) {
        const arr = new Uint16Array(length)
        crypto.webcrypto.getRandomValues(arr)
        const filteredArr = Array.from(arr).filter((r) => {
          /* 去除不可打印字符：如果我们转换为期望范围，我们会有概率偏差，所以我认为我们最好跳过这个字符 */
          return charCodeCondition(r % 128)
        })
        string += String.fromCharCode(...filteredArr)
      }

      return string.substring(0, length)
    },
  }
})()

/**
 * cyrb53 哈希函数，用于生成简单且快速的哈希值
 * @param str - 要哈希的字符串
 * @param seed - 可选的种子值
 */
export function cyrb53(str: string, seed = 0) {
  let h1 = 0xDEADBEEF ^ seed; let h2 = 0x41C6CE57 ^ seed
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)

  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}
