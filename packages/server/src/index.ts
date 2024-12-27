import express from 'express'
import { cors } from '@/middleware'
import { WSServer } from '@/WSServer'


const PORT = process.env.PORT || 3001

const app = express()
app.use(cors())

const server = app.listen(PORT, () => {
  console.log(`信令服务器运行在端口 ${PORT}`)
})

new WSServer(server)