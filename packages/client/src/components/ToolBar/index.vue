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

    <!-- 其他工具按钮可以在这里添加 -->
  </div>

  <!-- 二维码弹窗 -->
  <QrCodeModal
    @copy="emit('copy')"
    v-model="showQrModal"
    :qr-code-value="qrCodeValue"
    :show-qr-code-modal="showQrModal" />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import Button from '@/components/Button/index.vue'
import QrCodeModal from '@/views/fileTransfer/QrCodeModal.vue'
import { QrCode, Sun, Moon } from 'lucide-vue-next'
import { useTheme } from '@/hooks/useTheme'
import { toggleThemeWithTransition } from '@/utils/theme'

defineOptions({ name: 'ToolBar' })

const props = withDefaults(
  defineProps<{
    qrCodeValue?: string
    showQrCodeModal?: boolean
  }>(),
  {
    qrCodeValue: '',
    showQrCodeModal: false
  }
)

// 主题相关逻辑
const [theme, setTheme] = useTheme()
const handleThemeToggle = toggleThemeWithTransition(theme.value, setTheme)

const emit = defineEmits<{
  (e: 'copy'): void
  (e: 'showQrModal'): void
  (e: 'update:showQrModal', value: boolean): void
}>()

const showQrModal = defineModel<boolean>('showQrModal', { default: false })

// 监听外部的showQrCodeModal变化
watch(() => props.showQrCodeModal, (newVal) => {
  showQrModal.value = newVal
})
</script>

<style scoped>
/* 可以添加一些自定义样式 */
</style>
