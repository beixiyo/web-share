import type { RouteLocationNormalized } from 'vue-router'
import QRCode from 'qrcode'
import { computed, ref, watch } from 'vue'
import { INVITE_INFO_KEY, type InviteInvalidatedInfo, ROOM_CODE_KEY, ROOM_CODE_LENGTH, type RoomCodeExpiredInfo, type RoomInviteInfo, type RTCErrorInfo, type UserInfo } from 'web-share-common'
import { PeerManager, ServerConnection } from '@/ClientServer'
import { Message } from '@/utils'
import { resetExpiredSessionState } from './tools'

/**
 * 服务器连接管理 Hook
 */
export function useServerConnection() {
  const inviteInfo = ref<RoomInviteInfo | null>(readInviteFromSession())
  const qrCodeValue = ref('')
  const roomCode = computed(() => inviteInfo.value?.roomCode ?? '')
  const joinLink = computed(() => {
    if (!inviteInfo.value)
      return ''

    const { inviteId, joinToken } = inviteInfo.value
    return `${ServerConnection.getUrl().href}/fileTransfer/?inviteId=${encodeURIComponent(inviteId)}&token=${encodeURIComponent(joinToken)}`
  })

  let closeAllModalsRef = () => {}
  let recoverSessionPromise: Promise<void> | null = null
  let server: ServerConnection
  let peerManager: PeerManager

  watch(joinLink, async (link) => {
    if (!link) {
      qrCodeValue.value = ''
      return
    }

    try {
      qrCodeValue.value = await QRCode.toDataURL(link, {
        errorCorrectionLevel: 'H',
        width: 300,
      })
    }
    catch (error) {
      console.error('生成二维码失败:', error)
      qrCodeValue.value = ''
    }
  }, { immediate: true })

  function readInviteFromSession() {
    try {
      const invite = sessionStorage.getItem(INVITE_INFO_KEY)
      if (!invite)
        return null
      return JSON.parse(invite) as RoomInviteInfo
    }
    catch (error) {
      console.warn('读取邀请缓存失败:', error)
      return null
    }
  }

  function persistInvite(invite: RoomInviteInfo | null) {
    try {
      if (!invite) {
        sessionStorage.removeItem(INVITE_INFO_KEY)
        sessionStorage.removeItem(ROOM_CODE_KEY)
        return
      }

      sessionStorage.setItem(INVITE_INFO_KEY, JSON.stringify(invite))
      sessionStorage.setItem(ROOM_CODE_KEY, invite.roomCode)
    }
    catch (error) {
      console.warn('保存邀请缓存失败:', error)
    }
  }

  function setInvite(invite: RoomInviteInfo | null) {
    inviteInfo.value = invite
    persistInvite(invite)
  }

  function clearInviteQueryFromUrl() {
    const nextUrl = new URL(location.href)
    nextUrl.searchParams.delete('inviteId')
    nextUrl.searchParams.delete('token')
    nextUrl.searchParams.delete('roomId')
    nextUrl.searchParams.delete('peerId')
    history.replaceState(null, '', nextUrl.toString())
  }

  function clearInviteState() {
    setInvite(null)
  }

  function syncCurrentInvite() {
    server.getCurrentInvite()
  }

  function initializeServer(callbacks: {
    onNotifyUserInfo: (data: UserInfo) => void
    onJoinRoom: (data: UserInfo[]) => void
    onLeaveRoom: (data: UserInfo) => void
    onInviteCreated: (data: RoomInviteInfo) => void
    onInviteInvalidated: (data: InviteInvalidatedInfo) => void
    onUserReconnected: (data: any) => void
    onRTCErrorBroadcast: (data: RTCErrorInfo) => void
    setLoading: (state: boolean) => void
    closeAllModals: () => void
  }) {
    closeAllModalsRef = callbacks.closeAllModals

    server = new ServerConnection({
      onNotifyUserInfo: callbacks.onNotifyUserInfo,
      onJoinRoom: callbacks.onJoinRoom,
      onLeaveRoom: callbacks.onLeaveRoom,
      onInviteCreated: callbacks.onInviteCreated,
      onInviteInvalidated: callbacks.onInviteInvalidated,
      onUserReconnected: callbacks.onUserReconnected,
      onRTCErrorBroadcast: callbacks.onRTCErrorBroadcast,
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

  async function requestQRCode(info: UserInfo | undefined) {
    if (!info) {
      await recoverSession()
      return
    }

    server.getOrCreateInvite()
    return false
  }

  async function requestCreateRoomWithCode(
    info: UserInfo | undefined,
    setLoading: (state: boolean) => void,
  ) {
    if (!info) {
      await recoverSession(setLoading)
      return
    }

    setLoading(true)
    server.getOrCreateInvite()
  }

  async function getOrCreateInvite(
    info: UserInfo | undefined,
    setLoading?: (state: boolean) => void,
  ) {
    if (!info) {
      await recoverSession(setLoading)
      return
    }

    setLoading?.(true)
    server.getOrCreateInvite()
  }

  async function refreshInvite(
    info: UserInfo | undefined,
    setLoading: (state: boolean) => void,
  ) {
    if (!info) {
      await recoverSession(setLoading)
      return
    }

    setLoading(true)
    server.refreshInvite()
  }

  async function handleInviteCreated(
    data: RoomInviteInfo,
    info: UserInfo | undefined,
    setLoading: (state: boolean) => void,
  ) {
    if (info && info.roomId !== data.roomId) {
      info.roomId = data.roomId
      server.saveUserInfoToSession(info)
    }

    setInvite(data)
    console.log('统一邀请已同步:', joinLink.value)
    setLoading(false)
  }

  function handleInviteInvalidated(
    invalidInfo: InviteInvalidatedInfo,
    setLoading?: (state: boolean) => void,
  ) {
    const currentInvite = inviteInfo.value
    const hasInviteQuery
      = location.search.includes('inviteId=')
        || location.search.includes('token=')
        || location.search.includes('roomId=')
        || location.search.includes('peerId=')
    const shouldClearInvite
      = !!currentInvite
        && (!invalidInfo.inviteId || invalidInfo.inviteId === currentInvite.inviteId || invalidInfo.roomCode === currentInvite.roomCode)

    if (shouldClearInvite) {
      clearInviteState()
    }

    if (hasInviteQuery) {
      clearInviteQueryFromUrl()
    }

    if (invalidInfo.reason !== 'no_active_invite' || shouldClearInvite || hasInviteQuery) {
      Message.warning(invalidInfo.message)
    }

    setLoading?.(false)
  }

  function handleJoinWithCode(code: string, setLoading: (state: boolean) => void) {
    if (!code || code.length !== ROOM_CODE_LENGTH) {
      Message.error(`请输入${ROOM_CODE_LENGTH}位数字连接码`)
      return
    }

    setLoading(true)
    server.joinRoomWithCode(code)
  }

  function copyLink() {
    return joinLink.value
  }

  function handleQuery(route: RouteLocationNormalized) {
    const inviteId = typeof route.query.inviteId === 'string'
      ? route.query.inviteId
      : ''
    const joinToken = typeof route.query.token === 'string'
      ? route.query.token
      : ''
    if (inviteId && joinToken) {
      server.joinRoomByInvite(inviteId, joinToken)
      return
    }

    const roomId = typeof route.query.roomId === 'string'
      ? route.query.roomId
      : ''
    const peerId = typeof route.query.peerId === 'string'
      ? route.query.peerId
      : ''
    if (roomId && peerId) {
      server.joinDirectRoom(roomId, peerId)
    }
  }

  function handleRoomCodeExpired(
    expiredInfo: RoomCodeExpiredInfo,
    setLoading: (state: boolean) => void,
  ) {
    if (roomCode.value && roomCode.value === expiredInfo.roomCode) {
      clearInviteState()
      Message.warning(expiredInfo.message)
      setLoading(false)
    }
  }

  async function recoverSession(setLoading?: (state: boolean) => void) {
    if (recoverSessionPromise) {
      /** 复用已有 Promise，但为当前调用者附加独立的 setLoading 清理 */
      return recoverSessionPromise.finally(() => setLoading?.(false))
    }

    closeAllModalsRef()
    setLoading?.(true)

    recoverSessionPromise = resetExpiredSessionState(async () => {
      await server.requestUserInfo()
      clearInviteState()
    })
      .catch((error) => {
        console.error('会话恢复失败:', error)
        Message.error('重新连接失败，请稍后重试')
        throw error
      })
      .finally(() => {
        setLoading?.(false)
        recoverSessionPromise = null
      })

    return recoverSessionPromise
  }

  return {
    qrCodeValue,
    roomCode,
    inviteInfo,
    joinLink,
    initializeServer,
    requestQRCode,
    requestCreateRoomWithCode,
    getOrCreateInvite,
    refreshInvite,
    syncCurrentInvite,
    clearInviteState,
    handleInviteCreated,
    handleInviteInvalidated,
    handleJoinWithCode,
    copyLink,
    handleQuery,
    handleRoomCodeExpired,
    recoverSession,
  }
}
