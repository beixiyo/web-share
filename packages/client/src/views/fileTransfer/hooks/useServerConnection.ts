import type { RouteLocationNormalized } from 'vue-router'
import QRCode from 'qrcode'
import { ref } from 'vue'
import { ROOM_CODE_KEY, type RoomCodeExpiredInfo, type RoomCodeInfo, type RoomInfo, type UserInfo } from 'web-share-common'
import { PeerManager, ServerConnection } from '@/ClientServer'
import { Message } from '@/utils'
import { handleExpired } from './tools'

/**
 * 服务器连接管理Hook
 */
export function useServerConnection() {
  /** 二维码和房间码相关状态 */
  const qrCodeValue = ref('')
  const roomCode = ref('')
  let qrData: string

  /**
   * 保存房间码到 sessionStorage
   */
  function saveRoomCodeToSession(code: string) {
    try {
      if (code) {
        sessionStorage.setItem(ROOM_CODE_KEY, code)
      }
      else {
        sessionStorage.removeItem(ROOM_CODE_KEY)
      }
    }
    catch (error) {
      console.warn('无法保存房间码到 sessionStorage:', error)
    }
  }

  /** 服务器连接实例 */
  let server: ServerConnection
  let peerManager: PeerManager

  /**
   * 初始化服务器连接
   */
  function initializeServer(callbacks: {
    onNotifyUserInfo: (data: UserInfo) => void
    onJoinRoom: (data: UserInfo[]) => void
    onLeaveRoom: (data: UserInfo) => void
    onQRCodeRoomCreated: (data: RoomInfo) => void
    onRoomCodeCreated: (data: RoomCodeInfo) => void
    onUserReconnected: (data: any) => void
    setLoading: (state: boolean) => void
    closeAllModals: () => void
  }) {
    server = new ServerConnection({
      onNotifyUserInfo: callbacks.onNotifyUserInfo,
      onJoinRoom: callbacks.onJoinRoom,
      onLeaveRoom: callbacks.onLeaveRoom,
      onQRCodeRoomCreated: callbacks.onQRCodeRoomCreated,
      onRoomCodeCreated: callbacks.onRoomCodeCreated,
      onUserReconnected: callbacks.onUserReconnected,

      onError: (errorData) => {
        console.error('Server Error:', errorData.message)
        Message.error(`发生错误: ${errorData.message}`)
        callbacks.setLoading(false)
        callbacks.closeAllModals()
      },

      onRoomCodeExpired: (expiredInfo) => {
        handleRoomCodeExpired(expiredInfo, callbacks.setLoading)
      },
    })

    peerManager = new PeerManager(server)

    return { server, peerManager }
  }

  /**
   * 请求创建直接连接房间
   */
  async function requestQRCode(
    info: UserInfo | undefined,
  ) {
    if (!info) {
      handleExpired()
      return
    }

    /** 每次都重新向后端申请新的二维码，确保房间始终有效 */
    qrCodeValue.value = ''

    server.createQRCodeRoom()
    return false // 告知外层：正在等待新的二维码
  }

  /**
   * 请求创建带连接码的房间
   */
  async function requestCreateRoomWithCode(
    info: UserInfo | undefined,
    setLoading: (state: boolean) => void,
  ) {
    if (!info) {
      handleExpired()
      return
    }

    setLoading(true)
    server.createRoomWithCode()
  }

  /**
   * 处理服务器创建二维码
   */
  async function handleQRCodeRommCreate(
    data: RoomInfo,
    info: UserInfo | undefined,
    setLoading: (state: boolean) => void,
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
    setLoading: (state: boolean) => void,
  ) {
    if (data.roomCode) {
      if (info) {
        info.roomId = data.roomId
        server.saveUserInfoToSession(info)
      }

      /** 总是更新为最新的房间码 */
      roomCode.value = data.roomCode
      saveRoomCodeToSession(data.roomCode)
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
    if (!qrData)
      return
    return qrData
  }

  /**
   * 处理URL查询参数
   */
  function handleQuery(route: RouteLocationNormalized) {
    const { roomId, peerId } = route.query as { roomId: string, peerId: string }
    if (!roomId || !peerId) {
      return
    }

    server.joinDirectRoom(roomId, peerId)
  }

  /**
   * 处理房间码失效
   */
  function handleRoomCodeExpired(
    expiredInfo: RoomCodeExpiredInfo,
    setLoading: (state: boolean) => void,
  ) {
    const currentRoomCode = roomCode.value

    /** 检查失效的房间码是否与当前房间码匹配 */
    if (currentRoomCode && currentRoomCode === expiredInfo.roomCode) {
      console.log(`当前房间码 ${expiredInfo.roomCode} 已失效，正在清理并重新生成`)

      /** 清理失效的房间码 */
      roomCode.value = ''
      saveRoomCodeToSession('')

      /** 显示提示消息 */
      Message.warning(`房间码 ${expiredInfo.roomCode} 已过期，正在重新生成...`)

      /** 自动重新生成新的房间码 */
      setLoading(true)
      server.createRoomWithCode()
    }
  }

  return {
    /** 状态 */
    qrCodeValue,
    roomCode,

    /** 方法 */
    initializeServer,
    requestQRCode,
    requestCreateRoomWithCode,
    handleQRCodeRommCreate,
    handleRoomCodeCreated,
    handleJoinWithCode,
    copyLink,
    handleQuery,
    handleRoomCodeExpired,
  }
}
