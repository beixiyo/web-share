<template>
  <div
    v-loading="{ loading, text: loadingMessage }"
    class="relative h-screen flex flex-col items-center justify-center overflow-hidden">
    <!-- 工具栏 -->
    <ToolBar
      :qr-code-value="qrCodeValue"
      @generate-qr-code="onRequestCreateDirectRoom"
      @show-key-management="showKeyManagementModal = true"
      @clear-cache="showClearCacheModal = true" />

    <!-- Chrome 浏览器提示 -->
    <div
      class="absolute top-20 center-x p-3 rounded-lg bg-white/80 shadow-md backdrop-blur-sm dark:bg-gray-800/80 dark:shadow-gray-700/50 w-fit">
      <div class="flex items-center gap-2">
        <Info class="text-amber-3 dark:text-amber-5" />
        <p class="text-sm text-gray-700 dark:text-gray-300 text-nowrap">
          建议使用 Chrome 以确保功能正常
        </p>
      </div>
    </div>

    <!-- 用户信息展示 - 移动到中心底部 -->
    <div
      v-if="info"
      class="absolute bottom-8 left-1/2 flex flex-col transform items-center -translate-x-1/2 space-y-2">
      <!-- 主要用户信息 -->
      <div
        class="flex items-center rounded-lg bg-white/80 p-3 shadow-md backdrop-blur-sm sm:max-w-[calc(100vw-2rem)] space-x-2 dark:bg-gray-800/80 sm:p-2 sm:text-sm dark:shadow-gray-700/50 sm:space-x-1">
        <component
          :is="getDeviceIcon(info.name.type || info.name.os)"
          class="h-6 w-6 flex-shrink-0 text-emerald-600 sm:h-5 sm:w-5 dark:text-emerald-400" />
        <span
          class="truncate text-gray-700 font-semibold sm:text-xs dark:text-gray-200">
          你当前是: <span
            class="text-emerald-600 dark:text-emerald-400">{{ info.name.displayName }}</span>
        </span>
      </div>

      <!-- 粘贴提示 -->
      <div
        v-if="onlineUsers.length > 0"
        class="rounded-md bg-white/60 px-2 py-1 text-xs text-gray-500 shadow-sm backdrop-blur-sm dark:bg-gray-800/60 sm:px-1.5 sm:py-0.5 sm:text-[10px] dark:text-gray-400">
        💡 按 Ctrl+V 粘贴文件或文本快速发送
      </div>
    </div>

    <!-- 浮动小球 -->
    <User
      v-model="onlineUsers" :info="info"
      @click-peer="onClickPeer"
      @contextmenu-peer="onContextMenuPeer" />

    <!-- 二维码弹窗 -->
    <QrCodeModal
      v-model="showQrCodeModal"
      :qr-code-value="qrCodeValue"
      :show-qr-code-modal="showQrCodeModal"
      @copy="onCopyLink" />

    <!-- 连接码管理弹窗 -->
    <LinkCodeModal
      v-model="showKeyManagementModal"
      :room-code="roomCode"
      @generate-code="onRequestCreateRoomWithCode"
      @join-with-code="onJoinWithCode" />

    <!-- 隐藏的文件输入 -->
    <input
      ref="fileInput" type="file" class="hidden"
      multiple
      @change="onHandleFileSelect">

    <!-- 文件传输进度弹窗 -->
    <ProgressModal
      :model-value="progress.total > 0"
      :progress="progress" :file-sizes="currentFileSizes" />

    <!-- 发送文本对话框 -->
    <SendTextModal
      v-model:text="text"
      v-model="showTextInput"
      :to-name="selectedPeer?.name?.displayName || '--'"
      @close="showTextInput = false"
      @send="sendText" />

    <!-- 接收文件提示 -->
    <AcceptModal
      v-model="showAcceptFile"
      :file-metas="currentFileMetas"
      :preview-src="previewSrc"
      :from-user="fromUser"
      @accept="onAcceptFile" @deny="onDenyFile" />

    <!-- 接收文本弹窗 -->
    <AcceptTextModal
      v-model="showAcceptText"
      :text="acceptText"
      @close="showAcceptText = false"
      @copy="onCopyText" />

    <!-- 用户选择器弹窗 -->
    <UserSelectorModal
      v-model="showUserSelector"
      :online-users="onlineUsers"
      :content-type="clipboardContentType"
      :content-count="clipboardFiles?.length || 0"
      @confirm="onUserSelectorConfirm"
      @cancel="onUserSelectorCancel" />

    <!-- 清理缓存弹窗 -->
    <ClearCacheModal
      v-model="showClearCacheModal"
      @clear="handleClearCache" />

    <!-- 缓存检测模态框 -->
    <CacheDetectionModal
      v-model="showCacheDetectionModal"
      :cache-stats="cacheStats"
      :formatted-cache-info="formattedCacheInfo"
      @keep-cache="handleKeepCache"
      @clear-all="handleClearAllResumeCache"
      @cleanup-expired="handleCleanupExpiredResumeCache" />

    <!-- 拖拽覆盖层组件 -->
    <DragDropOverlay
      :is-dragging="isDragging"
      :is-drag-file="isDragFile"
      :is-drop-zone-active="isDropZoneActive" />

    <canvas
      ref="canvas"
      class="absolute left-0 top-0 h-full w-full from-[#e8e8e8] to-blue-100 bg-gradient-to-br -z-1 dark:from-gray-900 dark:to-gray-800" />
  </div>
