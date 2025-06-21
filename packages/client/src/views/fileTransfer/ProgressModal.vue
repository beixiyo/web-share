<template>
  <Modal
    v-model="show"
    class="ProgressModal-container"
    title="文件传输中"
    :mask-closable="false"
    height="auto"
    width="clamp(320px, 90vw, 500px)"
  >
    <div class="size-full flex flex-col gap-3 rounded-2xl p-3 sm:gap-4 sm:p-4">
      <!-- 头部信息 -->
      <div class="flex items-center space-x-3 sm:space-x-4">
        <div
          class="h-10 w-10 flex flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 sm:h-12 sm:w-12 dark:bg-emerald-900/30"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 text-emerald-600 sm:h-6 sm:w-6 dark:text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round" stroke-linejoin="round"
              stroke-width="2"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>
        <div class="min-w-0 flex-1">
          <h3
            class="text-base text-gray-900 font-semibold sm:text-lg dark:text-gray-100"
          >
            文件传输
          </h3>
          <div
            class="truncate text-xs text-gray-500 sm:text-sm dark:text-gray-400"
          >
            正在传输第
            <span
              class="text-emerald-600 font-medium dark:text-emerald-400"
            >{{ progress.curIndex + 1 }}</span>
            个文件，共
            <span class="font-medium">{{ progress.total }}</span>
            个
          </div>
        </div>
      </div>

      <!-- 当前文件信息 -->
      <div class="rounded-lg bg-gray-50 p-2 dark:bg-gray-700/50 sm:p-3">
        <div class="mb-1 flex items-center justify-between sm:mb-2">
          <div class="min-w-0 flex items-center space-x-1.5 sm:space-x-2">
            <component
              :is="getFileIcon(progress.filename)"
              class="h-3.5 w-3.5 flex-shrink-0 text-gray-500 sm:h-4 sm:w-4 dark:text-gray-400"
            />
            <span
              class="truncate text-sm text-gray-900 font-medium sm:text-base dark:text-gray-100"
              :title="progress.filename"
            >
              {{ progress.filename }}
            </span>
          </div>
          <span
            class="flex-shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-600 sm:px-2 sm:py-1 sm:text-xs dark:text-gray-300"
          >
            {{ progress.curIndex + 1 }}/{{ progress.total }}
          </span>
        </div>

        <!-- 文件大小信息 -->
        <div
          v-if="currentFileSize"
          class="text-[10px] text-gray-500 sm:text-xs dark:text-gray-400"
        >
          {{ formatByte(currentFileSize * progress.progress) }} /
          {{ formatByte(currentFileSize) }}
        </div>
      </div>

      <!-- 进度条 -->
      <div class="space-y-2 sm:space-y-3">
        <!-- 单个文件进度 -->
        <div>
          <div class="mb-1 flex items-center justify-between">
            <span
              class="text-xs text-gray-700 font-medium sm:text-sm dark:text-gray-300"
            >当前文件进度</span>
            <span
              class="text-xs text-emerald-600 font-medium sm:text-sm dark:text-emerald-400"
            >{{ numFixed(progress.progress * 100) }}%</span>
          </div>
          <div
            class="h-1.5 w-full rounded-full bg-gray-200 sm:h-2 dark:bg-gray-600"
          >
            <div
              class="h-1.5 rounded-full bg-emerald-600 transition-all duration-300 sm:h-2 dark:bg-emerald-500"
              :style="{ width: `${progress.progress * 100}%` }"
            />
          </div>
        </div>

        <!-- 总体进度 -->
        <div>
          <div class="mb-1 flex items-center justify-between">
            <span
              class="text-xs text-gray-700 font-medium sm:text-sm dark:text-gray-300"
            >总体进度</span>
            <span
              class="text-xs text-green-600 font-medium sm:text-sm dark:text-green-400"
            >{{ numFixed(overallProgress * 100) }}%</span>
          </div>
          <div
            class="h-1.5 w-full rounded-full bg-gray-200 sm:h-2 dark:bg-gray-600"
          >
            <div
              class="h-1.5 rounded-full bg-green-500 transition-all duration-300 sm:h-2 dark:bg-green-400"
              :style="{ width: `${overallProgress * 100}%` }"
            />
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div />
    </template>
  </Modal>
</template>

<script setup lang="ts">
import type { ProgressData } from 'web-share-common'
import { numFixed } from '@jl-org/tool'
import { Archive, File, FileText, Image, Music, Video } from 'lucide-vue-next'
import Modal from '@/components/Modal/index.vue'
import { formatByte } from '@/utils'

defineOptions({ name: 'ProgressModal' })
const props = withDefaults(
  defineProps<{
    progress: ProgressData
    fileSizes?: number[] // 所有文件的大小数组
  }>(),
  {
    fileSizes: () => [],
  },
)
const show = defineModel<boolean>()
/** 计算总体进度 */
const overallProgress = computed(() => {
  if (props.progress.total === 0)
    return 0
  return (props.progress.curIndex + props.progress.progress) / props.progress.total
})

/** 当前文件大小 */
const currentFileSize = computed(() => {
  return props.fileSizes[props.progress.curIndex] || 0
})

/** 获取文件图标 */
function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || ''

  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext))
    return Image
  if (['mp4', 'avi', 'mov', 'wmv', 'flv'].includes(ext))
    return Video
  if (['mp3', 'wav', 'flac', 'aac'].includes(ext))
    return Music
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))
    return Archive
  if (['txt', 'md', 'json', 'xml', 'csv'].includes(ext))
    return FileText
  return File
}
</script>

<style lang="scss" scoped></style>
