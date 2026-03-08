import { readFileSync } from 'node:fs'

/** 从环境变量解析 HTTPS 证书：路径或 PEM 内容 */
export function getHttpsOptions(): { key: Buffer, cert: Buffer } | null {
  const keyPath = process.env.SSL_KEY_PATH
  const certPath = process.env.SSL_CERT_PATH
  const keyContent = process.env.SSL_KEY
  const certContent = process.env.SSL_CERT

  if (keyPath && certPath) {
    try {
      return {
        key: readFileSync(keyPath),
        cert: readFileSync(certPath),
      }
    }
    catch (e) {
      console.error('读取证书文件失败:', e)
      return null
    }
  }
  if (keyContent && certContent) {
    return {
      key: Buffer.from(keyContent, 'utf8'),
      cert: Buffer.from(certContent, 'utf8'),
    }
  }
  return null
}