</template>

<script setup lang="ts">
import type { UserInfo } from 'web-share-common'
import { WaterRipple } from '@jl-org/cvs'
import { copyToClipboard } from '@jl-org/tool'
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useResumeCache } from '@/hooks/useResumeCache'
import { formatByte, Message } from '@/utils'
import { ResumeManager } from '@/utils/handleOfflineFile'
import AcceptModal from './AcceptModal.vue'
import AcceptTextModal from './AcceptTextModal.vue'
import CacheDetectionModal from './CacheDetectionModal.vue'
import ClearCacheModal from './ClearCacheModal.vue'
import DragDropOverlay from './DragDropOverlay.vue'
import { getDeviceIcon } from './hooks/tools'
import { useClipboard } from './hooks/useClipboard'
import { createDragDropHandler } from './hooks/useDragDrop'
import { useFileTransfer } from './hooks/useFileTransfer'
import { useModalStates } from './hooks/useModalStates'
import { usePageVisibility } from './hooks/usePageVisibility'
import { useServerConnection } from './hooks/useServerConnection'
import { useUserManagement } from './hooks/useUserManagement'
import LinkCodeModal from './LinkCodeModal.vue'
import ProgressModal from './ProgressModal.vue'
import QrCodeModal from './QrCodeModal.vue'
import SendTextModal from './SendTextModal.vue'
import ToolBar from './ToolBar.vue'
import User from './User.vue'
import UserSelectorModal from './UserSelectorModal.vue'
import { Info } from 'lucide-vue-next'

/** 使用各种hooks */
const userManagement = useUserManagement()
const modalStates = useModalStates()
const fileTransfer = useFileTransfer()
const serverConnection = useServerConnection()
const clipboard = useClipboard()
const resumeCache = useResumeCache()

/** 从hooks中解构需要的状态和方法 */
const {
  me,
  info,
  allUsers,
  onlineUsers,
  selectedPeer,
  setUserInfo,
  setMe,
  setSelectedPeer,
  handleJoinRoom,
  handleLeaveRoom,
  handleUserReconnected,
} = userManagement

const {
  showQrCodeModal,
  showKeyManagementModal,
  showAcceptFile,
  showAcceptText,
  showTextInput,
  showUserSelector,
  loading,
  loadingMessage,
  text,
  acceptText,
  previewSrc,
  setLoading,
  forceCloseLoading,
  showTextReceiveModal,
  showTextSendModal,
  closeTextSendModal,
  closeTextReceiveModal,
  closeAllModals,
} = modalStates

const {
  fileInput,
  progress,
  currentFileMetas,
  currentFileSizes,
  fromUser,
  handleFileSelect,
  // sendFilesToPeer,
  handleFileMetas,
  acceptFile,
  denyFile,
  handleProgress,
  resetProgress,
} = fileTransfer

const {
  qrCodeValue,
  roomCode,
  initializeServer,
  requestCreateDirectRoom,
  requestCreateRoomWithCode,
  handleDirectRoomCreated,
  handleRoomCodeCreated,
  handleJoinWithCode,
  copyLink,
  handleQuery,
  handleRoomCodeExpired,
} = serverConnection

const {
  createPasteHandler,
  sendFilesToMultipleUsers,
  sendTextToMultipleUsers,
  pendingTransfer,
} = clipboard

const {
  hasCacheData,
  isCheckingCache,
  checkCacheData,
  cleanupExpiredCache,
  clearAllCache,
  getCacheStats,
  formatCacheInfo,
} = resumeCache

/** 其他状态 */
const route = useRoute()
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

