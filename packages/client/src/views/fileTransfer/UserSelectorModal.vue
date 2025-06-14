<template>
  <Modal
    v-model="show"
    class="UserSelectorModal-container"
    title="选择发送目标"
    height="60vh"
    variant="info"
  >
    <div class="size-full flex flex-col rounded-2xl">
      <!-- 头部信息 -->
      <div class="flex-shrink-0 pb-4 sm:px-4 sm:pb-3 sm:pt-4">
        <div class="flex items-center space-x-4 sm:space-x-3">
          <div
            class="size-12 flex flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:size-10 dark:bg-blue-900/30"
          >
            <Users class="h-6 w-6 text-blue-600 sm:h-5 sm:w-5 dark:text-blue-400" />
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="truncate text-lg text-gray-900 font-semibold sm:text-base dark:text-gray-100">
              选择发送目标
            </h3>
            <div class="truncate text-sm text-gray-500 sm:text-xs dark:text-gray-400">
              {{ contentType === 'files' ? `发送 ${contentCount} 个文件` : '发送文本内容' }}
            </div>
          </div>
        </div>

        <!-- 统计信息 -->
        <div
          class="mt-4 rounded-lg from-blue-50 to-emerald-50 bg-gradient-to-r p-3 dark:from-blue-900/20 dark:to-emerald-900/20 sm:p-2"
        >
          <div class="flex items-center justify-between text-sm sm:text-xs">
            <span class="text-gray-600 font-medium dark:text-gray-400">在线用户</span>
            <div class="flex items-center space-x-3 sm:space-x-2">
              <span class="text-blue-600 font-semibold dark:text-blue-400">
                {{ onlineUsers.length }} 人在线
              </span>
              <span class="text-gray-400">•</span>
              <span class="text-emerald-600 font-semibold dark:text-emerald-400">
                {{ selectedUsers.length }} 人已选
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 用户列表 -->
      <div class="flex-1 overflow-y-auto">
        <div class="space-y-2 sm:space-y-1.5">
          <div
            v-for="user in onlineUsers"
            :key="user.peerId"
            class="group flex cursor-pointer items-center rounded-xl bg-gray-50/50 p-3 transition-all duration-200 dark:bg-gray-700/30 hover:bg-gray-100/80 sm:p-2.5 hover:shadow-sm dark:hover:bg-gray-600/50"
            :class="{
              'bg-blue-100/80 dark:bg-blue-900/30 ring-2 ring-blue-200 dark:ring-blue-800': isUserSelected(user),
            }"
            @click="toggleUser(user)"
          >
            <!-- 选择状态指示器 -->
            <div class="mr-3 flex-shrink-0 sm:mr-2">
              <div
                class="h-6 w-6 flex items-center justify-center border-2 rounded-full transition-all sm:h-5 sm:w-5"
                :class="isUserSelected(user)
                  ? 'bg-blue-600 border-blue-600 dark:bg-blue-500 dark:border-blue-500'
                  : 'border-gray-300 dark:border-gray-600 group-hover:border-blue-400'"
              >
                <Check
                  v-if="isUserSelected(user)"
                  class="h-3 w-3 text-white sm:h-2.5 sm:w-2.5"
                />
              </div>
            </div>

            <!-- 用户设备图标 -->
            <div class="mr-3 h-10 w-10 flex-shrink-0 sm:mr-2 sm:h-8 sm:w-8">
              <div
                class="h-full w-full flex items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 transition-transform group-hover:scale-105 dark:bg-emerald-900/30 dark:text-emerald-400"
              >
                <component
                  :is="getDeviceIcon(user.name.type || user.name.os)"
                  class="h-5 w-5 sm:h-4 sm:w-4"
                />
              </div>
            </div>

            <!-- 用户信息 -->
            <div class="min-w-0 flex-1">
              <div
                class="truncate text-sm text-gray-900 font-medium transition-colors sm:text-xs dark:text-gray-100 group-hover:text-gray-700 dark:group-hover:text-gray-200"
                :title="user.name.displayName"
              >
                {{ user.name.displayName }}
              </div>
              <div
                class="mt-0.5 flex items-center text-xs text-gray-500 space-x-2 sm:text-[10px] dark:text-gray-400 sm:space-x-1"
              >
                <span class="font-medium">{{ user.name.type || user.name.os }}</span>
                <span class="text-gray-300 dark:text-gray-600">•</span>
                <span
                  class="rounded bg-emerald-100/60 px-1.5 py-0.5 text-[10px] text-emerald-700 font-medium dark:bg-emerald-900/60 sm:px-1 sm:text-[9px] dark:text-emerald-300"
                >
                  在线
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div
          v-if="onlineUsers.length === 0"
          class="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500"
        >
          <Users class="mb-3 h-12 w-12 opacity-50" />
          <p class="text-sm">
            暂无在线用户
          </p>
        </div>
      </div>
    </div>

    <!-- 底部操作区域 -->
    <template #footer>
      <div class="flex flex-shrink-0 gap-4">
        <Button
          design-style="ghost"
          variant="default"
          class="flex-1"
          size="md"
          @click="emit('cancel')"
        >
          <span class="font-medium">取消</span>
        </Button>

        <Button
          variant="primary"
          class="flex-1"
          size="md"
          :disabled="selectedUsers.length === 0"
          @click="handleConfirm"
        >
          <span class="font-medium">
            发送给 {{ selectedUsers.length }} 人
          </span>
        </Button>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import type { UserInfo } from 'web-share-common'
import { Check, Users } from 'lucide-vue-next'
import { ref } from 'vue'
import Button from '@/components/Button/index.vue'
import Modal from '@/components/Modal/index.vue'
import { getDeviceIcon } from './hooks/tools'

defineOptions({ name: 'UserSelectorModal' })
const props = withDefaults(
  defineProps<{
    onlineUsers: UserInfo[]
    contentType: 'files' | 'text'
    contentCount?: number
  }>(),
  {
    onlineUsers: () => [],
    contentType: 'files',
    contentCount: 0,
  },
)
const emit = defineEmits<{
  (e: 'confirm', users: UserInfo[]): void
  (e: 'cancel'): void
}>()
const show = defineModel<boolean>()
/** 选中的用户列表 */
const selectedUsers = ref<UserInfo[]>([])

/**
 * 切换用户选择状态
 */
function toggleUser(user: UserInfo) {
  const index = selectedUsers.value.findIndex(u => u.peerId === user.peerId)
  if (index > -1) {
    selectedUsers.value.splice(index, 1)
  }
  else {
    selectedUsers.value.push(user)
  }
}

/**
 * 检查用户是否被选中
 */
function isUserSelected(user: UserInfo): boolean {
  return selectedUsers.value.some(u => u.peerId === user.peerId)
}

/**
 * 确认发送
 */
function handleConfirm() {
  if (selectedUsers.value.length > 0) {
    emit('confirm', [...selectedUsers.value])
    selectedUsers.value = []
  }
}

/** 监听模态框关闭，重置选择状态 */
watch(show, (newValue) => {
  if (!newValue) {
    selectedUsers.value = []
  }
})
</script>

<style lang="scss" scoped></style>
