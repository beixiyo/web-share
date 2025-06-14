import { onUnmounted } from 'vue'
import { USER_INFO, Action } from 'web-share-common'
import type { ServerConnection } from '@/ClientServer'

/**
 * 页面可见性处理Hook
 */
export function usePageVisibility(server: ServerConnection) {
  let wasHidden = false

  /**
   * 处理页面可见性变化
   */
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      wasHidden = true
      console.log('页面切换到后台')
    } else if (document.visibilityState === 'visible' && wasHidden) {
      wasHidden = false
      console.log('页面从后台恢复，重新同步用户状态')

      // 页面恢复时重新请求用户列表，确保状态同步
      const userInfo = sessionStorage.getItem(USER_INFO)
      if (userInfo) {
        server.send({
          type: Action.JoinRoom,
          data: JSON.parse(userInfo)
        })
      }
    }
  }

  /**
   * 设置页面可见性处理
   */
  function setupVisibilityHandling() {
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // 组件卸载时清理事件监听
    onUnmounted(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    })
  }

  return {
    setupVisibilityHandling
  }
}
