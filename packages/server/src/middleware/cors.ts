import type { NextFunction, Request, Response } from 'express'

export function cors(
  allowOrigins: string[] | '*' = '*',
  withCredentials: boolean = true,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    /** 设置 CORS origin（预检和正常请求都需要） */
    if (Array.isArray(allowOrigins)) {
      if ('origin' in req.headers && allowOrigins.includes(req.headers.origin!)) {
        res.header('Access-Control-Allow-Origin', req.headers.origin)
        if (withCredentials) {
          res.header('Access-Control-Allow-Credentials', 'true')
        }
      }
    }
    else {
      if (withCredentials && req.headers.origin) {
        res.header('Access-Control-Allow-Origin', req.headers.origin)
        res.header('Access-Control-Allow-Credentials', 'true')
      }
      else {
        res.header('Access-Control-Allow-Origin', '*')
      }
    }

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
      res.status(204).end()
      return
    }

    next()
  }
}
