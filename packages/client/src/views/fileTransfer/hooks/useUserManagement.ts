import { ref, computed } from 'vue'
import { RTCPeer } from '@/ClientServer'
import { SELECTED_PEER_ID, type UserInfo, type UserReconnectedInfo } from 'web-share-common'
import { Message } from '@/utils'

/**
 * 用户信息管理Hook
 */
export function useUserManagement() {
  // 当前用户信息
  const me = ref<RTCPeer>()
  const info = ref<UserInfo>()

  // 所有用户列表
  const allUsers = ref<UserInfo[]>([])
  const onlineUsers = computed(() =>
    allUsers.value.filter(user => user.peerId !== info.value?.peerId)
  )

  // 选中的用户
  const selectedPeer = ref<UserInfo>()

  /**
   * 设置当前用户信息
   */
  function setUserInfo(userInfo: UserInfo) {
    info.value = userInfo
  }

  /**
   * 设置当前用户的RTCPeer实例
   */
  function setMe(peer: RTCPeer) {
    me.value = peer
  }

  /**
   * 设置选中的用户
   */
  function setSelectedPeer(peer: UserInfo) {
    selectedPeer.value = peer
    sessionStorage.setItem(SELECTED_PEER_ID, peer.peerId)
  }

  /**
   * 处理用户加入房间
   */
  function handleJoinRoom(users: UserInfo[]) {
    allUsers.value = users
  }

  /**
   * 处理用户离开房间
   */
  function handleLeaveRoom(user: UserInfo) {
    allUsers.value = allUsers.value.filter(item => item.peerId !== user.peerId)
  }

  /**
   * 处理用户重连
   */
  function handleUserReconnected(data: UserReconnectedInfo) {
    console.log('用户重连事件:', data)

    // 更新用户列表中的peerId
    const userIndex = allUsers.value.findIndex(user => user.peerId === data.oldPeerId)
    if (userIndex !== -1) {
      allUsers.value[userIndex] = data.userInfo
      console.log(`更新用户列表: ${data.userInfo.name.displayName} 的peerId从 ${data.oldPeerId} 更新为 ${data.newPeerId}`)
    } else {
      // 如果用户不在列表中，直接添加（处理用户列表不同步的情况）
      allUsers.value.push(data.userInfo)
      console.log(`添加重连用户到列表: ${data.userInfo.name.displayName}`)
    }

    // 显示重连提示
    Message.info(`用户 ${data.userInfo.name.displayName} 已重新连接`)
  }

  return {
    // 状态
    me,
    info,
    allUsers,
    onlineUsers,
    selectedPeer,

    // 方法
    setUserInfo,
    setMe,
    setSelectedPeer,
    handleJoinRoom,
    handleLeaveRoom,
    handleUserReconnected
  }
}
