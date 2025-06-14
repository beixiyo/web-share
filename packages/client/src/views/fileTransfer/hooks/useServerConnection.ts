import { ref } from 'vue'
import { ServerConnection, PeerManager } from '@/ClientServer'
import type { RoomInfo, RoomCodeInfo, UserInfo } from 'web-share-common'
import QRCode from 'qrcode'
import { Message } from '@/utils'

/**
 * 服务器连接管理Hook
 */
export function useServerConnection() {
  // 二维码和房间码相关状态
  const qrCodeValue = ref('')
  const roomCode = ref('')
  let qrData: string

  // 服务器连接实例
  let server: ServerConnection
  let peerManager: PeerManager

  /**
   * 初始化服务器连接
   */
  function initializeServer(callbacks: {
    onNotifyUserInfo: (data: UserInfo) => void
    onJoinRoom: (data: UserInfo[]) => void
    onLeaveRoom: (data: UserInfo) => void
    onDirectRoomCreated: (data: RoomInfo) => void
    onRoomCodeCreated: (data: RoomCodeInfo) => void
    onUserReconnected: (data: any) => void
    setLoading: (state: boolean) => void
    closeAllModals: () => void
  }) {
    server = new ServerConnection({
      onNotifyUserInfo: callbacks.onNotifyUserInfo,
      onJoinRoom: callbacks.onJoinRoom,
      onLeaveRoom: callbacks.onLeaveRoom,
      onDirectRoomCreated: callbacks.onDirectRoomCreated,
      onRoomCodeCreated: callbacks.onRoomCodeCreated,
      onUserReconnected: callbacks.onUserReconnected,

      onError: (errorData) => {
        console.error('Server Error:', errorData.message)
        Message.error(`发生错误: ${errorData.message}`)
        callbacks.setLoading(false)
        callbacks.closeAllModals()
      }
    })

    peerManager = new PeerManager(server)

    return { server, peerManager }
  }

  /**
   * 请求创建直接连接房间
   */
  async function requestCreateDirectRoom(
    info: UserInfo | undefined,
    setLoading: (state: boolean) => void
  ) {
    if (!info) {
      Message.warning('无法获取用户信息，请稍后再试')
      return
    }
    if (qrCodeValue.value) {
      return true // 表示应该显示二维码模态框
    }

    setLoading(true)
    server.createDirectRoom()
    return false
  }

  /**
   * 请求创建带连接码的房间
   */
  async function requestCreateRoomWithCode(
    info: UserInfo | undefined,
    setLoading: (state: boolean) => void
  ) {
    if (!info) {
      Message.warning('无法获取用户信息，请稍后再试')
      return
    }

    setLoading(true)
    server.createRoomWithCode()
  }

  /**
   * 处理服务器创建直接房间的响应
   */
  async function handleDirectRoomCreated(
    data: RoomInfo,
    info: UserInfo | undefined,
    setLoading: (state: boolean) => void
  ) {
    if (data.roomId) {
      if (info) {
        info.roomId = data.roomId
        server.saveUserInfoToSession(info)
      }
      const { peerId } = data.peerInfo

      qrData = `${ServerConnection.getUrl().href}/fileTransfer/?roomId=${encodeURIComponent(data.roomId)}&peerId=${encodeURIComponent(peerId)}`
      console.log('创建房间成功:', qrData)
      try {
        qrCodeValue.value = await QRCode.toDataURL(qrData, { errorCorrectionLevel: 'H', width: 300 })
        return true // 表示应该显示二维码模态框
      }
      catch (err) {
        console.error('生成二维码失败:', err)
        Message.error('生成二维码失败，请稍后再试')
      }
    }

    setLoading(false)
    return false
  }

  /**
   * 处理服务器创建房间码的响应
   */
  async function handleRoomCodeCreated(
    data: RoomCodeInfo,
    info: UserInfo | undefined,
    setLoading: (state: boolean) => void
  ) {
    if (data.roomCode) {
      if (info) {
        info.roomId = data.roomId
        server.saveUserInfoToSession(info)
      }

      roomCode.value = data.roomCode
      console.log('创建房间码成功:', data.roomCode)
    }

    setLoading(false)
  }

  /**
   * 处理输入连接码加入房间
   */
  function handleJoinWithCode(code: string, setLoading: (state: boolean) => void) {
    if (!code || code.length !== 6) {
      Message.error('请输入6位数字连接码')
      return
    }

    setLoading(true)
    server.joinRoomWithCode(code)
  }

  /**
   * 复制链接
   */
  function copyLink() {
    if (!qrData) return
    return qrData
  }

  /**
   * 处理URL查询参数
   */
  function handleQuery(route: any) {
    const { roomId, peerId } = route.query
    if (!roomId || !peerId) {
      return
    }

    // @ts-ignore
    server.joinDirectRoom(roomId, peerId)
  }

  return {
    // 状态
    qrCodeValue,
    roomCode,

    // 方法
    initializeServer,
    requestCreateDirectRoom,
    requestCreateRoomWithCode,
    handleDirectRoomCreated,
    handleRoomCodeCreated,
    handleJoinWithCode,
    copyLink,
    handleQuery
  }
}
