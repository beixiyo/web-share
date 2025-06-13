<template>
  <div
    class="absolute top-4 right-4 z-10 flex items-center space-x-2 sm:space-x-1
           sm:flex-wrap sm:justify-end sm:gap-1 sm:max-w-[calc(100vw-2rem)]">
    <!-- 主题切换按钮 -->
    <Button
      @click="handleThemeToggle"
      variant="default"
      size="md"
      :icon-only="true"
      :left-icon="theme === 'dark' ? Sun : Moon"
      :title="theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'" />

    <!-- 生成二维码按钮 -->
    <Button
      @click="emit('showQrModal')"
      variant="default"
      size="md"
      :icon-only="true"
      :left-icon="QrCode"
      :title="qrCodeValue ? '显示二维码' : '生成二维码'" />

    <!-- 连接码管理按钮（合并生成和输入功能） -->
    <Button
      @click="showKeyManagementModal = true"
      variant="default"
      size="md"
      :icon-only="true"
      :left-icon="KeyRound"
      :title="'连接码管理'" />

    <!-- 其他工具按钮可以在这里添加 -->
  </div>

  <!-- 二维码弹窗 -->
  <QrCodeModal
    @copy="emit('copy')"
    v-model="showQrModal"
    :qr-code-value="qrCodeValue"
    :show-qr-code-modal="showQrModal" />

  <!-- 连接码管理弹窗 -->
  <Modal
    v-model="showKeyManagementModal"
    title="连接码管理"
    height="auto">
    <div class="p-4 sm:p-3">
      <!-- 选项卡 -->
      <div class="flex mb-4 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
        <button
          @click="activeTab = 'generate'"
          :class="[
            'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors',
            activeTab === 'generate'
              ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          ]">
          生成连接码
        </button>
        <button
          @click="activeTab = 'input'"
          :class="[
            'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors',
            activeTab === 'input'
              ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          ]">
          输入连接码
        </button>
      </div>

      <!-- 生成连接码内容 -->
      <div v-if="activeTab === 'generate'" class="space-y-4">
        <div class="text-center">
          <div v-if="roomCode" class="text-6xl font-mono font-bold text-indigo-600 dark:text-indigo-400 mb-4 tracking-wider">
            {{ roomCode }}
          </div>
          <p v-else class="text-gray-500 dark:text-gray-400 mb-4">
            点击下方按钮生成连接码
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">
            {{ roomCode ? '请将此6位数字码告诉对方，让对方输入此码加入房间' : '生成一个6位数字连接码供他人加入' }}
          </p>
        </div>
        <div class="flex justify-center space-x-2">
          <Button
            v-if="!roomCode"
            @click="emit('showCodeModal')"
            variant="primary"
            size="md">
            生成连接码
          </Button>
          <Button
            v-else
            @click="copyRoomCode"
            variant="primary"
            size="md">
            复制连接码
          </Button>
        </div>
      </div>

      <!-- 输入连接码内容 -->
      <div v-if="activeTab === 'input'" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            请输入6位数字连接码
          </label>
          <input
            v-model="joinCode"
            type="text"
            maxlength="6"
            placeholder="例如: 123456"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                   dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400
                   sm:text-sm"
            @keyup.enter="handleJoinWithCode"
            @input="joinCode = joinCode.replace(/[^0-9]/g, '')" />
        </div>
        <div class="flex justify-end space-x-2">
          <Button
            @click="showKeyManagementModal = false"
            variant="default"
            size="md">
            取消
          </Button>
          <Button
            @click="handleJoinWithCode"
            variant="primary"
            size="md"
            :disabled="joinCode.length !== 6">
            加入房间
          </Button>
        </div>
      </div>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Button from '@/components/Button/index.vue'
import Modal from '@/components/Modal/index.vue'
import QrCodeModal from '@/views/fileTransfer/QrCodeModal.vue'
import { QrCode, Sun, Moon, KeyRound } from 'lucide-vue-next'
import { copyToClipboard } from '@jl-org/tool'
import { Message } from '@/utils'
import { useTheme } from '@/hooks/useTheme'
import { toggleThemeWithTransition } from '@/utils/theme'

defineOptions({ name: 'ToolBar' })

const props = withDefaults(
  defineProps<{
    qrCodeValue?: string
    showQrCodeModal?: boolean
    roomCode?: string
    showCodeModal?: boolean
  }>(),
  {
    qrCodeValue: '',
    showQrCodeModal: false,
    roomCode: '',
    showCodeModal: false
  }
)

// 主题相关逻辑
const [theme, setTheme] = useTheme()
const handleThemeToggle = toggleThemeWithTransition(theme, setTheme)

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'showQrModal'): void
  (e: 'update:showQrModal', value: boolean): void
  (e: 'showCodeModal'): void
  (e: 'joinWithCode', code: string): void
}>()

const showQrModal = defineModel<boolean>('showQrModal', { default: false })

// 连接码管理相关状态
const showKeyManagementModal = ref(false)
const activeTab = ref<'generate' | 'input'>('generate')
const joinCode = ref('')

// 监听外部的showQrCodeModal变化
watch(() => props.showQrCodeModal, (newVal) => {
  showQrModal.value = newVal
})

// 处理输入连接码
const handleJoinWithCode = () => {
  if (joinCode.value.trim().length === 6) {
    emit('joinWithCode', joinCode.value.trim())
    showKeyManagementModal.value = false
    joinCode.value = ''
  }
}

// 复制房间码
const copyRoomCode = () => {
  if (!props.roomCode) return
  copyToClipboard(props.roomCode)
  Message.success('连接码已复制')
}
</script>

<style scoped>
/* 可以添加一些自定义样式 */
</style>
