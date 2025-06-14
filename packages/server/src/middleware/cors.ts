import type { NextFunction, Request, Response } from 'express'

export function cors(
  allowOrigins: string[] | '*' = '*',
  withCredentials: boolean = true,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    /** 预检请求 */
    if (req.method === 'OPTIONS') {
      res.header(
        'Access-Control-Allow-Methods',
        req.headers['access-control-request-method'],
      )
      res.header(
        'Access-Control-Allow-Headers',
        req.headers['access-control-request-headers'],
      )
    }

    /** 允许携带 cookie */
    if (withCredentials) {
      res.header('Access-Control-Allow-Credentials', 'true')
    }

    /** 简单请求，origin = 协议.主机.端口 */
    if (Array.isArray(allowOrigins)) {
      if ('origin' in req.headers && allowOrigins.includes(req.headers.origin!)) {
        res.header('Access-Control-Allow-Origin', req.headers.origin)
      }
    }
    else {
      res.header('Access-Control-Allow-Origin', req.headers.origin)
    }

    next()
  }
}
