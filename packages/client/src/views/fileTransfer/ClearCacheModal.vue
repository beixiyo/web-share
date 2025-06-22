<template>
  <Modal
    v-model="show"
    title="清理缓存"
    width="min(400px, 90vw)"
    height="auto"
  >
    <div class="p-1 space-y-4">
      <!-- 清理选项 -->
      <div class="space-y-3">
        <h3 class="text-sm text-gray-700 font-medium dark:text-gray-300">
          选择清理类型
        </h3>

        <div class="space-y-3">
          <label class="flex cursor-pointer items-start border border-gray-200 rounded-lg p-3 transition-colors space-x-3 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
            <input
              v-model="cleanupType"
              type="radio"
              value="expired"
              class="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600"
            >
            <div class="min-w-0 flex-1">
              <div class="text-sm text-gray-900 font-medium dark:text-gray-100">
                清理过期数据
              </div>
              <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                清理超过 7 天的断点续传缓存
              </div>
            </div>
          </label>

          <label class="flex cursor-pointer items-start border border-red-200 rounded-lg p-3 transition-colors space-x-3 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20">
            <input
              v-model="cleanupType"
              type="radio"
              value="all"
              class="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600"
            >
            <div class="min-w-0 flex-1">
              <div class="text-sm text-red-600 font-medium dark:text-red-400">
                清理所有数据
              </div>
              <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                清理所有断点续传缓存（不可恢复）
              </div>
            </div>
          </label>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex flex-col justify-end gap-2 sm:flex-row sm:gap-2">
        <Button
          variant="default"
          class="order-2 w-full sm:order-1 sm:w-auto"
          @click="show = false"
        >
          取消
        </Button>
        <Button
          variant="danger"
          class="order-1 w-full sm:order-2 sm:w-auto"
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
import Button from '@/components/Button/index.vue'
import Modal from '@/components/Modal/index.vue'

defineOptions({ name: 'ClearCacheModal' })

const emit = defineEmits<{
  (e: 'clear', type: 'all' | 'expired'): Promise<void>
}>()

const show = defineModel<boolean>()

/** 清理选项 */
const cleanupType = ref<'all' | 'expired'>('expired')

/** 状态 */
const isClearing = ref(false)

/**
 * 处理清理缓存
 */
async function handleClearCache() {
  if (isClearing.value)
    return

  isClearing.value = true

  try {
    await emit('clear', cleanupType.value)
    show.value = false
  }
  catch (error) {
    console.error('清理缓存失败:', error)
  }
  finally {
    isClearing.value = false
  }
}

/** 重置状态 */
watch(show, (newShow) => {
  if (newShow) {
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
