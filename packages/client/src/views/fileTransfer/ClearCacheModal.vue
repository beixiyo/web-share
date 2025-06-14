<template>
  <Modal
    v-model="show"
    title="清理缓存"
    width="500"
    height="400"
  >
    <div class="space-y-4">
      <!-- 清理选项 -->
      <div class="space-y-3">
        <h3 class="text-sm text-gray-700 font-medium dark:text-gray-300">
          选择清理类型
        </h3>

        <div class="space-y-2">
          <label class="flex cursor-pointer items-center space-x-3">
            <input
              v-model="cleanupType"
              type="radio"
              value="expired"
              class="h-4 w-4 text-blue-600"
            >
            <div class="flex-1">
              <div class="text-sm text-gray-900 font-medium dark:text-gray-100">
                清理过期数据
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                清理超过 {{ expireDays }} 天的传输记录和文件缓存
              </div>
            </div>
          </label>

          <label class="flex cursor-pointer items-center space-x-3">
            <input
              v-model="cleanupType"
              type="radio"
              value="failed"
              class="h-4 w-4 text-blue-600"
            >
            <div class="flex-1">
              <div class="text-sm text-gray-900 font-medium dark:text-gray-100">
                清理失败数据
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                只清理传输失败或已取消的记录
              </div>
            </div>
          </label>

          <label class="flex cursor-pointer items-center space-x-3">
            <input
              v-model="cleanupType"
              type="radio"
              value="completed"
              class="h-4 w-4 text-blue-600"
            >
            <div class="flex-1">
              <div class="text-sm text-gray-900 font-medium dark:text-gray-100">
                清理已完成数据
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                清理已成功完成的传输记录
              </div>
            </div>
          </label>

          <label class="flex cursor-pointer items-center space-x-3">
            <input
              v-model="cleanupType"
              type="radio"
              value="all"
              class="h-4 w-4 text-red-600"
            >
            <div class="flex-1">
              <div class="text-sm text-red-600 font-medium dark:text-red-400">
                清理所有数据
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                清理所有传输记录和文件缓存（不可恢复）
              </div>
            </div>
          </label>
        </div>
      </div>

      <!-- 过期天数设置 -->
      <div v-if="cleanupType === 'expired'" class="space-y-2">
        <label class="text-sm text-gray-700 font-medium dark:text-gray-300">
          过期天数
        </label>
        <input
          v-model.number="expireDays"
          type="number"
          min="1"
          max="365"
          class="w-full border border-gray-300 rounded-md px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
      </div>

      <!-- 清理选项 -->
      <div class="space-y-2">
        <h3 class="text-sm text-gray-700 font-medium dark:text-gray-300">
          清理内容
        </h3>

        <div class="space-y-2">
          <label class="flex cursor-pointer items-center space-x-2">
            <input
              v-model="includeFileData"
              type="checkbox"
              class="h-4 w-4 text-blue-600"
            >
            <span class="text-sm text-gray-700 dark:text-gray-300">
              清理文件缓存数据
            </span>
          </label>

          <label class="flex cursor-pointer items-center space-x-2">
            <input
              v-model="includeTransferRecords"
              type="checkbox"
              class="h-4 w-4 text-blue-600"
            >
            <span class="text-sm text-gray-700 dark:text-gray-300">
              清理传输记录
            </span>
          </label>
        </div>
      </div>

      <!-- 清理结果 -->
      <div
        v-if="cleanupResult"
        class="rounded-md bg-green-50 p-3 dark:bg-green-900/20"
      >
        <div class="text-sm text-green-800 dark:text-green-200">
          <div class="mb-1 font-medium">
            清理完成
          </div>
          <div class="text-xs space-y-1">
            <div>清理会话: {{ cleanupResult.cleanedSessions }} 个</div>
            <div>清理文件: {{ cleanupResult.cleanedFiles }} 个</div>
            <div>释放空间: {{ formatBytes(cleanupResult.freedBytes) }}</div>
            <div>耗时: {{ cleanupResult.duration }}ms</div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end space-x-2">
        <Button
          variant="default"
          @click="show = false"
        >
          取消
        </Button>
        <Button
          variant="danger"
          :loading="isClearing"
          loading-text="清理中..."
          @click="handleClearCache"
        >
          {{ cleanupType === 'all' ? '清理所有数据' : '开始清理' }}
        </Button>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import type { CleanupResult } from '@/utils/handleOfflineFile'
import Button from '@/components/Button/index.vue'
import Modal from '@/components/Modal/index.vue'
import { formatByte } from '@/utils'

defineOptions({ name: 'ClearCacheModal' })

const emit = defineEmits<{
  (e: 'clear', options: {
    type: 'all' | 'expired' | 'failed' | 'completed'
    expireDays?: number
    includeFileData: boolean
    includeTransferRecords: boolean
  }): Promise<CleanupResult>
}>()

const show = defineModel<boolean>()

/** 清理选项 */
const cleanupType = ref<'all' | 'expired' | 'failed' | 'completed'>('expired')
const expireDays = ref(7)
const includeFileData = ref(true)
const includeTransferRecords = ref(true)

/** 状态 */
const isClearing = ref(false)
const cleanupResult = ref<CleanupResult | null>(null)

/**
 * 处理清理缓存
 */
async function handleClearCache() {
  if (isClearing.value)
    return

  isClearing.value = true
  cleanupResult.value = null

  try {
    const options = {
      type: cleanupType.value,
      expireDays: cleanupType.value === 'expired'
        ? expireDays.value
        : undefined,
      includeFileData: includeFileData.value,
      includeTransferRecords: includeTransferRecords.value,
    }

    const result = await emit('clear', options)
    cleanupResult.value = result

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
 * 格式化字节数
 */
function formatBytes(bytes: number): string {
  return formatByte(bytes)
}

/** 重置状态 */
watch(show, (newShow) => {
  if (newShow) {
    cleanupResult.value = null
    isClearing.value = false
  }
})
</script>

<style scoped>
/* 自定义样式 */
input[type="radio"]:checked {
  background-color: currentColor;
}

input[type="checkbox"]:checked {
  background-color: currentColor;
}
</style>
