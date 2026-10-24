import { readFileSync } from 'node:fs'
import { createSecureContext } from 'node:tls'

/** 从环境变量解析 HTTPS 证书：路径或 PEM 内容 */
export function getHttpsOptions(env: NodeJS.ProcessEnv = process.env): { key: Buffer, cert: Buffer } | null {
  const keyPath = env.SSL_KEY_PATH
  const certPath = env.SSL_CERT_PATH
  const keyContent = env.SSL_KEY
  const certContent = env.SSL_CERT
  let options: { key: Buffer, cert: Buffer }

  if (keyPath || certPath) {
    if (!keyPath || !certPath)
      throw new Error('SSL_KEY_PATH 和 SSL_CERT_PATH 必须同时配置')
    options = { key: readFileSync(keyPath), cert: readFileSync(certPath) }
  }
  else if (keyContent || certContent) {
    if (!keyContent || !certContent)
      throw new Error('SSL_KEY 和 SSL_CERT 必须同时配置')
    options = {
      key: Buffer.from(keyContent, 'utf8'),
      cert: Buffer.from(certContent, 'utf8'),
    }
  }
  else {
    return null
  }

  /** 显式启用 TLS 后，任何读取/证书错误都必须阻止启动 */
  createSecureContext(options)
  return options
}
