<template>
  <Modal class="AcceptModal-container"
    title="接收文件"
    height="600px"
    variant="info"
    v-model="show">
    <div
      class="size-full  rounded-2xl flex flex-col
             ">

      <!-- 头部信息 - 固定区域 -->
      <div class="flex-shrink-0 pb-4 border-b border-gray-100 dark:border-gray-700
                  sm:px-4 sm:pt-4 sm:pb-3">
        <div class="flex items-center space-x-4 sm:space-x-3">
          <div
            class="flex justify-center items-center size-12 bg-emerald-100 rounded-full
                   dark:bg-emerald-900/30 sm:size-10 flex-shrink-0">
            <Blend
              class="w-6 h-6 text-emerald-600 dark:text-emerald-400 sm:w-5 sm:h-5" />
          </div>
          <div class="flex-1 min-w-0">
            <h3
              class="font-semibold text-lg text-gray-900 dark:text-gray-100 sm:text-base truncate">
              接收文件
            </h3>
            <div
              class="text-sm text-gray-500 dark:text-gray-400 sm:text-xs truncate">
              来自 <span
                class="font-medium text-emerald-600 dark:text-emerald-400">{{ fromUser }}</span>
            </div>
          </div>
        </div>

        <!-- 统计信息卡片 -->
        <div class="mt-4 bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-900/20 dark:to-blue-900/20
                    rounded-lg p-3 sm:p-2">
          <div class="flex justify-between items-center text-sm sm:text-xs">
            <span
              class="text-gray-600 dark:text-gray-400 font-medium">文件总计</span>
            <div class="flex items-center space-x-3 sm:space-x-2">
              <span
                class="font-semibold text-emerald-600 dark:text-emerald-400">
                {{ fileMetas.length }} 个文件
              </span>
              <span class="text-gray-400">•</span>
              <span class="font-semibold text-blue-600 dark:text-blue-400">
                {{ formatByte(totalSize) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 主要内容区域 - 可滚动 -->
      <div class="flex-1 flex flex-col pt-4">

        <!-- 文件列表 -->
        <div class="flex-1">
          <div class="space-y-2 sm:space-y-1.5">
            <div v-for="(file, index) in fileMetas" :key="index"
              class="group flex items-center p-3 bg-gray-50/50 rounded-xl hover:bg-gray-100/80
                     hover:shadow-sm transition-all duration-200 border border-transparent
                     hover:border-gray-200/50 dark:bg-gray-700/30 dark:hover:bg-gray-600/50
                     dark:hover:border-gray-600/50 sm:p-2.5">

              <!-- 文件序号 -->
              <div class="flex-shrink-0 mr-3 sm:mr-2">
                <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-200
                           dark:from-emerald-900/40 dark:to-emerald-800/40 flex items-center justify-center
                           sm:w-7 sm:h-7">
                  <span
                    class="text-xs font-bold text-emerald-700 dark:text-emerald-300 sm:text-[10px]">
                    {{ index + 1 }}
                  </span>
                </div>
              </div>

              <!-- 文件图标 -->
              <div class="flex-shrink-0 w-10 h-10 mr-3 sm:w-8 sm:h-8 sm:mr-2">
                <div
                  class="w-full h-full rounded-lg flex items-center justify-center transition-transform
                         group-hover:scale-105"
                  :class="getFileIconClass(file.type)">
                  <component :is="getFileIcon(file.type)"
                    class="w-5 h-5 sm:w-4 sm:h-4" />
                </div>
              </div>

              <!-- 文件信息 -->
              <div class="flex-1 min-w-0">
                <div
                  class="font-medium text-sm text-gray-900 truncate dark:text-gray-100 sm:text-xs
                           group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors"
                  :title="file.name">
                  {{ file.name }}
                </div>
                <div class="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400
                           sm:text-[10px] sm:space-x-1 mt-0.5">
                  <span class="font-medium">{{ formatByte(file.size) }}</span>
                  <span class="text-gray-300 dark:text-gray-600">•</span>
                  <span class="px-1.5 py-0.5 bg-gray-200/60 dark:bg-gray-600/60 rounded text-[10px]
                               font-medium sm:px-1 sm:text-[9px]">
                    {{ getFileTypeLabel(file.type) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-if="fileMetas.length === 0"
            class="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
            <File class="w-12 h-12 mb-3 opacity-50" />
            <p class="text-sm">暂无文件</p>
          </div>
        </div>

        <!-- 预览图区域 -->
        <div v-if="previewSrc"
          class="px-6 py-3 border-t border-gray-100 dark:border-gray-700  sm:px-4 sm:py-2">
          <div
            class="text-sm font-medium text-gray-700 mb-3 dark:text-gray-300 sm:text-xs sm:mb-2">
            文件预览
          </div>
          <div
            class="relative rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <img :src="previewSrc"
              class="w-full max-h-48 object-contain sm:max-h-32"
              alt="文件预览" />
          </div>
        </div>
      </div>

      <!-- 底部操作区域 - 固定 -->
      <div
        class="flex-shrink-0 flex gap-4 border-t border-gray-100 dark:border-gray-700">
        <Button
          @click="emit('deny')"
          design-style="ghost"
          variant="default"
          class="flex-1"
          size="md">
          <span class="font-medium">拒绝</span>
        </Button>

        <Button
          @click="emit('accept')"
          variant="primary"
          class="flex-1"
          size="md">
          <span class="font-medium">接收全部</span>
        </Button>
      </div>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import type { FileMeta } from 'web-share-common'
import { FileText, Image, Video, Music, Archive, File, Blend } from 'lucide-vue-next'
import { formatByte } from '@/utils'
import Modal from '@/components/Modal/index.vue'
import Button from '@/components/Button/index.vue'

const show = defineModel<boolean>()
defineOptions({ name: 'AcceptModal' })

const props = withDefaults(
  defineProps<{
    fileMetas: FileMeta[]
    previewSrc?: string
    fromUser?: string
  }>(),
  {
    fileMetas: () => [],
    previewSrc: '',
    fromUser: '未知用户'
  }
)

const emit = defineEmits<{
  (e: 'accept'): void
  (e: 'deny'): void
}>()

// 计算总文件大小
const totalSize = computed(() => {
  return props.fileMetas.reduce((sum, file) => sum + file.size, 0)
})

// 获取文件图标
const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return Image
  if (type.startsWith('video/')) return Video
  if (type.startsWith('audio/')) return Music
  if (type.includes('zip') || type.includes('rar') || type.includes('7z')) return Archive
  if (type.includes('text') || type.includes('json') || type.includes('xml')) return FileText
  return File
}

// 获取文件图标样式 - 使用项目配色体系
const getFileIconClass = (type: string) => {
  if (type.startsWith('image/')) return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
  if (type.startsWith('video/')) return 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
  if (type.startsWith('audio/')) return 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
  if (type.includes('zip') || type.includes('rar') || type.includes('7z')) return 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
  if (type.includes('text') || type.includes('json') || type.includes('xml')) return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
  if (type.includes('pdf')) return 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
  if (type.includes('word') || type.includes('doc')) return 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400'
  if (type.includes('excel') || type.includes('sheet')) return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
  return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
}

// 获取文件类型标签
const getFileTypeLabel = (type: string) => {
  if (type.startsWith('image/')) return '图片'
  if (type.startsWith('video/')) return '视频'
  if (type.startsWith('audio/')) return '音频'
  if (type.includes('zip') || type.includes('rar') || type.includes('7z')) return '压缩包'
  if (type.includes('text') || type.includes('json') || type.includes('xml')) return '文本'
  if (type.includes('pdf')) return 'PDF'
  if (type.includes('word') || type.includes('doc')) return 'Word'
  if (type.includes('excel') || type.includes('sheet')) return 'Excel'
  return '文件'
}
</script>

<style lang="scss" scoped></style>
