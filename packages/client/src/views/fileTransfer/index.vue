<template>
  <div v-loading="loading"
    :class="[
      'overflow-hidden relative h-screen',
      'flex flex-col justify-center items-center',
    ]">

    <!-- 工具栏 -->
    <ToolBar
      :qr-code-value="qrCodeValue"
      :show-qr-code-modal="showQrCodeModal"
      @copy="copyLink"
      @show-qr-modal="requestCreateDirectRoom"
      v-model:show-qr-modal="showQrCodeModal" />

    <!-- 用户信息展示 -->
    <div v-if="info"
      class="absolute top-4 left-4 flex items-center space-x-2 p-3 bg-white/80 backdrop-blur-sm rounded-lg shadow-md
             dark:bg-gray-800/80 dark:shadow-gray-700/50
             sm:p-2 sm:space-x-1 sm:text-sm">
      <component :is="getDeviceIcon(info.name.type || info.name.os)"
        class="w-6 h-6 text-indigo-600 dark:text-indigo-400 sm:w-5 sm:h-5" />
      <span
        class="font-semibold text-gray-700 dark:text-gray-200 sm:text-xs">你当前是:
        {{ info.name.displayName }}</span>
    </div>

    <!-- 浮动小球 -->
    <User :info="info" v-model="onlineUsers"
      @click-peer="onClickPeer"
      @contextmenu-peer="onContextMenuPeer" />

    <!-- 二维码弹窗 -->
    <QrCodeModal
      @copy="copyLink"
      v-model="showQrCodeModal"
      :qrCodeValue
      :showQrCodeModal />

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
import { ref, computed, onMounted } from 'vue'
import { ServerConnection, PeerManager, RTCPeer } from '@/ClientServer'
import { SELECTED_PEER_ID, type FileMeta, type ProgressData, type UserInfo, type RoomInfo } from 'web-share-common'
import User from './User.vue'
import AcceptModal from './AcceptModal.vue'
import SendTextModal from './SendTextModal.vue'
import AcceptTextModal from './AcceptTextModal.vue'
import ProgressModal from './ProgressModal.vue'
import QrCodeModal from './QrCodeModal.vue'
import ToolBar from '@/components/ToolBar/index.vue'
import Button from '@/components/Button/index.vue'
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
const qrCodeValue = ref('')
const currentFileSizes = ref<number[]>([]) // 用于ProgressModal显示文件大小

const server = new ServerConnection({
  onNotifyUserInfo,
  onJoinRoom,
  onLeaveRoom,
  onDirectRoomCreated,

  onError: (errorData) => {
    console.error('Server Error:', errorData.message)
    Message.error(`发生错误: ${errorData.message}`)
    loading.value = false
    showQrCodeModal.value = false
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
})


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
  for (const item of data) {
    peerManager.createPeer(item.peerId)
  }
}

function onLeaveRoom(data: UserInfo) {
  allUsers.value = allUsers.value.filter(item => item.peerId !== data.peerId)
  peerManager.rmPeer(data.peerId)
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

  // showQrCodeModal.value = false // 加入成功后关闭二维码弹窗，这个逻辑可以根据具体场景调整
  // qrCodeValue.value = '' // 清空，这个也需要看是否立即清空
  if (!showQrCodeModal.value) { // 如果二维码弹窗没开，才清空
    qrCodeValue.value = ''
  }
  loading.value = false // 确保加载状态被关闭
}

</script>

<style scoped></style>