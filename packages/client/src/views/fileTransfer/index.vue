<template>
  <div v-loading="loading"
    :class="[
      'overflow-hidden relative h-screen',
      'flex flex-col justify-center items-center',
    ]">

    <!-- 工具栏 -->
    <ToolBar
      :qr-code-value="qrCodeValue"
      @generate-qr-code="requestCreateDirectRoom"
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
      @copy="copyLink"
      v-model="showQrCodeModal"
      :qr-code-value="qrCodeValue"
      :show-qr-code-modal="showQrCodeModal" />

    <!-- 连接码管理弹窗 -->
    <LinkCodeModal
      v-model="showKeyManagementModal"
      :room-code="roomCode"
      @generate-code="requestCreateRoomWithCode"
      @join-with-code="handleJoinWithCode" />

    <!-- 隐藏的文件输入 -->
    <input type="file" ref="fileInput" class="hidden"
      multiple
      @change="handleFileSelect">

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

    <canvas ref="canvas" class="absolute top-0 left-0 w-full h-full
      -z-1 bg-gradient-to-br from-indigo-50 to-blue-100
      dark:from-gray-900 dark:to-gray-800">
    </canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ServerConnection, PeerManager, RTCPeer } from '@/ClientServer'
import { SELECTED_PEER_ID, USER_INFO, Action, type FileMeta, type ProgressData, type UserInfo, type RoomInfo, type RoomCodeInfo, type UserReconnectedInfo } from 'web-share-common'
import User from './User.vue'
import AcceptModal from './AcceptModal.vue'
import SendTextModal from './SendTextModal.vue'
import AcceptTextModal from './AcceptTextModal.vue'
import ProgressModal from './ProgressModal.vue'
import QrCodeModal from './QrCodeModal.vue'
import LinkCodeModal from './LinkCodeModal.vue'
import ToolBar from './ToolBar.vue'
import { copyToClipboard } from '@jl-org/tool'
import { WaterRipple } from '@jl-org/cvs'
import { Laptop, Smartphone, HelpCircle } from 'lucide-vue-next'
import QRCode from 'qrcode'
import { Message } from '@/utils'


/***************************************************
 *                    UserInfo
 ***************************************************/
const me = ref<RTCPeer>()
const info = ref<UserInfo>()
const allUsers = ref<UserInfo[]>([])
const onlineUsers = computed(() => allUsers.value.filter(user => user.peerId !== info.value?.peerId))

const selectedPeer = ref<UserInfo>()

/***************************************************
 *                    Server
 ***************************************************/
const showQrCodeModal = ref(false)
const showKeyManagementModal = ref(false)
const qrCodeValue = ref('')
const roomCode = ref('')
const currentFileSizes = ref<number[]>([]) // 用于ProgressModal显示文件大小

const server = new ServerConnection({
  onNotifyUserInfo,
  onJoinRoom,
  onLeaveRoom,
  onDirectRoomCreated,
  onRoomCodeCreated,
  onUserReconnected,

  onError: (errorData) => {
    console.error('Server Error:', errorData.message)
    Message.error(`发生错误: ${errorData.message}`)
    loading.value = false
    showQrCodeModal.value = false
    showKeyManagementModal.value = false
  }
})
const peerManager = new PeerManager(server)

/**
 * 是否接收文件
 */
let acceptPromise: PromiseWithResolvers<void>
const loading = ref(false)

/***************************************************
 *                    文件传输
 ***************************************************/
const fileInput = ref<HTMLInputElement>()
const getInitProgress = () => ({
  progress: -1,
  total: -1,
  curIndex: -1,
  filename: '--'
})
const progress = ref<ProgressData>(getInitProgress())
const currentFileMetas = ref<FileMeta[]>([])

/***************************************************
 *                  接收文件相关
 ***************************************************/
const showAcceptFile = ref(false)
const previewSrc = ref('')

const showAcceptText = ref(false)
const acceptText = ref('')

const showTextInput = ref(false)
const text = ref('')

/***************************************************
 *                    其他数据
 ***************************************************/
let qrData: string
const route = useRoute()
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

