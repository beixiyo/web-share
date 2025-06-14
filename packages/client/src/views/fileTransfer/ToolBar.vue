<template>
  <div
    class="absolute top-4 right-4 z-10 flex items-center space-x-2 sm:space-x-1
           sm:flex-wrap sm:justify-end sm:gap-1 sm:max-w-[calc(100vw-2rem)]">
    <!-- 主题切换按钮 -->
    <Button
      @click="handleThemeToggle"
      variant="default"
      design-style="neumorphic"
      size="md"
      :icon-only="true"
      :left-icon="theme === 'dark' ? Sun : Moon"
      :title="theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'" />

    <!-- 生成二维码按钮 -->
    <Button
      variant="default"
      design-style="neumorphic"
      @click="emit('generateQrCode')"
      size="md"
      :icon-only="true"
      :left-icon="QrCode"
      :title="qrCodeValue ? '显示二维码' : '生成二维码'" />

    <!-- 连接码管理按钮（合并生成和输入功能） -->
    <Button
      @click="emit('showKeyManagement')"
      variant="default"
      design-style="neumorphic"
      size="md"
      :icon-only="true"
      :left-icon="KeyRound"
      :title="'连接码管理'" />

    <!-- 其他工具按钮可以在这里添加 -->
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/Button/index.vue'
import { QrCode, Sun, Moon, KeyRound } from 'lucide-vue-next'
import { useTheme } from '@/hooks/useTheme'
import { toggleThemeWithTransition } from '@/utils/theme'

defineOptions({ name: 'ToolBar' })

const props = withDefaults(
  defineProps<{
    qrCodeValue?: string
  }>(),
  {
    qrCodeValue: ''
  }
)

// 主题相关逻辑
const [theme, setTheme] = useTheme()
const handleThemeToggle = toggleThemeWithTransition(theme, setTheme)

const emit = defineEmits<{
  (e: 'generateQrCode'): void
  (e: 'showKeyManagement'): void
}>()
</script>

<style scoped>
/* 可以添加一些自定义样式 */
</style>
