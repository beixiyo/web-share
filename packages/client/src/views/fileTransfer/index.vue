<template>
  <div v-loading="{ loading, text: loadingMessage }"
    :class="[
      'overflow-hidden relative h-screen',
      'flex flex-col justify-center items-center',
    ]">

    <!-- 工具栏 -->
    <ToolBar
      :qr-code-value="qrCodeValue"
      @generate-qr-code="onRequestCreateDirectRoom"
      @show-key-management="showKeyManagementModal = true" />

    <!-- 用户信息展示 - 移动到中心底部 -->
    <div v-if="info"
      class="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex flex-col items-center space-y-2">
      <!-- 主要用户信息 -->
      <div class="flex items-center space-x-2 p-3 bg-white/80 backdrop-blur-sm rounded-lg shadow-md
                  dark:bg-gray-800/80 dark:shadow-gray-700/50
                  sm:p-2 sm:space-x-1 sm:text-sm sm:max-w-[calc(100vw-2rem)]">
        <component :is="getDeviceIcon(info.name.type || info.name.os)"
          class="w-6 h-6 text-emerald-600 dark:text-emerald-400 sm:w-5 sm:h-5 flex-shrink-0" />
        <span
          class="font-semibold text-gray-700 dark:text-gray-200 sm:text-xs truncate">
          你当前是: <span
            class="text-emerald-600 dark:text-emerald-400">{{ info.name.displayName }}</span>
        </span>
      </div>

      <!-- 粘贴提示 -->
      <div v-if="onlineUsers.length > 0"
        class="text-xs text-gray-500 dark:text-gray-400 bg-white/60 dark:bg-gray-800/60
               backdrop-blur-sm px-2 py-1 rounded-md shadow-sm
               sm:text-[10px] sm:px-1.5 sm:py-0.5">
        💡 按 Ctrl+V 粘贴文件或文本快速发送
      </div>
    </div>

    <!-- 浮动小球 -->
    <User :info="info" v-model="onlineUsers"
      @click-peer="onClickPeer"
      @contextmenu-peer="onContextMenuPeer" />

    <!-- 二维码弹窗 -->
    <QrCodeModal
      @copy="onCopyLink"
      v-model="showQrCodeModal"
      :qr-code-value="qrCodeValue"
      :show-qr-code-modal="showQrCodeModal" />

    <!-- 连接码管理弹窗 -->
    <LinkCodeModal
      v-model="showKeyManagementModal"
      :room-code="roomCode"
      @generate-code="onRequestCreateRoomWithCode"
      @join-with-code="onJoinWithCode" />

    <!-- 隐藏的文件输入 -->
    <input type="file" ref="fileInput" class="hidden"
      multiple
      @change="onHandleFileSelect">

    <!-- 文件传输进度弹窗 -->
    <ProgressModal :model-value="progress.total > 0"
      :progress="progress" :fileSizes="currentFileSizes" />

    <!-- 发送文本对话框 -->
    <SendTextModal
      :to-name="selectedPeer?.name?.displayName || '--'"
      @close="showTextInput = false"
      @send="sendText"
      v-model:text="text"
      v-model="showTextInput" />

    <!-- 接收文件提示 -->
    <AcceptModal
      v-model="showAcceptFile"
      :fileMetas="currentFileMetas"
      :previewSrc="previewSrc"
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

    <canvas ref="canvas" class="absolute top-0 left-0 w-full h-full
      -z-1 bg-gradient-to-br from-indigo-50 to-blue-100
      dark:from-gray-900 dark:to-gray-800">
    </canvas>
  </div>
</template>

<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue'
import { useRoute } from 'vue-router'
import { SELECTED_PEER_ID } from 'web-share-common'
import type { UserInfo } from 'web-share-common'
import User from './User.vue'
import AcceptModal from './AcceptModal.vue'
import SendTextModal from './SendTextModal.vue'
import AcceptTextModal from './AcceptTextModal.vue'
import ProgressModal from './ProgressModal.vue'
import QrCodeModal from './QrCodeModal.vue'
import LinkCodeModal from './LinkCodeModal.vue'
import ToolBar from './ToolBar.vue'
import UserSelectorModal from './UserSelectorModal.vue'
import { WaterRipple } from '@jl-org/cvs'
import { copyToClipboard } from '@jl-org/tool'
import { Message } from '@/utils'
import { useUserManagement } from './hooks/useUserManagement'
import { useServerConnection } from './hooks/useServerConnection'
import { useFileTransfer } from './hooks/useFileTransfer'
import { useClipboard } from './hooks/useClipboard'
import { useModalStates } from './hooks/useModalStates'
import { usePageVisibility } from './hooks/usePageVisibility'
import { getDeviceIcon } from './hooks/tools'

// 使用各种hooks
const userManagement = useUserManagement()
const modalStates = useModalStates()
const fileTransfer = useFileTransfer()
const serverConnection = useServerConnection()
const clipboard = useClipboard()

// 从hooks中解构需要的状态和方法
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
  handleUserReconnected
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
  closeAllModals
} = modalStates

const {
  fileInput,
  progress,
  currentFileMetas,
  currentFileSizes,
  handleFileSelect,
  // sendFilesToPeer,
  handleFileMetas,
  acceptFile,
  denyFile,
  handleProgress,
  resetProgress
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
  handleQuery
} = serverConnection

const {
  createPasteHandler,
  sendFilesToMultipleUsers,
  sendTextToMultipleUsers,
  pendingTransfer
} = clipboard

// 其他状态
const route = useRoute()
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

