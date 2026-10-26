<template>
  <Modal
    v-model="show"
    :title="t('cacheDetection.title')"
    width="600"
    height="500"
    :closable="false"
  >
    <div class="space-y-4">
      <!-- 缓存信息概览 -->
      <div class="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
        <div class="mb-2 flex items-center space-x-2">
          <HardDrive class="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <h3 class="text-sm text-blue-800 font-medium dark:text-blue-200">
            {{ t('cacheDetection.overview') }}
          </h3>
        </div>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span class="text-gray-600 dark:text-gray-400">{{ t('cacheDetection.fileCountLabel') }}:</span>
            <span class="ml-2 text-blue-800 font-medium dark:text-blue-200">
              {{ t('cacheDetection.fileCount', { count: cacheStats.totalFiles }, cacheStats.totalFiles) }}
            </span>
          </div>
          <div>
            <span class="text-gray-600 dark:text-gray-400">{{ t('cacheDetection.storageUsed') }}:</span>
            <span class="ml-2 text-blue-800 font-medium dark:text-blue-200">
              {{ formatBytes(cacheStats.totalBytes) }}
            </span>
          </div>
        </div>
      </div>

      <!-- 缓存文件列表 -->
      <div class="space-y-2">
        <h4 class="text-sm text-gray-700 font-medium dark:text-gray-300">
          {{ t('cacheDetection.fileDetails') }}
        </h4>
        <div
          class="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3 space-y-2 dark:border-gray-700"
        >
          <div
            v-for="item in formattedCacheInfo"
            :key="item.fileHash"
            class="flex items-center justify-between rounded bg-gray-50 p-2 dark:bg-gray-800"
          >
            <div class="min-w-0 flex-1">
              <div
                class="truncate text-sm text-gray-900 font-medium dark:text-gray-100"
              >
                {{ item.fileName }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {{ formatBytes(item.downloadedBytes) }} /
                {{ formatBytes(item.fileSize) }}
                ({{ item.progress }}%)
              </div>
              <div class="text-xs text-gray-400 dark:text-gray-500">
                {{ t('cacheDetection.lastUpdated', { date: item.updatedAt }) }}
              </div>
            </div>
            <div class="ml-2 flex-shrink-0">
              <div
                class="h-2 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
              >
                <div
                  class="h-full bg-blue-500 transition-all duration-300"
                  :style="{ width: `${item.progress}%` }"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作说明 -->
      <div class="rounded-lg bg-yellow-50 p-3 dark:bg-yellow-900/20">
        <div class="flex items-start space-x-2">
          <AlertTriangle
            class="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-600 dark:text-yellow-400"
          />
          <div class="text-sm text-yellow-800 dark:text-yellow-200">
            <p class="mb-1 font-medium">
              {{ t('cacheDetection.incompleteTransfersTitle') }}
            </p>
            <p class="text-xs">
              {{ t('cacheDetection.incompleteTransfersDescription') }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-between">
        <div class="flex space-x-2">
          <Button
            design-style="ghost"
            size="sm"
            :loading="isClearing"
            @click="handleCleanupExpired"
          >
            {{ t('cacheDetection.cleanExpired') }}
          </Button>
        </div>
        <div class="flex space-x-2">
          <Button
            design-style="ghost"
            @click="handleKeepCache"
          >
            {{ t('cacheDetection.keepCache') }}
          </Button>
          <Button
            variant="danger"
            :loading="isClearing"
            :loading-text="t('cacheDetection.cleaning')"
            @click="handleClearAll"
          >
            {{ t('cacheDetection.cleanAll') }}
          </Button>
        </div>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { AlertTriangle, HardDrive } from 'lucide-vue-next'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/Button/index.vue'
import Modal from '@/components/Modal/index.vue'
import { formatByte } from '@/utils'

defineOptions({ name: 'CacheDetectionModal' })

const props = defineProps<{
  cacheStats: CacheStats
  formattedCacheInfo: CacheItem[]
}>()

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'keepCache'): void
  (e: 'clearAll'): Promise<void>
  (e: 'cleanupExpired'): Promise<void>
}>()

interface CacheItem {
  fileHash: string
  fileName: string
  fileSize: number
  downloadedBytes: number
  progress: number
  createdAt: string
  updatedAt: string
}

interface CacheStats {
  totalFiles: number
  totalBytes: number
}

const show = defineModel<boolean>()
const isClearing = ref(false)

/**
 * 格式化字节数
 */
function formatBytes(bytes: number): string {
  return formatByte(bytes)
}

/**
 * 保留缓存
 */
function handleKeepCache() {
  emit('keepCache')
  show.value = false
}

/**
 * 清理所有缓存
 */
async function handleClearAll() {
  if (isClearing.value)
    return

  isClearing.value = true
  try {
    await emit('clearAll')
    show.value = false
  }
  catch (error) {
    console.error('清理缓存失败:', error)
  }
  finally {
    isClearing.value = false
  }
}

/**
 * 清理过期缓存
 */
async function handleCleanupExpired() {
  if (isClearing.value)
    return

  isClearing.value = true
  try {
    await emit('cleanupExpired')
    /** 如果清理后没有缓存了，关闭模态框 */
    if (props.cacheStats.totalFiles === 0) {
      show.value = false
    }
  }
  catch (error) {
    console.error('清理过期缓存失败:', error)
  }
  finally {
    isClearing.value = false
  }
}
</script>

<style scoped>
/* 自定义滚动条样式 */
.overflow-y-auto::-webkit-scrollbar {
  width: 4px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: rgba(156, 163, 175, 0.5);
  border-radius: 2px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: rgba(156, 163, 175, 0.7);
}
</style>
