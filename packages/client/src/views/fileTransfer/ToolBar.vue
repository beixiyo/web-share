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
      :title="theme === 'dark' ? t('toolbar.themeLight') : t('toolbar.themeDark')"
      @click="handleThemeToggle"
    />

    <!-- 语言切换按钮 -->
    <Button
      variant="default"
      design-style="neumorphic"
      size="md"
      :icon-only="true"
      :left-icon="Languages"
      :title="t('toolbar.language')"
      @click="toggleLanguage"
    />

    <!-- 连接码管理按钮（合并生成和输入功能） -->
    <Button
      variant="default"
      design-style="neumorphic"
      size="md"
      :icon-only="true"
      :left-icon="KeyRound"
      :title="t('toolbar.linkCode')"
      @click="emit('showKeyManagement')"
    />

    <!-- 清理缓存按钮 -->
    <Button
      variant="default"
      design-style="neumorphic"
      size="md"
      :icon-only="true"
      :left-icon="Trash2"
      :title="t('toolbar.clearCache')"
      @click="emit('clearCache')"
    />

    <!-- GitHub仓库链接按钮 -->
    <Button
      variant="default"
      design-style="neumorphic"
      size="md"
      :icon-only="true"
      :left-icon="Github"
      :title="t('toolbar.github')"
      @click="openGithubRepo"
    />

    <!-- 其他工具按钮可以在这里添加 -->
  </div>
</template>

<script setup lang="ts">
import { Github, KeyRound, Languages, Moon, Sun, Trash2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import Button from '@/components/Button/index.vue'
import { useTheme } from '@/hooks/useTheme'
import { toggleThemeWithTransition } from '@/utils/theme'

defineOptions({ name: 'ToolBar' })

const { t, locale } = useI18n()
const emit = defineEmits<{
  (e: 'showKeyManagement'): void
  (e: 'clearCache'): void
}>()
/** 主题相关逻辑 */
const [theme, setTheme] = useTheme()
const handleThemeToggle = toggleThemeWithTransition(theme, setTheme)

/** 语言切换 */
function toggleLanguage() {
  locale.value = locale.value === 'zh' ? 'en' : 'zh'
  localStorage.setItem('language', locale.value)
}

/** 打开GitHub仓库 */
function openGithubRepo() {
  window.open('https://github.com/beixiyo/web-share', '_blank')
}
</script>

<style scoped>
/* 可以添加一些自定义样式 */
</style>
