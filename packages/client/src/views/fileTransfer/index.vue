<template>
  <div v-loading="loading"
    :class="[
      'overflow-hidden relative h-screen',
      'flex justify-center items-center'
    ]">

    <!-- 浮动小球 -->
    <User :info="info" v-model="onlineUsers"
      @click-peer="onClickPeer"
      @contextmenu-peer="onContextMenuPeer" />

    <!-- 隐藏的文件输入 -->
    <input type="file" ref="fileInput" class="hidden"
      multiple
      @change="handleFileSelect">

    <!-- 文件传输进度弹窗 -->
    <ProgressModal v-if="progress.total > 0"
      :progress="progress" />

    <!-- 发送文本对话框 -->
    <SendTextModal
      v-show="showTextInput"
      :to-name="selectedPeer?.name?.displayName || '--'"
      @close="showTextInput = false"
      @send="sendText"
      v-model="text" />

    <!-- 接收文件提示 -->
    <AcceptModal
      v-if="showAcceptFile"
      :fileMetas="currentFileMetas"
      :previewSrc="previewSrc"
      @accept="onAcceptFile" @deny="onDenyFile" />

    <!-- 接收文本弹窗 -->
    <AcceptTextModal
      v-if="showAcceptText"
      :text="acceptText"
      @close="showAcceptText = false"
      @copy="onCopyText" />

    <canvas ref="canvas" class="absolute top-0 left-0 w-full h-full
      z-[-1] bg-gradient-to-br from-indigo-50 to-blue-100">
    </canvas>
  </div>
</template>

<script setup lang="ts">
import { ServerConnection, PeerManager, RTCPeer } from '@/ClientServer'
import { SELECTED_PEER_ID, type FileMeta, type ProgressData, type UserInfo } from 'web-share-common'
import User from './User.vue'
import AcceptModal from './AcceptModal.vue'
import SendTextModal from './SendTextModal.vue'
import AcceptTextModal from './AcceptTextModal.vue'
import ProgressModal from './ProgressModal.vue'
import { copyToClipboard } from '@jl-org/tool'
import { WaterRipple } from '@jl-org/cvs'


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
const server = new ServerConnection({
  onNotifyUserInfo,
  onJoinRoom,
  onLeaveRoom,
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

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

onMounted(() => {
  const ripple = new WaterRipple({
    onResize() {
      ripple.setSize(window.innerWidth, window.innerHeight)
    },
    circleCount: 20,
    canvas: canvas.value!
  })
})


/***************************************************
 *                    Function
 ***************************************************/

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
  me.value = peerManager.createPeer(data.peerId, {
    /**
     * 在获取元数据时被调用 {@link RTCPeer.saveFileMetas}
     *
     * @param acceptCallback 传递 Promise 过去，当 resolve 时，对方会发送同意
     */
    onFileMetas(fileMetas, acceptCallback) {
      acceptPromise = Promise.withResolvers()
      acceptCallback(acceptPromise)

      showAcceptFile.value = true
      currentFileMetas.value = fileMetas

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

</script>