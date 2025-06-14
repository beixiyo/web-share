import { onUnmounted } from 'vue'
import type { UserInfo } from 'web-share-common'
import { Message } from '@/utils'

/**
 * 剪贴板处理Hook
 */
export function useClipboard() {
  /**
   * 处理剪贴板数据
   */
  async function handleClipboardData(
    clipboardData: DataTransfer,
    onlineUsers: UserInfo[],
    sendFilesToPeer: (targetPeer: UserInfo, files: File[]) => Promise<void>,
    sendTextToPeer: (targetPeer: UserInfo, textContent: string) => Promise<void>
  ) {
    try {
      // 检查是否有在线用户可以发送
      if (onlineUsers.length === 0) {
        Message.warning('没有在线用户，无法发送内容')
        return
      }

      const items = Array.from(clipboardData.items)
      const files: File[] = []
      let textContent = ''

      // 分析剪贴板内容
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) {
            files.push(file)
          }
        } else if (item.kind === 'string' && item.type === 'text/plain') {
          textContent = await new Promise<string>((resolve) => {
            item.getAsString(resolve)
          })
        }
      }

      // 处理内容
      if (files.length > 0 && textContent.trim()) {
        // 混合内容：优先发送文件
        await handleMixedClipboardContent(files, onlineUsers, sendFilesToPeer)
      } else if (files.length > 0) {
        // 只有文件
        await handleClipboardFiles(files, onlineUsers, sendFilesToPeer)
      } else if (textContent.trim()) {
        // 只有文本
        await handleClipboardText(textContent.trim(), onlineUsers, sendTextToPeer)
      } else {
        Message.warning('剪贴板中没有可发送的内容')
      }
    } catch (error) {
      console.error('处理剪贴板数据时出错:', error)
      Message.error('处理剪贴板内容时发生错误')
    }
  }

  /**
   * 处理剪贴板中的文件
   */
  async function handleClipboardFiles(
    files: File[],
    onlineUsers: UserInfo[],
    sendFilesToPeer: (targetPeer: UserInfo, files: File[]) => Promise<void>
  ) {
    try {
      // 如果只有一个在线用户，直接发送给该用户
      const targetPeer = onlineUsers[0]
      await sendFilesToPeer(targetPeer, files)

      Message.success(`已通过粘贴发送 ${files.length} 个文件给 ${targetPeer.name.displayName}`)
    } catch (error) {
      console.error('发送剪贴板文件时出错:', error)
      Message.error('发送文件时发生错误')
    }
  }

  /**
   * 处理剪贴板中的文本
   */
  async function handleClipboardText(
    textContent: string,
    onlineUsers: UserInfo[],
    sendTextToPeer: (targetPeer: UserInfo, textContent: string) => Promise<void>
  ) {
    try {
      // 如果只有一个在线用户，直接发送给该用户
      const targetPeer = onlineUsers[0]
      await sendTextToPeer(targetPeer, textContent)

      Message.success(`已通过粘贴发送文本给 ${targetPeer.name.displayName}`)
    } catch (error) {
      console.error('发送剪贴板文本时出错:', error)
      Message.error('发送文本时发生错误')
    }
  }

  /**
   * 处理混合剪贴板内容（文件+文本）
   */
  async function handleMixedClipboardContent(
    files: File[],
    onlineUsers: UserInfo[],
    sendFilesToPeer: (targetPeer: UserInfo, files: File[]) => Promise<void>
  ) {
    try {
      // 简化处理：优先发送文件
      Message.info('检测到文件和文本内容，优先发送文件')
      await handleClipboardFiles(files, onlineUsers, sendFilesToPeer)
    } catch (error) {
      console.error('处理混合剪贴板内容时出错:', error)
      Message.error('处理混合内容时发生错误')
    }
  }

  /**
   * 创建粘贴事件处理器
   */
  function createPasteHandler(
    getOnlineUsers: () => UserInfo[],
    sendFilesToPeer: (targetPeer: UserInfo, files: File[]) => Promise<void>,
    sendTextToPeer: (targetPeer: UserInfo, textContent: string) => Promise<void>
  ) {
    return function setupPasteHandler() {
      const handlePaste = async (event: ClipboardEvent) => {
        // 防止在输入框中粘贴时触发文件传输
        const target = event.target as HTMLElement
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true')) {
          return
        }

        event.preventDefault()

        if (!event.clipboardData) {
          Message.warning('无法访问剪贴板内容')
          return
        }

        const currentOnlineUsers = getOnlineUsers()
        await handleClipboardData(event.clipboardData, currentOnlineUsers, sendFilesToPeer, sendTextToPeer)
      }

      document.addEventListener('paste', handlePaste)

      // 组件卸载时清理事件监听
      onUnmounted(() => {
        document.removeEventListener('paste', handlePaste)
      })
    }
  }

  return {
    createPasteHandler,
    handleClipboardData
  }
}
