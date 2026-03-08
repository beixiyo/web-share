import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { fileURLToPath } from 'node:url'
import history from 'connect-history-api-fallback'
import express from 'express'
import { cors } from '@/middleware'
import { WSServer } from '@/WSServer'
import { getHttpsOptions } from './utils'

const PORT = Number(process.env.PORT) || 3001

const app = express()
app
  .use(cors())
  .use(history())
  .use(express.static(fileURLToPath(new URL('../dist/public', import.meta.url))))

const httpsOpts = getHttpsOptions()
const server = httpsOpts
  ? createHttpsServer(httpsOpts, app)
  : createHttpServer(app)

server.listen(PORT, () => {
  console.log(httpsOpts
    ? `信令服务器运行在 https 端口 ${PORT}`
    : `信令服务器运行在端口 ${PORT}`)
})

new WSServer(server)