/** 剪贴板相关状态 */
const clipboardContentType = ref<'files' | 'text'>('files')
const clipboardFiles = ref<File[]>()
const clipboardText = ref<string>()

/** 清理缓存相关状态 */
const showClearCacheModal = ref(false)

/** 缓存检测模态框状态 */
const showCacheDetectionModal = ref(false)

/** 缓存统计信息 */
const cacheStats = computed(() => getCacheStats())
const formattedCacheInfo = computed(() => formatCacheInfo())

/** 初始化服务器连接 */
const { server, peerManager } = initializeServer({
  onNotifyUserInfo,
  onJoinRoom,
  onLeaveRoom,
  onDirectRoomCreated,
  onRoomCodeCreated,
  onUserReconnected,
  setLoading,
  closeAllModals,
})

/** 设置页面可见性处理 */
const pageVisibility = usePageVisibility(server, async () => {

})
const { setupVisibilityHandling } = pageVisibility

onMounted(() => {
  const ripple = new WaterRipple({
    onResize() {
      ripple.setSize(window.innerWidth, window.innerHeight)
    },
    circleCount: 20,
    canvas: canvas.value!,
    strokeStyle: '#c4c4c455',
  })

  handleQuery(route)
  setupVisibilityHandling()

  /** 设置剪贴板处理 */
  const setupPasteHandler = createPasteHandler(
    () => onlineUsers.value,
    sendFilesToPeerFunc,
    sendTextToPeer,
    showUserSelectorForClipboard,
  )
  setupPasteHandler()

  /** 检查断点续传缓存 */
  setTimeout(async () => {
    try {
      console.log('开始检查断点续传缓存...')
      const result = await checkCacheData()

      if (result.hasData) {
        console.log('发现断点续传缓存数据:', result.cacheInfo)
        showCacheDetectionModal.value = true
      }
      else {
        console.log('未发现断点续传缓存数据')
      }
    }
    catch (error) {
      console.error('检查断点续传缓存失败:', error)
    }
  }, 100)
})

/** 创建发送文件函数 */
const sendFilesToPeerFunc = fileTransfer.createSendFilesToPeer(me, setSelectedPeer, setLoading, forceCloseLoading)

/** 设置拖拽功能 */
const setupDragDropHandler = createDragDropHandler(
  () => onlineUsers.value,
  sendFilesToPeerFunc,
  showUserSelectorForClipboard,
)

const dragDrop = setupDragDropHandler({
  enabled: true,
  onDrop: (files) => {
    console.log(`通过拖拽接收到 ${files.length} 个文件`)
  },
})

/** 导出拖拽状态 */
const {
  isDragging,
  isDragFile,
  isDropZoneActive,
} = dragDrop

/** 条件性启用拖拽功能 */
watch(onlineUsers, (users) => {
  if (users.length > 0) {
    dragDrop.enableDragDrop()
  }
  else {
    dragDrop.disableDragDrop()
  }
}, { immediate: true })

/** 在模态框打开时禁用拖拽 */
watch([showAcceptFile, showTextInput, loading], ([acceptFile, textInput, isLoading]) => {
  if (acceptFile || textInput || isLoading) {
    dragDrop.disableDragDrop()
  }
  else if (onlineUsers.value.length > 0) {
    dragDrop.enableDragDrop()
  }
})

/**
 * 向指定用户发送文本
 */
async function sendTextToPeer(targetPeer: UserInfo, textContent: string) {
  if (!me.value) {
    throw new Error('未初始化连接')
  }

  /** 设置选中的用户 */
  setSelectedPeer(targetPeer)
  setLoading(true, `正在向 ${targetPeer.name.displayName} 发送文本...`)

  try {
    /** 建立连接 */
    const { promise, resolve } = Promise.withResolvers()
    await me.value.sendOffer(targetPeer.peerId, resolve)
    await promise

    /** 发送文本 */
    me.value.sendText(textContent)
  }
  catch (error) {
    console.error('发送文本时出错:', error)
    Message.error('发送文本时发生错误')
    forceCloseLoading()
    throw error
  }
  finally {
    setLoading(false)
  }
}

// ======================
// * 事件处理函数
// ======================

async function onRequestCreateDirectRoom() {
  const shouldShowModal = await requestCreateDirectRoom(info.value)
  if (shouldShowModal) {
    showQrCodeModal.value = true
  }
}

async function onRequestCreateRoomWithCode() {
  await requestCreateRoomWithCode(info.value, setLoading)
}

