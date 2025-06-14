<template>
  <Modal
    v-model="show"
    class="AcceptModal-container"
    title="接收文件"
    height="80vh"
    width="clamp(345px, 800px, 60vw)"
    variant="info"
  >
    <div
      class="size-full flex flex-col rounded-2xl"
    >
      <!-- 头部信息 - 固定区域 -->
      <div class="flex-shrink-0 pb-4 sm:px-4 sm:pb-3 sm:pt-4">
        <div class="flex items-center space-x-4 sm:space-x-3">
          <div
            class="size-12 flex flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 sm:size-10 dark:bg-emerald-900/30"
          >
            <Blend
              class="h-6 w-6 text-emerald-600 sm:h-5 sm:w-5 dark:text-emerald-400"
            />
          </div>
          <div class="min-w-0 flex-1">
            <h3
              class="truncate text-lg text-gray-900 font-semibold sm:text-base dark:text-gray-100"
            >
              接收文件
            </h3>
            <div
              class="truncate text-sm text-gray-500 sm:text-xs dark:text-gray-400"
            >
              来自 <span
                class="text-emerald-600 font-medium dark:text-emerald-400"
              >{{ fromUser }}</span>
            </div>
          </div>
        </div>

        <!-- 统计信息卡片 -->
        <div
          class="mt-4 rounded-lg from-emerald-50 to-blue-50 bg-gradient-to-r p-3 dark:from-emerald-900/20 dark:to-blue-900/20 sm:p-2"
        >
          <div class="flex items-center justify-between text-sm sm:text-xs">
            <span
              class="text-gray-600 font-medium dark:text-gray-400"
            >文件总计</span>
            <div class="flex items-center space-x-3 sm:space-x-2">
              <span
                class="text-emerald-600 font-semibold dark:text-emerald-400"
              >
                {{ fileMetas.length }} 个文件
              </span>
              <span class="text-gray-400">•</span>
              <span class="text-blue-600 font-semibold dark:text-blue-400">
                {{ formatByte(totalSize) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 主要内容区域 - 可滚动 -->
      <div class="flex flex-1 flex-col pt-4">
        <!-- 文件列表 -->
        <div class="flex-1">
          <div class="space-y-2 sm:space-y-1.5">
            <div
              v-for="(file, index) in fileMetas" :key="index"
              class="group flex items-center rounded-xl bg-gray-50/50 p-3 transition-all duration-200 dark:bg-gray-700/30 hover:bg-gray-100/80 sm:p-2.5 hover:shadow-sm dark:hover:bg-gray-600/50"
            >
              <!-- 文件序号 -->
              <div class="mr-3 flex-shrink-0 sm:mr-2">
                <div
                  class="h-8 w-8 flex items-center justify-center rounded-lg from-emerald-100 to-emerald-200 bg-gradient-to-br sm:h-7 sm:w-7 dark:from-emerald-900/40 dark:to-emerald-800/40"
                >
                  <span
                    class="text-xs text-emerald-700 font-bold sm:text-[10px] dark:text-emerald-300"
                  >
                    {{ index + 1 }}
                  </span>
                </div>
              </div>

              <!-- 文件图标 -->
              <div class="mr-3 h-10 w-10 flex-shrink-0 sm:mr-2 sm:h-8 sm:w-8">
                <div
                  class="h-full w-full flex items-center justify-center rounded-lg transition-transform group-hover:scale-105"
                  :class="getFileIconClass(file.type)"
                >
                  <component
                    :is="getFileIcon(file.type)"
                    class="h-5 w-5 sm:h-4 sm:w-4"
                  />
                </div>
              </div>

              <!-- 文件信息 -->
              <div class="min-w-0 flex-1">
                <div
                  class="truncate text-sm text-gray-900 font-medium transition-colors sm:text-xs dark:text-gray-100 group-hover:text-gray-700 dark:group-hover:text-gray-200"
                  :title="file.name"
                >
                  {{ file.name }}
                </div>
                <div
                  class="mt-0.5 flex items-center text-xs text-gray-500 space-x-2 sm:text-[10px] dark:text-gray-400 sm:space-x-1"
                >
                  <span class="font-medium">{{ formatByte(file.size) }}</span>
                  <span class="text-gray-300 dark:text-gray-600">•</span>
                  <span
                    class="rounded bg-gray-200/60 px-1.5 py-0.5 text-[10px] font-medium dark:bg-gray-600/60 sm:px-1 sm:text-[9px]"
                  >
                    {{ getFileTypeLabel(file.type) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 空状态 -->
          <div
            v-if="fileMetas.length === 0"
            class="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500"
          >
            <File class="mb-3 h-12 w-12 opacity-50" />
            <p class="text-sm">
              暂无文件
            </p>
          </div>
        </div>

        <!-- 预览图区域 -->
        <div
          v-if="previewSrc"
          class="border-t border-gray-100 px-6 py-3 dark:border-gray-700 sm:px-4 sm:py-2"
        >
          <div
            class="mb-3 text-sm text-gray-700 font-medium sm:mb-2 sm:text-xs dark:text-gray-300"
          >
            文件预览
          </div>
          <div
            class="relative rounded-lg bg-gray-50 dark:bg-gray-700/50"
          >
            <img
              :src="previewSrc"
              class="max-h-64 w-full object-contain lg:max-h-80 sm:max-h-48"
              alt="文件预览"
            >
          </div>
        </div>
      </div>
    </div>

    <!-- 底部操作区域 - 固定 -->
    <template #footer>
      <div
        class="flex flex-shrink-0 gap-4"
      >
        <Button
          design-style="ghost"
          variant="default"
          class="flex-1"
          size="md"
          @click="emit('deny')"
        >
          <span class="font-medium">拒绝</span>
        </Button>

        <Button
          variant="primary"
          class="flex-1"
          size="md"
          @click="emit('accept')"
        >
          <span class="font-medium">接收全部</span>
        </Button>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import type { FileMeta } from 'web-share-common'
import { Archive, Blend, File, FileText, Image, Music, Video } from 'lucide-vue-next'
import Button from '@/components/Button/index.vue'
import Modal from '@/components/Modal/index.vue'
import { formatByte } from '@/utils'

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
    fromUser: '未知用户',
  },
)
const emit = defineEmits<{
  (e: 'accept'): void
  (e: 'deny'): void
}>()
const show = defineModel<boolean>()
/** 计算总文件大小 */
const totalSize = computed(() => {
  return props.fileMetas.reduce((sum, file) => sum + file.size, 0)
})

/** 获取文件图标 */
function getFileIcon(type: string) {
  if (type.startsWith('image/'))
    return Image
  if (type.startsWith('video/'))
    return Video
  if (type.startsWith('audio/'))
    return Music
  if (type.includes('zip') || type.includes('rar') || type.includes('7z'))
    return Archive
  if (type.includes('text') || type.includes('json') || type.includes('xml'))
    return FileText
  return File
}

/** 获取文件图标样式 - 使用项目配色体系 */
function getFileIconClass(type: string) {
  if (type.startsWith('image/'))
    return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
  if (type.startsWith('video/'))
    return 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
  if (type.startsWith('audio/'))
    return 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
  if (type.includes('zip') || type.includes('rar') || type.includes('7z'))
    return 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
  if (type.includes('text') || type.includes('json') || type.includes('xml'))
    return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
  if (type.includes('pdf'))
    return 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
  if (type.includes('word') || type.includes('doc'))
    return 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400'
  if (type.includes('excel') || type.includes('sheet'))
    return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
  return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
}

/** 获取文件类型标签 */
function getFileTypeLabel(type: string) {
  if (type.startsWith('image/'))
    return '图片'
  if (type.startsWith('video/'))
    return '视频'
  if (type.startsWith('audio/'))
    return '音频'
  if (type.includes('zip') || type.includes('rar') || type.includes('7z'))
    return '压缩包'
  if (type.includes('text') || type.includes('json') || type.includes('xml'))
    return '文本'
  if (type.includes('pdf'))
    return 'PDF'
  if (type.includes('word') || type.includes('doc'))
    return 'Word'
  if (type.includes('excel') || type.includes('sheet'))
    return 'Excel'
  return '文件'
}
</script>

<style lang="scss" scoped></style>