onMounted(() => {
  const ripple = new WaterRipple({
    onResize() {
      ripple.setSize(window.innerWidth, window.innerHeight)
    },
    circleCount: 20,
    canvas: canvas.value!
  })

  handleQuery()
  setupVisibilityHandling()
  setupPasteHandler()
})

/**
 * 设置页面可见性处理
 */
function setupVisibilityHandling() {
  let wasHidden = false

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

  document.addEventListener('visibilitychange', handleVisibilityChange)

  // 组件卸载时清理事件监听
  onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })
}

/**
 * 设置粘贴事件处理
 */
function setupPasteHandler() {
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

    await handleClipboardData(event.clipboardData)
  }

  document.addEventListener('paste', handlePaste)

  // 组件卸载时清理事件监听
  onUnmounted(() => {
    document.removeEventListener('paste', handlePaste)
  })
}

/**
 * 处理剪贴板数据
 */
async function handleClipboardData(clipboardData: DataTransfer) {
  try {
    // 检查是否有在线用户可以发送
    if (onlineUsers.value.length === 0) {
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
      // 混合内容：询问用户要发送什么
      await handleMixedClipboardContent(files, textContent)
    } else if (files.length > 0) {
      // 只有文件
      await handleClipboardFiles(files)
    } else if (textContent.trim()) {
      // 只有文本
      await handleClipboardText(textContent.trim())
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
async function handleClipboardFiles(files: File[]) {
  try {
    // 如果只有一个在线用户，直接发送给该用户
    if (onlineUsers.value.length === 1) {
      const targetPeer = onlineUsers.value[0]
      await sendFilesToPeer(targetPeer, files)
      return
    }

    // 多个用户时，需要选择发送目标
    // 这里可以扩展为显示用户选择对话框，目前发送给第一个用户
    const targetPeer = onlineUsers.value[0]
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
async function handleClipboardText(textContent: string) {
  try {
    // 如果只有一个在线用户，直接发送给该用户
    if (onlineUsers.value.length === 1) {
      const targetPeer = onlineUsers.value[0]
      await sendTextToPeer(targetPeer, textContent)
      return
    }

    // 多个用户时，需要选择发送目标
    // 这里可以扩展为显示用户选择对话框，目前发送给第一个用户
    const targetPeer = onlineUsers.value[0]
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
async function handleMixedClipboardContent(files: File[], textContent: string) {
  try {
    // 简化处理：优先发送文件，如果用户需要发送文本，可以再次粘贴
    Message.info('检测到文件和文本内容，优先发送文件')
    await handleClipboardFiles(files)
  } catch (error) {
    console.error('处理混合剪贴板内容时出错:', error)
    Message.error('处理混合内容时发生错误')
  }
}

/**
 * 向指定用户发送文件
 */
async function sendFilesToPeer(targetPeer: UserInfo, files: File[]) {
  if (!me.value) {
    throw new Error('未初始化连接')
  }

  // 设置选中的用户
  selectedPeer.value = targetPeer
  sessionStorage.setItem(SELECTED_PEER_ID, targetPeer.peerId)

  loading.value = true

  try {
    // 建立连接
    const { promise, resolve } = Promise.withResolvers()
    await me.value.sendOffer(targetPeer.peerId, resolve)
    await promise

    // 更新文件大小数组
    currentFileSizes.value = files.map(f => f.size)

    // 发送文件
    await me.value.sendFileMetas(files)
    await me.value.sendFiles(files, () => {
      console.log('对方拒绝了你的文件')
      Message.warning('对方拒绝了文件传输')
    })
  } finally {
    loading.value = false
  }
}

/**
 * 向指定用户发送文本
 */
async function sendTextToPeer(targetPeer: UserInfo, textContent: string) {
  if (!me.value) {
    throw new Error('未初始化连接')
  }

  // 设置选中的用户
  selectedPeer.value = targetPeer
  sessionStorage.setItem(SELECTED_PEER_ID, targetPeer.peerId)

  loading.value = true

  try {
    // 建立连接
    const { promise, resolve } = Promise.withResolvers()
    await me.value.sendOffer(targetPeer.peerId, resolve)
    await promise

    // 发送文本
    me.value.sendText(textContent)
  } finally {
    loading.value = false
  }
}


/***************************************************
 *                    Function
 ***************************************************/

/**
 * 根据设备类型获取图标
 */
function getDeviceIcon(deviceType: string | undefined) {
  if (!deviceType) return HelpCircle
  if (deviceType.toLowerCase().includes('window')) return Laptop
  if (deviceType.toLowerCase().includes('mobile')) return Smartphone
  return HelpCircle
}

/**
 * 请求创建直接连接房间
 */
async function requestCreateDirectRoom() {
  if (!info.value) {
    Message.warning('无法获取用户信息，请稍后再试')
    return
  }
  if (qrCodeValue.value) {
    showQrCodeModal.value = true
    return
  }

  loading.value = true
  server.createDirectRoom()
}

/**
 * 请求创建带连接码的房间
 */
async function requestCreateRoomWithCode() {
  if (!info.value) {
    Message.warning('无法获取用户信息，请稍后再试')
    return
  }

  loading.value = true
  server.createRoomWithCode()
}

/**
 * 处理服务器创建直接房间的响应
 */
async function onDirectRoomCreated(data: RoomInfo) {
  if (data.roomId) {
    if (info.value) {
      info.value.roomId = data.roomId
      server.saveUserInfoToSession(info.value)
    }
    const { peerId } = data.peerInfo

    qrData = `${ServerConnection.getUrl().href}/fileTransfer/?roomId=${encodeURIComponent(data.roomId)}&peerId=${encodeURIComponent(peerId)}`
    console.log('创建房间成功:', qrData)
    try {
      qrCodeValue.value = await QRCode.toDataURL(qrData, { errorCorrectionLevel: 'H', width: 300 })
      showQrCodeModal.value = true
    }
    catch (err) {
      console.error('生成二维码失败:', err)
      Message.error('生成二维码失败，请稍后再试')
    }
  }

  loading.value = false
}

/**
 * 处理服务器创建房间码的响应
 */
async function onRoomCodeCreated(data: RoomCodeInfo) {
  if (data.roomCode) {
    if (info.value) {
      info.value.roomId = data.roomId
      server.saveUserInfoToSession(info.value)
    }

    roomCode.value = data.roomCode
    console.log('创建房间码成功:', data.roomCode)
  }

  loading.value = false
}

/**
 * 处理输入连接码加入房间
 */
function handleJoinWithCode(code: string) {
  debugger
  if (!code || code.length !== 6) {
    Message.error('请输入6位数字连接码')
    return
  }

  loading.value = true
  server.joinRoomWithCode(code)
}

function copyLink() {
  if (!qrData) return
  copyToClipboard(qrData)
  Message.success('复制成功')
}

function handleQuery() {
  const {
    roomId,
    peerId
  } = route.query
  if (!roomId || !peerId) {
    return
  }

  // @ts-ignore
  server.joinDirectRoom(roomId, peerId)
}

/**
 * 显示右键菜单
 */
const onContextMenuPeer = async (peer: UserInfo) => {
  if (!me) return
  selectedPeer.value = peer
  sessionStorage.setItem(SELECTED_PEER_ID, peer.peerId)
  loading.value = true

  const { promise, resolve } = Promise.withResolvers()
  await me.value?.sendOffer(peer.peerId, resolve)
  await promise

  loading.value = false

  // 打开文本输入框
  showTextInput.value = true
  text.value = ''
}

/**
 * 发送文本
 */
const sendText = async () => {
  if (!text.value || !me) return

  me.value?.sendText(text.value)
  showTextInput.value = false
  text.value = ''
}

/**
 * 单击发送文件
 */
const onClickPeer = async (peer: UserInfo) => {
  selectedPeer.value = peer
  sessionStorage.setItem(SELECTED_PEER_ID, peer.peerId)
  if (!me) return

  loading.value = true

  const { promise, resolve } = Promise.withResolvers()
  await me.value?.sendOffer(peer.peerId, resolve)
  await promise

  loading.value = false
  fileInput.value?.click()
}

/**
 * 处理文件选择
 */
const handleFileSelect = async (event: Event) => {
  if (!selectedPeer.value) {
    return
  }

  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    const files = Array.from(target.files)
    currentFileSizes.value = files.map(f => f.size) // 更新文件大小数组

    me.value?.sendFileMetas(files)
    me.value?.sendFiles(files, () => {
      console.log('对方拒绝了你的文件')
    })
  }

  // @ts-ignore
  event.target.value = ''
}

function onAcceptFile() {
  showAcceptFile.value = false
  acceptPromise?.resolve()
  previewSrc.value = ''
}

function onDenyFile() {
  showAcceptFile.value = false
  acceptPromise?.reject()
  previewSrc.value = ''
}

function onCopyText() {
  copyToClipboard(acceptText.value)
  showAcceptText.value = false
}


/**
 * 添加用户
 */
function onJoinRoom(data: UserInfo[]) {
  allUsers.value = data
  showQrCodeModal.value = false
  showKeyManagementModal.value = false

  for (const item of data) {
    peerManager.createPeer(item.peerId)
  }
}

function onLeaveRoom(data: UserInfo) {
  allUsers.value = allUsers.value.filter(item => item.peerId !== data.peerId)
  peerManager.rmPeer(data.peerId)
}

/**
 * 处理用户重连
 */
function onUserReconnected(data: UserReconnectedInfo) {
  console.log('用户重连事件:', data)

  // 使用PeerManager处理重连
  peerManager.handleUserReconnection(data)

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

/**
 * 获取自己的 id 等信息
 */
function onNotifyUserInfo(data: UserInfo) {
  info.value = data
  if (!peerManager.getPeer(data.peerId)) {
    me.value = peerManager.createPeer(data.peerId, {
      /**
       * 在获取元数据时被调用 {@link RTCPeer.handleFileMetas}
       *
       * @param acceptCallback 传递 Promise 过去，当 resolve 时，对方会发送同意
       */
      onFileMetas(fileMetas, acceptCallback) {
        acceptPromise = Promise.withResolvers()
        acceptCallback(acceptPromise)
        showAcceptFile.value = true
        currentFileMetas.value = fileMetas
        currentFileSizes.value = fileMetas.map(fm => fm.size)

        for (const item of fileMetas) {
          if (!item.base64) continue
          previewSrc.value = item.base64
        }
      },

      onText(text) {
        showAcceptText.value = true
        acceptText.value = text
      },

      onOtherChannelClose() {
        progress.value = getInitProgress()
        showTextInput.value = false
        showAcceptFile.value = false
        showAcceptText.value = false
      },

      onProgress(data: ProgressData) {
        progress.value = data
        if (
          data.total === data.curIndex + 1 &&
          data.progress >= 1
        ) {
          progress.value = getInitProgress()
        }
      }
    })
  }
  else {
    me.value = peerManager.getPeer(data.peerId)
  }

  // 如果是通过扫码加入的房间，并且当前用户不是房主，则主动向房主发起连接
  if (qrCodeValue.value) { // 如果qrCodeValue有值，说明是扫码加入的，或者刚生成了码
    try {
      const qrData = JSON.parse(qrCodeValue.value) // qrCodeValue 现在是 DataURL 或扫码内容
      let peerIdToJoinFromQr: string | undefined
      // 尝试从扫码内容中解析 peerIdToJoin
      if (typeof qrData === 'object' && qrData.peerIdToJoin) {
        peerIdToJoinFromQr = qrData.peerIdToJoin
      }

      if (peerIdToJoinFromQr && peerIdToJoinFromQr !== info.value?.peerId && selectedPeer.value?.peerId === peerIdToJoinFromQr) {
        // 当前用户不是房主，且选中的peer是房主，则自动发起连接
        console.log('扫码加入成功，自动连接房主...')
        if (me.value && selectedPeer.value) {
          const { promise, resolve } = Promise.withResolvers()
          me.value.sendOffer(selectedPeer.value.peerId, resolve)
          promise.then(() => console.log('Offer sent to room owner after scan join'))
        }
      }
    } catch (e) {
      // 如果 qrCodeValue 是 DataURL，解析会失败，这里可以忽略
      // console.warn('Error parsing qrCodeValue in onNotifyUserInfo, possibly a DataURL:', e)
    }
  }

  if (!showQrCodeModal.value) { // 如果二维码弹窗没开，才清空
    qrCodeValue.value = ''
  }
  loading.value = false // 确保加载状态被关闭
}

</script>

<style scoped></style>