async function onHandleFileSelect(event: Event) {
  if (!selectedPeer.value) {
    return
  }

  server.connect()
  await connectRTCChannel(selectedPeer.value)
  handleFileSelect(event, selectedPeer.value, me.value)
}

async function onDirectRoomCreated(data: any) {
  const shouldShowModal = await handleDirectRoomCreated(data, info.value, setLoading)
  if (shouldShowModal) {
    showQrCodeModal.value = true
  }
}

async function onRoomCodeCreated(data: any) {
  await handleRoomCodeCreated(data, info.value, setLoading)
}

function onJoinWithCode(code: string) {
  handleJoinWithCode(code, setLoading)
}

function onCopyLink() {
  const link = copyLink()
  if (link) {
    copyToClipboard(link)
    Message.success('复制成功')
  }
}

/**
 * 显示右键菜单
 */
async function onContextMenuPeer(peer: UserInfo) {
  if (!me.value)
    return
  setSelectedPeer(peer)
  setLoading(true, `正在连接 ${peer.name.displayName}...`)

  try {
    const { promise, resolve } = Promise.withResolvers()
    await me.value.sendOffer(peer.peerId, resolve)
    await promise

    /** 打开文本输入框 */
    showTextSendModal()
  }
  catch (error) {
    console.error('连接用户失败:', error)
    Message.error('连接失败，请重试')
    forceCloseLoading()
  }
  finally {
    setLoading(false)
  }
}

/**
 * 发送文本
 */
async function sendText() {
  if (!text.value || !me.value)
    return

  me.value.sendText(text.value)
  closeTextSendModal()
}

/**
 * 等待 RTC 通道连接
 */
async function connectRTCChannel(peer: UserInfo) {
  if (!selectedPeer.value || !me.value)
    return

  const { promise, resolve } = Promise.withResolvers()
  await me.value.sendOffer(peer.peerId, resolve)
  await promise
}

/**
 * 单击发送文件
 */
async function onClickPeer(peer: UserInfo) {
  setSelectedPeer(peer)
  if (!me.value)
    return

  setLoading(true, `正在连接 ${peer.name.displayName}...`)

  try {
    await connectRTCChannel(peer)
    fileInput.value?.click()
  }
  catch (error) {
    console.error('连接用户失败:', error)
    Message.error('连接失败，请重试')
    forceCloseLoading()
  }
  finally {
    setLoading(false)
  }
}

function onAcceptFile() {
  acceptFile(showAcceptFile, previewSrc)
  /** 确保关闭loading状态 */
  forceCloseLoading()
}

function onDenyFile() {
  denyFile(showAcceptFile, previewSrc)
  /** 确保关闭loading状态 */
  forceCloseLoading()
}

function onCopyText() {
  copyToClipboard(acceptText.value)
  Message.success('已复制文本')
  closeTextReceiveModal()
}

/**
 * 显示用户选择器（用于剪贴板内容）
 */
function showUserSelectorForClipboard(contentType: 'files' | 'text', files?: File[], textContent?: string) {
  clipboardContentType.value = contentType
  clipboardFiles.value = files
  clipboardText.value = textContent
  showUserSelector.value = true
}

/**
 * 用户选择器确认
 */
async function onUserSelectorConfirm(selectedUsers: UserInfo[]) {
  showUserSelector.value = false

  try {
    if (clipboardContentType.value === 'files' && clipboardFiles.value) {
      await sendFilesToMultipleUsers(clipboardFiles.value, selectedUsers, sendFilesToPeerFunc)
    }
    else if (clipboardContentType.value === 'text' && clipboardText.value) {
      await sendTextToMultipleUsers(clipboardText.value, selectedUsers, sendTextToPeer)
    }
  }
  catch (error) {
    console.error('多用户发送失败:', error)
    Message.error('发送失败，请重试')
  }
  finally {
    /** 清理状态 */
    clipboardFiles.value = undefined
    clipboardText.value = undefined
  }
}

/**
 * 用户选择器取消
 */
function onUserSelectorCancel() {
  showUserSelector.value = false
  clipboardFiles.value = undefined
  clipboardText.value = undefined
}

/**
 * 添加用户
 */
function onJoinRoom(data: UserInfo[]) {
  handleJoinRoom(data)

  for (const item of data) {
    peerManager.createPeer(item.peerId)
  }
}

function onLeaveRoom(data: UserInfo) {
  handleLeaveRoom(data)
  peerManager.rmPeer(data.peerId)
}

/**
 * 处理用户重连
 */
function onUserReconnected(data: any) {
  handleUserReconnected(data)
  /** 使用PeerManager处理重连 */
  peerManager.handleUserReconnection(data)
}

