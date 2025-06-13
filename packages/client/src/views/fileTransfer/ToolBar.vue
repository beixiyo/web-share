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
      variant="default"
      @click="emit('generateQrCode')"
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
  <LinkCodeModal
    v-model="showKeyManagementModal"
    :room-code="roomCode"
    @generate-code="emit('generateCode')"
    @join-with-code="emit('joinWithCode', $event)" />
</template>

<script setup lang="ts">
import Button from '@/components/Button/index.vue'
import QrCodeModal from '@/views/fileTransfer/QrCodeModal.vue'
import { QrCode, Sun, Moon, KeyRound } from 'lucide-vue-next'
import { useTheme } from '@/hooks/useTheme'
import { toggleThemeWithTransition } from '@/utils/theme'
import LinkCodeModal from './LinkCodeModal.vue'

defineOptions({ name: 'ToolBar' })

const props = withDefaults(
  defineProps<{
    qrCodeValue?: string
    roomCode?: string
    showCodeModal?: boolean
  }>(),
  {
    qrCodeValue: '',
    roomCode: '',
    showCodeModal: false
  }
)

// 主题相关逻辑
const [theme, setTheme] = useTheme()
const handleThemeToggle = toggleThemeWithTransition(theme, setTheme)

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'joinWithCode', code: string): void
  (e: 'generateCode'): void
  (e: 'generateQrCode'): void
}>()

const showQrModal = defineModel<boolean>('showQrModal', { default: false })

// 连接码管理相关状态
const showKeyManagementModal = ref(false)
</script>

<style scoped>
/* 可以添加一些自定义样式 */
</style>
