<template>
  <Modal class="ProgressModal-container"
    v-model="show"
    title="文件传输中"
    height="auto">
    <div class="size-full rounded-2xl flex flex-col p-4 gap-4 sm:p-3 sm:gap-3">
      <!-- 头部信息 -->
      <div class="flex items-center space-x-4 sm:space-x-3">
        <div
          class="flex justify-center items-center w-12 h-12 bg-emerald-100 rounded-full
                 dark:bg-emerald-900/30 sm:w-10 sm:h-10 flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg"
            class="w-6 h-6 text-emerald-600 dark:text-emerald-400 sm:w-5 sm:h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round"
              stroke-width="2"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-lg text-gray-900 dark:text-gray-100 sm:text-base">文件传输</h3>
          <div class="text-sm text-gray-500 dark:text-gray-400 sm:text-xs truncate">
            正在传输第
            <span class="font-medium text-emerald-600 dark:text-emerald-400">{{ progress.curIndex + 1 }}</span>
            个文件，共
            <span class="font-medium">{{ progress.total }}</span>
            个
          </div>
        </div>
      </div>

      <!-- 当前文件信息 -->
      <div class="p-3 bg-gray-50 rounded-lg dark:bg-gray-700/50 sm:p-2">
        <div class="flex items-center justify-between mb-2 sm:mb-1">
          <div class="flex items-center space-x-2 min-w-0 sm:space-x-1.5">
            <component :is="getFileIcon(progress.filename)"
              class="w-4 h-4 text-gray-500 dark:text-gray-400 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
            <span class="font-medium text-gray-900 truncate dark:text-gray-100 sm:text-sm"
              :title="progress.filename">
              {{ progress.filename }}
            </span>
          </div>
          <span class="text-xs text-gray-500 bg-white px-2 py-1 rounded dark:bg-gray-600 dark:text-gray-300 sm:text-[10px] sm:px-1.5 flex-shrink-0">
            {{ progress.curIndex + 1 }}/{{ progress.total }}
          </span>
        </div>

        <!-- 文件大小信息 -->
        <div v-if="currentFileSize"
          class="text-xs text-gray-500 dark:text-gray-400 sm:text-[10px]">
          {{ formatByte(currentFileSize * progress.progress) }} /
          {{ formatByte(currentFileSize) }}
        </div>
      </div>

      <!-- 进度条 -->
      <div class="space-y-3 sm:space-y-2">
        <!-- 单个文件进度 -->
        <div>
          <div class="flex justify-between items-center mb-1">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300 sm:text-xs">当前文件进度</span>
            <span
              class="text-sm font-medium text-emerald-600 dark:text-emerald-400 sm:text-xs">{{ numFixed(progress.progress * 100) }}%</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-600 sm:h-1.5">
            <div
              class="bg-emerald-600 h-2 rounded-full transition-all duration-300 dark:bg-emerald-500 sm:h-1.5"
              :style="{ width: `${progress.progress * 100}%` }">
            </div>
          </div>
        </div>

        <!-- 总体进度 -->
        <div>
          <div class="flex justify-between items-center mb-1">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300 sm:text-xs">总体进度</span>
            <span
              class="text-sm font-medium text-green-600 dark:text-green-400 sm:text-xs">{{ numFixed(overallProgress * 100) }}%</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-600 sm:h-1.5">
            <div
              class="bg-green-500 h-2 rounded-full transition-all duration-300 dark:bg-green-400 sm:h-1.5"
              :style="{ width: `${overallProgress * 100}%` }">
            </div>
          </div>
        </div>
      </div>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import type { ProgressData } from 'web-share-common'
import { formatByte } from '@/utils'
import { FileText, Image, Video, Music, Archive, File } from 'lucide-vue-next'
import { numFixed } from '@jl-org/tool'
import Modal from '@/components/Modal/index.vue'

const show = defineModel<boolean>()
defineOptions({ name: 'ProgressModal' })

const props = withDefaults(
  defineProps<{
    progress: ProgressData
    fileSizes?: number[] // 所有文件的大小数组
  }>(),
  {
    fileSizes: () => []
  }
)

// 计算总体进度
const overallProgress = computed(() => {
  if (props.progress.total === 0) return 0
  return (props.progress.curIndex + props.progress.progress) / props.progress.total
})

// 当前文件大小
const currentFileSize = computed(() => {
  return props.fileSizes[props.progress.curIndex] || 0
})

// 获取文件图标
const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase() || ''

  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return Image
  if (['mp4', 'avi', 'mov', 'wmv', 'flv'].includes(ext)) return Video
  if (['mp3', 'wav', 'flac', 'aac'].includes(ext)) return Music
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return Archive
  if (['txt', 'md', 'json', 'xml', 'csv'].includes(ext)) return FileText
  return File
}
</script>

<style lang="scss" scoped></style>
