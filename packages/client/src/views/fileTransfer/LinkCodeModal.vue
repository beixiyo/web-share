<template>
  <Modal
    v-model="show"
    class="LinkCodeModal-container"
    title="连接码管理"
    height="auto">
    <div class="p-4 sm:p-3">
      <!-- 选项卡 -->
      <div
        class="flex mb-4 bg-gray-100 dark:bg-gray-700 rounded-lg p-1 gap-1">
        <Button
          @click="activeTab = 'generate'"
          :variant="activeTab === 'generate' ? 'primary' : 'default'"
          :design-style="activeTab === 'generate' ? 'flat' : 'ghost'"
          size="md"
          class="flex-1">
          生成连接码
        </Button>

        <Button
          @click="activeTab = 'input'"
          :variant="activeTab === 'input' ? 'primary' : 'default'"
          :design-style="activeTab === 'input' ? 'flat' : 'ghost'"
          size="md"
          class="flex-1">
          输入连接码
        </Button>
      </div>

      <!-- 生成连接码内容 -->
      <div v-if="activeTab === 'generate'" class="space-y-4">
        <div class="text-center">
          <div v-if="roomCode"
            class="text-6xl font-mono font-bold text-indigo-600 dark:text-indigo-400 mb-4 tracking-wider">
            {{ roomCode }}
          </div>
          <p v-else class="text-gray-500 dark:text-gray-400 mb-4">
            点击下方按钮生成连接码
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">
            {{ roomCode ? '请将此6位数字码告诉对方，让对方输入此码加入房间' : '生成一个6位数字连接码供他人加入' }}
          </p>
        </div>

        <div class="flex justify-center space-x-2">
          <Button
            v-if="!roomCode"
            @click="emit('generateCode')"
            variant="primary"
            size="md">
            生成连接码
          </Button>

          <Button
            v-else
            @click="copyRoomCode"
            variant="primary"
            size="md">
            复制连接码
          </Button>
        </div>
      </div>

      <!-- 输入连接码内容 -->
      <div v-if="activeTab === 'input'" class="space-y-4">
        <div>
          <label
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            请输入6位数字连接码
          </label>
          <input
            v-model="joinCode"
            type="text"
            maxlength="6"
            placeholder="例如: 123456"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm
                   focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                   dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400
                   sm:text-sm"
            @keyup.enter="handleJoinWithCode"
            @input="joinCode = joinCode.replace(/[^0-9]/g, '')" />
        </div>
        <div class="flex justify-end space-x-2">
          <Button
            @click="handleJoinWithCode"
            variant="primary"
            size="md"
            :disabled="joinCode.length !== 6">
            加入房间
          </Button>
        </div>
      </div>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { Message } from '@/utils'
import { copyToClipboard } from '@jl-org/tool'
import Modal from '@/components/Modal/index.vue'
import Button from '@/components/Button/index.vue'


defineOptions({ name: 'LinkCodeModal' })

const props = withDefaults(
  defineProps<{
    roomCode?: string
  }>(),
  {
    roomCode: '',
  }
)

const emit = defineEmits<{
  (e: 'joinWithCode', code: string): void
  (e: 'generateCode'): void
}>()

const show = defineModel<boolean>()
const joinCode = ref('')
const activeTab = ref<'generate' | 'input'>('generate')

// 处理输入连接码
const handleJoinWithCode = () => {
  if (joinCode.value.trim().length === 6) {
    emit('joinWithCode', joinCode.value.trim())
    show.value = false
    joinCode.value = ''
  }
}

// 复制房间码
const copyRoomCode = () => {
  if (!props.roomCode) return
  copyToClipboard(props.roomCode)
  Message.success('连接码已复制')
}

</script>

<style lang="scss" scoped></style>
