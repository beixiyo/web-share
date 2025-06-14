<template>
  <div
    class="absolute right-4 top-4 z-10 flex items-center sm:max-w-[calc(100vw-2rem)] sm:flex-wrap sm:justify-end sm:gap-1 space-x-2 sm:space-x-1"
  >
    <!-- 主题切换按钮 -->
    <Button
      variant="default"
      design-style="neumorphic"
      size="md"
      :icon-only="true"
      :left-icon="theme === 'dark' ? Sun : Moon"
      :title="theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
      @click="handleThemeToggle"
    />

    <!-- 生成二维码按钮 -->
    <Button
      variant="default"
      design-style="neumorphic"
      size="md"
      :icon-only="true"
      :left-icon="QrCode"
      :title="qrCodeValue ? '显示二维码' : '生成二维码'"
      @click="emit('generateQrCode')"
    />

    <!-- 连接码管理按钮（合并生成和输入功能） -->
    <Button
      variant="default"
      design-style="neumorphic"
      size="md"
      :icon-only="true"
      :left-icon="KeyRound"
      title="连接码管理"
      @click="emit('showKeyManagement')"
    />

    <!-- 清理缓存按钮 -->
    <Button
      variant="default"
      design-style="neumorphic"
      size="md"
      :icon-only="true"
      :left-icon="Trash2"
      title="清理缓存"
      @click="emit('clearCache')"
    />

    <!-- 其他工具按钮可以在这里添加 -->
  </div>
</template>

<script setup lang="ts">
import { KeyRound, Moon, QrCode, Sun, Trash2 } from 'lucide-vue-next'
import Button from '@/components/Button/index.vue'
import { useTheme } from '@/hooks/useTheme'
import { toggleThemeWithTransition } from '@/utils/theme'

defineOptions({ name: 'ToolBar' })

const props = withDefaults(
  defineProps<{
    qrCodeValue?: string
  }>(),
  {
    qrCodeValue: '',
  },
)

const emit = defineEmits<{
  (e: 'generateQrCode'): void
  (e: 'showKeyManagement'): void
  (e: 'clearCache'): void
}>()
/** 主题相关逻辑 */
const [theme, setTheme] = useTheme()
const handleThemeToggle = toggleThemeWithTransition(theme, setTheme)
</script>

<style scoped>
/* 可以添加一些自定义样式 */
</style>
