<template>
  <Modal class="AcceptModal-container"
    v-model="show">
    <div
      class="p-6 w-[480px] bg-white rounded-2xl shadow-2xl h-[80vh] flex flex-col
             dark:bg-gray-800 dark:shadow-gray-900/50
             sm:w-[90vw] sm:max-w-md sm:p-4 sm:h-[85vh]">
      <!-- 头部信息 -->
      <div class="flex items-center mb-4 space-x-4 sm:space-x-3 sm:mb-3 flex-shrink-0">
        <div
          class="flex justify-center items-center size-12 bg-green-100 rounded-full
                 dark:bg-green-900/30 sm:size-10">
          <Blend color="green" class="dark:text-green-400" />
        </div>
        <div class="flex-1">
          <h3 class="font-semibold text-lg text-gray-900 dark:text-gray-100 sm:text-base">接收文件</h3>
          <div class="text-sm text-gray-500 dark:text-gray-400 sm:text-xs">
            来自 <span class="font-medium text-indigo-600 dark:text-indigo-400">{{ fromUser }}</span>
          </div>
        </div>
      </div>

      <!-- 文件列表 - 固定高度，可滚动 -->
      <div class="flex-1 overflow-y-auto mb-4 sm:mb-3 min-h-0">
        <div class="space-y-3 sm:space-y-2">
          <div v-for="(file, index) in fileMetas" :key="index"
            class="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors
                   dark:bg-gray-700 dark:hover:bg-gray-600
                   sm:p-2">
            <!-- 文件图标 -->
            <div class="flex-shrink-0 w-10 h-10 mr-3 sm:w-8 sm:h-8 sm:mr-2">
              <div
                class="w-full h-full rounded-lg flex items-center justify-center"
                :class="getFileIconClass(file.type)">
                <component :is="getFileIcon(file.type)" class="w-5 h-5 sm:w-4 sm:h-4" />
              </div>
            </div>

            <!-- 文件信息 -->
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm text-gray-900 truncate dark:text-gray-100 sm:text-xs"
                :title="file.name">
                {{ file.name }}
              </div>
              <div class="text-xs text-gray-500 flex items-center space-x-2 dark:text-gray-400 sm:text-[10px] sm:space-x-1">
                <span>{{ formatByte(file.size) }}</span>
                <span>•</span>
                <span>{{ getFileTypeLabel(file.type) }}</span>
              </div>
            </div>

            <!-- 文件序号 -->
            <div class="flex-shrink-0 ml-2 sm:ml-1">
              <span
                class="inline-flex items-center justify-center w-6 h-6 text-xs font-medium text-indigo-600 bg-indigo-100 rounded-full
                       dark:text-indigo-400 dark:bg-indigo-900/30
                       sm:w-5 sm:h-5 sm:text-[10px]">
                {{ index + 1 }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 预览图 -->
      <div v-if="previewSrc" class="mb-4 sm:mb-3 flex-shrink-0">
        <div class="text-sm font-medium text-gray-700 mb-2 dark:text-gray-300 sm:text-xs">预览</div>
        <img :src="previewSrc"
          class="w-full max-h-72 object-contain rounded-lg border dark:border-gray-600 sm:max-h-48" alt="预览图" />
      </div>

      <!-- 统计信息 -->
      <div class="bg-blue-50 rounded-lg p-3 mb-4 dark:bg-blue-900/20 sm:p-2 sm:mb-3 flex-shrink-0">
        <div class="flex justify-between items-center text-sm sm:text-xs">
          <span class="text-gray-600 dark:text-gray-400">总计</span>
          <div class="flex items-center space-x-4 sm:space-x-2">
            <span class="font-medium text-blue-600 dark:text-blue-400">{{ fileMetas.length }}
              个文件</span>
            <span
              class="font-medium text-blue-600 dark:text-blue-400">{{ formatByte(totalSize) }}</span>
          </div>
        </div>
      </div>

      <!-- 操作按钮 - 固定在底部 -->
      <div class="flex justify-end space-x-3 sm:space-x-2 sm:flex-col-reverse sm:space-y-2 sm:space-y-reverse sm:space-x-0 flex-shrink-0">
        <Button
          @click="emit('deny')"
          design-style="ghost"
          variant="default"
          size="md"
          class="sm:w-full">
          拒绝
        </Button>
        <Button
          @click="emit('accept')"
          variant="success"
          size="md"
          class="sm:w-full">
          接收全部
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

// 获取文件图标样式
const getFileIconClass = (type: string) => {
  if (type.startsWith('image/')) return 'bg-green-100 text-green-600'
  if (type.startsWith('video/')) return 'bg-purple-100 text-purple-600'
  if (type.startsWith('audio/')) return 'bg-yellow-100 text-yellow-600'
  if (type.includes('zip') || type.includes('rar') || type.includes('7z')) return 'bg-orange-100 text-orange-600'
  if (type.includes('text') || type.includes('json') || type.includes('xml')) return 'bg-blue-100 text-blue-600'
  return 'bg-gray-100 text-gray-600'
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
