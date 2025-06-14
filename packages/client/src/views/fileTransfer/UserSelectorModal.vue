<template>
  <Modal
    class="UserSelectorModal-container"
    title="选择发送目标"
    height="60vh"
    variant="info"
    v-model="show">
    
    <div class="size-full rounded-2xl flex flex-col">
      <!-- 头部信息 -->
      <div class="flex-shrink-0 pb-4 sm:px-4 sm:pt-4 sm:pb-3">
        <div class="flex items-center space-x-4 sm:space-x-3">
          <div class="flex justify-center items-center size-12 bg-blue-100 rounded-full
                     dark:bg-blue-900/30 sm:size-10 flex-shrink-0">
            <Users class="w-6 h-6 text-blue-600 dark:text-blue-400 sm:w-5 sm:h-5" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-lg text-gray-900 dark:text-gray-100 sm:text-base truncate">
              选择发送目标
            </h3>
            <div class="text-sm text-gray-500 dark:text-gray-400 sm:text-xs truncate">
              {{ contentType === 'files' ? `发送 ${contentCount} 个文件` : '发送文本内容' }}
            </div>
          </div>
        </div>

        <!-- 统计信息 -->
        <div class="mt-4 bg-gradient-to-r from-blue-50 to-emerald-50 dark:from-blue-900/20 dark:to-emerald-900/20
                    rounded-lg p-3 sm:p-2">
          <div class="flex justify-between items-center text-sm sm:text-xs">
            <span class="text-gray-600 dark:text-gray-400 font-medium">在线用户</span>
            <div class="flex items-center space-x-3 sm:space-x-2">
              <span class="font-semibold text-blue-600 dark:text-blue-400">
                {{ onlineUsers.length }} 人在线
              </span>
              <span class="text-gray-400">•</span>
              <span class="font-semibold text-emerald-600 dark:text-emerald-400">
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
            @click="toggleUser(user)"
            class="group flex items-center p-3 bg-gray-50/50 rounded-xl hover:bg-gray-100/80
                   hover:shadow-sm transition-all duration-200 dark:bg-gray-700/30 dark:hover:bg-gray-600/50
                   cursor-pointer sm:p-2.5"
            :class="{
              'bg-blue-100/80 dark:bg-blue-900/30 ring-2 ring-blue-200 dark:ring-blue-800': isUserSelected(user)
            }">
            
            <!-- 选择状态指示器 -->
            <div class="flex-shrink-0 mr-3 sm:mr-2">
              <div class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all
                         sm:w-5 sm:h-5"
                   :class="isUserSelected(user) 
                     ? 'bg-blue-600 border-blue-600 dark:bg-blue-500 dark:border-blue-500' 
                     : 'border-gray-300 dark:border-gray-600 group-hover:border-blue-400'">
                <Check v-if="isUserSelected(user)" 
                       class="w-3 h-3 text-white sm:w-2.5 sm:h-2.5" />
              </div>
            </div>

            <!-- 用户设备图标 -->
            <div class="flex-shrink-0 w-10 h-10 mr-3 sm:w-8 sm:h-8 sm:mr-2">
              <div class="w-full h-full rounded-lg flex items-center justify-center transition-transform
                         group-hover:scale-105 bg-emerald-100 text-emerald-600 
                         dark:bg-emerald-900/30 dark:text-emerald-400">
                <component :is="getDeviceIcon(user.name.type || user.name.os)"
                          class="w-5 h-5 sm:w-4 sm:h-4" />
              </div>
            </div>

            <!-- 用户信息 -->
            <div class="flex-1 min-w-0">
              <div class="font-medium text-sm text-gray-900 truncate dark:text-gray-100 sm:text-xs
                         group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors"
                   :title="user.name.displayName">
                {{ user.name.displayName }}
              </div>
              <div class="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400
                         sm:text-[10px] sm:space-x-1 mt-0.5">
                <span class="font-medium">{{ user.name.type || user.name.os }}</span>
                <span class="text-gray-300 dark:text-gray-600">•</span>
                <span class="px-1.5 py-0.5 bg-emerald-100/60 dark:bg-emerald-900/60 rounded text-[10px]
                           font-medium sm:px-1 sm:text-[9px] text-emerald-700 dark:text-emerald-300">
                  在线
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="onlineUsers.length === 0"
             class="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
          <Users class="w-12 h-12 mb-3 opacity-50" />
          <p class="text-sm">暂无在线用户</p>
        </div>
      </div>
    </div>

    <!-- 底部操作区域 -->
    <template #footer>
      <div class="flex-shrink-0 flex gap-4">
        <Button
          @click="emit('cancel')"
          design-style="ghost"
          variant="default"
          class="flex-1"
          size="md">
          <span class="font-medium">取消</span>
        </Button>

        <Button
          @click="handleConfirm"
          variant="primary"
          class="flex-1"
          size="md"
          :disabled="selectedUsers.length === 0">
          <span class="font-medium">
            发送给 {{ selectedUsers.length }} 人
          </span>
        </Button>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { UserInfo } from 'web-share-common'
import { Users, Check } from 'lucide-vue-next'
import Modal from '@/components/Modal/index.vue'
import Button from '@/components/Button/index.vue'
import { getDeviceIcon } from './hooks/tools'

const show = defineModel<boolean>()
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
    contentCount: 0
  }
)

const emit = defineEmits<{
  (e: 'confirm', users: UserInfo[]): void
  (e: 'cancel'): void
}>()

// 选中的用户列表
const selectedUsers = ref<UserInfo[]>([])

/**
 * 切换用户选择状态
 */
function toggleUser(user: UserInfo) {
  const index = selectedUsers.value.findIndex(u => u.peerId === user.peerId)
  if (index > -1) {
    selectedUsers.value.splice(index, 1)
  } else {
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

// 监听模态框关闭，重置选择状态
watch(show, (newValue) => {
  if (!newValue) {
    selectedUsers.value = []
  }
})
</script>

<style lang="scss" scoped></style>
