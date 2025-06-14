import type { UserInfo } from 'web-share-common'
import { onUnmounted, ref } from 'vue'
import { Message } from '@/utils'

/**
 * 多用户传输状态
 */
interface MultiUserTransferState {
  targetUsers: UserInfo[]
  files?: File[]
  textContent?: string
  results: Map<string, 'pending' | 'success' | 'failed' | 'rejected'>
}

/**
 * 剪贴板处理Hook
 */
export function useClipboard() {
  /** 待发送的内容状态 */
  const pendingTransfer = ref<MultiUserTransferState | null>(null)
  /**
   * 处理剪贴板数据
   */
  async function handleClipboardData(
    clipboardData: DataTransfer,
    onlineUsers: UserInfo[],
    sendFilesToPeer: (targetPeer: UserInfo, files: File[]) => Promise<void>,
    sendTextToPeer: (targetPeer: UserInfo, textContent: string) => Promise<void>,
    showUserSelector?: (contentType: 'files' | 'text', files?: File[], textContent?: string) => void,
  ) {
    try {
      /** 检查是否有在线用户可以发送 */
      if (onlineUsers.length === 0) {
        Message.warning('没有在线用户，无法发送内容')
        return
      }

      const items = Array.from(clipboardData.items)
      const files: File[] = []
      let textContent = ''

      /** 分析剪贴板内容 */
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) {
            files.push(file)
          }
        }
        else if (item.kind === 'string' && item.type === 'text/plain') {
          textContent = await new Promise<string>((resolve) => {
            item.getAsString(resolve)
          })
        }
      }

      /** 处理内容 */
      if (files.length > 0 && textContent.trim()) {
        /** 混合内容：优先发送文件 */
        if (onlineUsers.length > 1 && showUserSelector) {
          showUserSelector('files', files)
        }
        else {
          await handleClipboardFiles(files, onlineUsers, sendFilesToPeer)
        }
      }
      else if (files.length > 0) {
        /** 只有文件 */
        if (onlineUsers.length > 1 && showUserSelector) {
          showUserSelector('files', files)
        }
        else {
          await handleClipboardFiles(files, onlineUsers, sendFilesToPeer)
        }
      }
      else if (textContent.trim()) {
        /** 只有文本 */
        if (onlineUsers.length > 1 && showUserSelector) {
          showUserSelector('text', undefined, textContent.trim())
        }
        else {
          await handleClipboardText(textContent.trim(), onlineUsers, sendTextToPeer)
        }
      }
      else {
        Message.warning('剪贴板中没有可发送的内容')
      }
    }
    catch (error) {
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
    sendFilesToPeer: (targetPeer: UserInfo, files: File[]) => Promise<void>,
  ) {
    try {
      /** 如果只有一个在线用户，直接发送给该用户 */
      const targetPeer = onlineUsers[0]
      await sendFilesToPeer(targetPeer, files)

      Message.success(`已通过粘贴发送 ${files.length} 个文件给 ${targetPeer.name.displayName}`)
    }
    catch (error) {
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
    sendTextToPeer: (targetPeer: UserInfo, textContent: string) => Promise<void>,
  ) {
    try {
      /** 如果只有一个在线用户，直接发送给该用户 */
      const targetPeer = onlineUsers[0]
      await sendTextToPeer(targetPeer, textContent)

      Message.success(`已通过粘贴发送文本给 ${targetPeer.name.displayName}`)
    }
    catch (error) {
      console.error('发送剪贴板文本时出错:', error)
      Message.error('发送文本时发生错误')
    }
  }

  /**
   * 发送文件给多个用户
   */
  async function sendFilesToMultipleUsers(
    files: File[],
    targetUsers: UserInfo[],
    sendFilesToPeer: (targetPeer: UserInfo, files: File[]) => Promise<void>,
  ) {
    const results = new Map<string, 'pending' | 'success' | 'failed' | 'rejected'>()

    /** 初始化所有用户状态为pending */
    targetUsers.forEach((user) => {
      results.set(user.peerId, 'pending')
    })

    /** 更新待发送状态 */
    pendingTransfer.value = {
      targetUsers,
      files,
      results,
    }

    const promises = targetUsers.map(async (user) => {
      try {
        await sendFilesToPeer(user, files)
        results.set(user.peerId, 'success')
      }
      catch (error) {
        console.error(`发送文件给 ${user.name.displayName} 失败:`, error)
        results.set(user.peerId, 'failed')
      }
    })

    await Promise.allSettled(promises)

    /** 统计结果 */
    const successCount = Array.from(results.values()).filter(status => status === 'success').length
    const failedCount = Array.from(results.values()).filter(status => status === 'failed').length
    const rejectedCount = Array.from(results.values()).filter(status => status === 'rejected').length

    /** 显示结果消息 */
    if (successCount === targetUsers.length) {
      Message.success(`已成功发送文件给 ${successCount} 个用户`)
    }
    else if (successCount > 0) {
      Message.warning(`发送完成：${successCount} 个成功，${failedCount} 个失败，${rejectedCount} 个拒绝`)
    }
    else {
      Message.error('文件发送失败')
    }

    /** 清除待发送状态 */
    pendingTransfer.value = null
  }

  /**
   * 发送文本给多个用户
   */
  async function sendTextToMultipleUsers(
    textContent: string,
    targetUsers: UserInfo[],
    sendTextToPeer: (targetPeer: UserInfo, textContent: string) => Promise<void>,
  ) {
    const results = new Map<string, 'pending' | 'success' | 'failed' | 'rejected'>()

    /** 初始化所有用户状态为pending */
    targetUsers.forEach((user) => {
      results.set(user.peerId, 'pending')
    })

    /** 更新待发送状态 */
    pendingTransfer.value = {
      targetUsers,
      textContent,
      results,
    }

    const promises = targetUsers.map(async (user) => {
      try {
        await sendTextToPeer(user, textContent)
        results.set(user.peerId, 'success')
      }
      catch (error) {
        console.error(`发送文本给 ${user.name.displayName} 失败:`, error)
        results.set(user.peerId, 'failed')
      }
    })

    await Promise.allSettled(promises)

    /** 统计结果 */
    const successCount = Array.from(results.values()).filter(status => status === 'success').length
    const failedCount = Array.from(results.values()).filter(status => status === 'failed').length
    const rejectedCount = Array.from(results.values()).filter(status => status === 'rejected').length

    /** 显示结果消息 */
    if (successCount === targetUsers.length) {
      Message.success(`已成功发送文本给 ${successCount} 个用户`)
    }
    else if (successCount > 0) {
      Message.warning(`发送完成：${successCount} 个成功，${failedCount} 个失败，${rejectedCount} 个拒绝`)
    }
    else {
      Message.error('文本发送失败')
    }

    /** 清除待发送状态 */
    pendingTransfer.value = null
  }

  /**
   * 创建粘贴事件处理器
   */
  function createPasteHandler(
    getOnlineUsers: () => UserInfo[],
    sendFilesToPeer: (targetPeer: UserInfo, files: File[]) => Promise<void>,
    sendTextToPeer: (targetPeer: UserInfo, textContent: string) => Promise<void>,
    showUserSelector?: (contentType: 'files' | 'text', files?: File[], textContent?: string) => void,
  ) {
    return function setupPasteHandler() {
      const handlePaste = async (event: ClipboardEvent) => {
        /** 防止在输入框中粘贴时触发文件传输 */
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
        await handleClipboardData(event.clipboardData, currentOnlineUsers, sendFilesToPeer, sendTextToPeer, showUserSelector)
      }

      document.addEventListener('paste', handlePaste)

      /** 组件卸载时清理事件监听 */
      onUnmounted(() => {
        document.removeEventListener('paste', handlePaste)
      })
    }
  }

  return {
    /** 状态 */
    pendingTransfer,

    /** 方法 */
    createPasteHandler,
    handleClipboardData,
    sendFilesToMultipleUsers,
    sendTextToMultipleUsers,
  }
}
