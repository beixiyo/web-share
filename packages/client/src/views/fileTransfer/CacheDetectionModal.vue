<template>
  <Modal
    v-model="show"
    title="检测到断点续传缓存"
    width="600"
    height="500"
    :closable="false">
    <div class="space-y-4">
      <!-- 缓存信息概览 -->
      <div class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <div class="flex items-center space-x-2 mb-2">
          <HardDrive class="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h3 class="text-sm font-medium text-blue-800 dark:text-blue-200">
            缓存概览
          </h3>
        </div>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span class="text-gray-600 dark:text-gray-400">缓存文件数:</span>
            <span class="ml-2 font-medium text-blue-800 dark:text-blue-200">
              {{ cacheStats.totalFiles }} 个
            </span>
          </div>
          <div>
            <span class="text-gray-600 dark:text-gray-400">占用空间:</span>
            <span class="ml-2 font-medium text-blue-800 dark:text-blue-200">
              {{ formatBytes(cacheStats.totalBytes) }}
            </span>
          </div>
        </div>
      </div>

      <!-- 缓存文件列表 -->
      <div class="space-y-2">
        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">
          缓存文件详情
        </h4>
        <div
          class="max-h-48 overflow-y-auto space-y-2 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
          <div
            v-for="item in formattedCacheInfo"
            :key="item.fileHash"
            class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
            <div class="flex-1 min-w-0">
              <div
                class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {{ item.fileName }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {{ formatBytes(item.downloadedBytes) }} /
                {{ formatBytes(item.fileSize) }}
                ({{ item.progress }}%)
              </div>
              <div class="text-xs text-gray-400 dark:text-gray-500">
                最后更新: {{ item.updatedAt }}
              </div>
            </div>
            <div class="ml-2 flex-shrink-0">
              <div
                class="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full bg-blue-500 transition-all duration-300"
                  :style="{ width: `${item.progress}%` }">
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作说明 -->
      <div class="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
        <div class="flex items-start space-x-2">
          <AlertTriangle
            class="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
          <div class="text-sm text-yellow-800 dark:text-yellow-200">
            <p class="font-medium mb-1">发现未完成的文件传输缓存</p>
            <p class="text-xs">
              这些缓存数据可能来自之前中断的文件传输。建议清理这些缓存以释放存储空间，
              或者保留它们以便在下次传输相同文件时实现断点续传。
            </p>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-between">
        <div class="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            :loading="isClearing"
            @click="handleCleanupExpired">
            清理过期缓存
          </Button>
        </div>
        <div class="flex space-x-2">
          <Button
            variant="outline"
            @click="handleKeepCache">
            保留缓存
          </Button>
          <Button
            variant="danger"
            :loading="isClearing"
            loading-text="清理中..."
            @click="handleClearAll">
            清理所有缓存
          </Button>
        </div>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle, HardDrive } from 'lucide-vue-next'
import Button from '@/components/Button/index.vue'
import Modal from '@/components/Modal/index.vue'
import { formatByte } from '@/utils'

defineOptions({ name: 'CacheDetectionModal' })

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

const props = defineProps<{
  cacheStats: CacheStats
  formattedCacheInfo: CacheItem[]
}>()

const emit = defineEmits<{
  (e: 'keepCache'): void
  (e: 'clearAll'): Promise<void>
  (e: 'cleanupExpired'): Promise<void>
}>()

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
  if (isClearing.value) return

  isClearing.value = true
  try {
    await emit('clearAll')
    show.value = false
  } catch (error) {
    console.error('清理缓存失败:', error)
  } finally {
    isClearing.value = false
  }
}

/**
 * 清理过期缓存
 */
async function handleCleanupExpired() {
  if (isClearing.value) return

  isClearing.value = true
  try {
    await emit('cleanupExpired')
    // 如果清理后没有缓存了，关闭模态框
    if (props.cacheStats.totalFiles === 0) {
      show.value = false
    }
  } catch (error) {
    console.error('清理过期缓存失败:', error)
  } finally {
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
