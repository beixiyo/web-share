import { fileURLToPath } from 'node:url'
import history from 'connect-history-api-fallback'
import express from 'express'
import { cors } from '@/middleware'
import { WSServer } from '@/WSServer'

const PORT = process.env.PORT || 3001

const app = express()

app
  .use(cors())
  .use(history())
  .use(express.static(fileURLToPath(new URL('../dist/public', import.meta.url))))

const server = app.listen(PORT, () => {
  console.log(`信令服务器运行在端口 ${PORT}`)
})

new WSServer(server)