// 剪贴板相关状态
const clipboardContentType = ref<'files' | 'text'>('files')
const clipboardFiles = ref<File[]>()
const clipboardText = ref<string>()

// 初始化服务器连接
const { server, peerManager } = initializeServer({
  onNotifyUserInfo,
  onJoinRoom,
  onLeaveRoom,
  onDirectRoomCreated,
  onRoomCodeCreated,
  onUserReconnected,
  setLoading,
  closeAllModals
})

// 设置页面可见性处理
const pageVisibility = usePageVisibility(server)
const { setupVisibilityHandling } = pageVisibility

onMounted(() => {
  const ripple = new WaterRipple({
    onResize() {
      ripple.setSize(window.innerWidth, window.innerHeight)
    },
    circleCount: 20,
    canvas: canvas.value!
  })

  handleQuery(route)
  setupVisibilityHandling()

  // 设置剪贴板处理
  const setupPasteHandler = createPasteHandler(
    () => onlineUsers.value,
    sendFilesToPeerFunc,
    sendTextToPeer,
    showUserSelectorForClipboard
  )
  setupPasteHandler()
})



// 创建发送文件函数
const sendFilesToPeerFunc = fileTransfer.createSendFilesToPeer(me, setSelectedPeer, setLoading, forceCloseLoading)

/**
 * 向指定用户发送文本
 */
async function sendTextToPeer(targetPeer: UserInfo, textContent: string) {
  if (!me.value) {
    throw new Error('未初始化连接')
  }

  // 设置选中的用户
  setSelectedPeer(targetPeer)
  setLoading(true, `正在向 ${targetPeer.name.displayName} 发送文本...`)

  try {
    // 建立连接
    const { promise, resolve } = Promise.withResolvers()
    await me.value.sendOffer(targetPeer.peerId, resolve)
    await promise

    // 发送文本
    me.value.sendText(textContent)
  } catch (error) {
    console.error('发送文本时出错:', error)
    Message.error('发送文本时发生错误')
    forceCloseLoading()
    throw error
  } finally {
    setLoading(false)
  }
}


// 事件处理函数
async function onRequestCreateDirectRoom() {
  const shouldShowModal = await requestCreateDirectRoom(info.value, setLoading)
  if (shouldShowModal) {
    showQrCodeModal.value = true
  }
}

async function onRequestCreateRoomWithCode() {
  await requestCreateRoomWithCode(info.value, setLoading)
}

function onHandleFileSelect(event: Event) {
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
const onContextMenuPeer = async (peer: UserInfo) => {
  if (!me.value) return
  setSelectedPeer(peer)
  setLoading(true, `正在连接 ${peer.name.displayName}...`)

  try {
    const { promise, resolve } = Promise.withResolvers()
    await me.value.sendOffer(peer.peerId, resolve)
    await promise

    // 打开文本输入框
    showTextSendModal()
  } catch (error) {
    console.error('连接用户失败:', error)
    Message.error('连接失败，请重试')
    forceCloseLoading()
  } finally {
    setLoading(false)
  }
}

/**
 * 发送文本
 */
const sendText = async () => {
  if (!text.value || !me.value) return

  me.value.sendText(text.value)
  closeTextSendModal()
}

/**
 * 单击发送文件
 */
const onClickPeer = async (peer: UserInfo) => {
  setSelectedPeer(peer)
  if (!me.value) return

  setLoading(true, `正在连接 ${peer.name.displayName}...`)

  try {
    const { promise, resolve } = Promise.withResolvers()
    await me.value.sendOffer(peer.peerId, resolve)
    await promise

    fileInput.value?.click()
  } catch (error) {
    console.error('连接用户失败:', error)
    Message.error('连接失败，请重试')
    forceCloseLoading()
  } finally {
    setLoading(false)
  }
}

function onAcceptFile() {
  acceptFile(showAcceptFile, previewSrc)
  // 确保关闭loading状态
  forceCloseLoading()
}

function onDenyFile() {
  denyFile(showAcceptFile, previewSrc)
  // 确保关闭loading状态
  forceCloseLoading()
}

function onCopyText() {
  copyToClipboard(acceptText.value)
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
    } else if (clipboardContentType.value === 'text' && clipboardText.value) {
      await sendTextToMultipleUsers(clipboardText.value, selectedUsers, sendTextToPeer)
    }
  } catch (error) {
    console.error('多用户发送失败:', error)
    Message.error('发送失败，请重试')
  } finally {
    // 清理状态
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
  // 使用PeerManager处理重连
  peerManager.handleUserReconnection(data)
}

/**
 * 获取自己的 id 等信息
 */
function onNotifyUserInfo(data: UserInfo) {
  setUserInfo(data)
  if (!peerManager.getPeer(data.peerId)) {
    const peer = peerManager.createPeer(data.peerId, {
      /**
       * 在获取元数据时被调用 {@link RTCPeer.handleFileMetas}
       */
      onFileMetas(fileMetas: any, acceptCallback: any) {
        handleFileMetas(fileMetas, acceptCallback, showAcceptFile, previewSrc)
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
      }
    })
    setMe(peer)
  }
  else {
    const peer = peerManager.getPeer(data.peerId)
    if (peer) setMe(peer)
  }

  // 如果是通过扫码加入的房间，并且当前用户不是房主，则主动向房主发起连接
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
    } catch (e) {
      // 如果 qrCodeValue 是 DataURL，解析会失败，这里可以忽略
    }
  }

  if (!showQrCodeModal.value) {
    qrCodeValue.value = ''
  }
  setLoading(false)
}

</script>

<style scoped></style>