/**
 * 获取自己的 id 等信息
 */
function onNotifyUserInfo(data: UserInfo) {
  setUserInfo(data)
  if (!peerManager.getPeer(data.peerId)) {
    const peer = peerManager.createPeer(data.peerId, {
      // @5. [接收方] 收到文件元数据，获取元数据提示用户接收消息
      /**
       * 在获取元数据时被调用 {@link RTCPeer.handleFileMetas}
       */
      onFileMetas(fileMetas, acceptCallback) {
        /** 根据 fromId 查找发送方用户信息 */
        let fromUserName = '未知用户'
        if (fileMetas && fileMetas.length > 0 && fileMetas[0].fromId) {
          const senderUser = allUsers.value.find(user => user.peerId === fileMetas[0].fromId)
          if (senderUser) {
            fromUserName = senderUser.name.displayName
          }
        }
        handleFileMetas(fileMetas, acceptCallback, showAcceptFile, previewSrc, fromUserName)
      },

      onText(text: string) {
        showTextReceiveModal(text)
      },

      onOtherChannelClose() {
        resetProgress()
        showTextInput.value = false
        showAcceptFile.value = false
        showAcceptText.value = false
      },

      onProgress(data: any) {
        handleProgress(data)
      },
    })
    setMe(peer)
  }
  else {
    const peer = peerManager.getPeer(data.peerId)
    if (peer)
      setMe(peer)
  }

  /** 如果是通过扫码加入的房间，并且当前用户不是房主，则主动向房主发起连接 */
  if (qrCodeValue.value) {
    try {
      const qrData = JSON.parse(qrCodeValue.value)
      let peerIdToJoinFromQr: string | undefined
      if (typeof qrData === 'object' && qrData.peerIdToJoin) {
        peerIdToJoinFromQr = qrData.peerIdToJoin
      }

      if (peerIdToJoinFromQr && peerIdToJoinFromQr !== info.value?.peerId && selectedPeer.value?.peerId === peerIdToJoinFromQr) {
        console.log('扫码加入成功，自动连接房主...')
        if (me.value && selectedPeer.value) {
          const { promise, resolve } = Promise.withResolvers()
          me.value.sendOffer(selectedPeer.value.peerId, resolve)
          promise.then(() => console.log('Offer sent to room owner after scan join'))
        }
      }
    }
    catch (e) {
      /** 如果 qrCodeValue 是 DataURL，解析会失败，这里可以忽略 */
    }
  }

  if (!showQrCodeModal.value) {
    qrCodeValue.value = ''
  }
  setLoading(false)
}

/**
 * 清理缓存处理函数（简化版本，直接使用 ResumeManager）
 */
async function handleClearCache(type: 'all' | 'expired'): Promise<void> {
  try {
    setLoading(true, '正在清理缓存...')

    const resumeManager = new ResumeManager()
    let result

    if (type === 'all') {
      result = await resumeManager.clearAllCache()
    }
    else {
      result = await resumeManager.cleanupExpiredCache(7) // 清理7天前的缓存
    }

    /** 显示清理结果 */
    const message = `清理完成！清理了 ${result.cleanedCount} 个文件，释放了 ${formatByte(result.freedBytes)} 空间`
    Message.success(message)

    console.warn('缓存清理完成:', result)
  }
  catch (error) {
    console.error('清理缓存失败:', error)
    Message.error('清理缓存失败，请重试')
    throw error
  }
  finally {
    setLoading(false)
  }
}

/**
 * 保留断点续传缓存
 */
function handleKeepCache() {
  Message.success('已保留断点续传缓存')
}

/**
 * 清理所有断点续传缓存
 */
async function handleClearAllResumeCache() {
  try {
    const result = await clearAllCache()
    Message.success(`清理完成！清理了 ${result.cleanedCount} 个文件，释放了 ${formatByte(result.freedBytes)} 空间`)
  }
  catch (error) {
    console.error('清理断点续传缓存失败:', error)
    Message.error('清理失败，请重试')
    throw error
  }
}

/**
 * 清理过期断点续传缓存
 */
async function handleCleanupExpiredResumeCache() {
  try {
    const result = await cleanupExpiredCache(7) // 清理7天前的缓存
    Message.success(`清理完成！清理了 ${result.cleanedCount} 个过期文件，释放了 ${formatByte(result.freedBytes)} 空间`)
  }
  catch (error) {
    console.error('清理过期缓存失败:', error)
    Message.error('清理失败，请重试')
    throw error
  }
}
</script>

<style scoped></style>
