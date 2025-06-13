<template>
  <div
    class="absolute top-4 right-4 z-10 flex items-center space-x-2 sm:space-x-1">
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

    <!-- 生成连接码按钮 -->
    <Button
      @click="emit('showCodeModal')"
      variant="default"
      size="md"
      :icon-only="true"
      :left-icon="Hash"
      :title="roomCode ? '显示连接码' : '生成连接码'" />

    <!-- 输入连接码按钮 -->
    <Button
      @click="showJoinCodeModal = true"
      variant="default"
      size="md"
      :icon-only="true"
      :left-icon="KeyRound"
      :title="'输入连接码'" />

    <!-- 其他工具按钮可以在这里添加 -->
  </div>

  <!-- 二维码弹窗 -->
  <QrCodeModal
    @copy="emit('copy')"
    v-model="showQrModal"
    :qr-code-value="qrCodeValue"
    :show-qr-code-modal="showQrModal" />

  <!-- 输入连接码弹窗 -->
  <Modal
    v-model="showJoinCodeModal"
    title="输入连接码"
    height="auto">
    <div class="p-4 sm:p-3">
      <div class="mb-4">
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
          @click="showJoinCodeModal = false"
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
  </Modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Button from '@/components/Button/index.vue'
import Modal from '@/components/Modal/index.vue'
import QrCodeModal from '@/views/fileTransfer/QrCodeModal.vue'
import { QrCode, Sun, Moon, Hash, KeyRound } from 'lucide-vue-next'
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

// 输入连接码相关状态
const showJoinCodeModal = ref(false)
const joinCode = ref('')

// 监听外部的showQrCodeModal变化
watch(() => props.showQrCodeModal, (newVal) => {
  showQrModal.value = newVal
})

// 处理输入连接码
const handleJoinWithCode = () => {
  if (joinCode.value.trim().length === 6) {
    emit('joinWithCode', joinCode.value.trim())
    showJoinCodeModal.value = false
    joinCode.value = ''
  }
}
</script>

<style scoped>
/* 可以添加一些自定义样式 */
</style>
