<template>
  <Modal
    v-model="show"
    class="LinkCodeModal-container"
    title="连接码管理"
    height="auto"
  >
    <div class="p-4 sm:p-3">
      <!-- 选项卡 -->
      <div
        class="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-700"
      >
        <Button
          :variant="activeTab === 'generate' ? 'primary' : 'default'"
          :design-style="activeTab === 'generate' ? 'flat' : 'ghost'"
          size="md"
          class="flex-1"
          @click="activeTab = 'generate'"
        >
          生成连接码
        </Button>

        <Button
          :variant="activeTab === 'input' ? 'primary' : 'default'"
          :design-style="activeTab === 'input' ? 'flat' : 'ghost'"
          size="md"
          class="flex-1"
          @click="activeTab = 'input'"
        >
          输入连接码
        </Button>
      </div>

      <!-- 生成连接码内容 -->
      <div v-if="activeTab === 'generate'" class="space-y-4">
        <div class="text-center">
          <div
            v-if="roomCode"
            class="mb-4 text-6xl text-emerald-600 font-bold tracking-wider font-mono dark:text-emerald-400"
          >
            {{ roomCode }}
          </div>
          <p v-else class="mb-4 text-gray-500 dark:text-gray-400">
            点击下方按钮生成连接码
          </p>
          <p class="mb-4 text-sm text-gray-600 dark:text-gray-300">
            {{ roomCode ? '请将此6位数字码告诉对方，让对方输入此码加入房间' : '生成一个6位数字连接码供他人加入' }}
          </p>
        </div>

        <div class="flex justify-center space-x-2">
          <Button
            v-if="!roomCode"
            variant="primary"
            size="md"
            @click.stop="emit('generateCode')"
          >
            生成连接码
          </Button>

          <Button
            v-else
            variant="primary"
            size="md"
            @click="copyRoomCode"
          >
            复制连接码
          </Button>
        </div>
      </div>

      <!-- 输入连接码内容 -->
      <div v-if="activeTab === 'input'" class="space-y-4">
        <div>
          <label
            class="mb-2 block text-sm text-gray-700 font-medium dark:text-gray-300"
          >
            请输入6位数字连接码
          </label>
          <input
            v-model="joinCode"
            type="text"
            maxlength="6"
            placeholder="例如: 123456"
            class="w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm dark:border-gray-600 focus:border-emerald-500 dark:bg-gray-700 sm:text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:placeholder-gray-400"
            @keyup.enter="handleJoinWithCode"
            @input="joinCode = joinCode.replace(/[^0-9]/g, '')"
          >
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end space-x-2">
        <Button
          v-if="activeTab === 'input'"
          variant="primary"
          size="md"
          :disabled="joinCode.length !== 6"
          @click="handleJoinWithCode"
        >
          加入房间
        </Button>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { copyToClipboard } from '@jl-org/tool'
import Button from '@/components/Button/index.vue'
import Modal from '@/components/Modal/index.vue'
import { Message } from '@/utils'

defineOptions({ name: 'LinkCodeModal' })

const props = withDefaults(
  defineProps<{
    roomCode?: string
  }>(),
  {
    roomCode: '',
  },
)

const emit = defineEmits<{
  (e: 'joinWithCode', code: string): void
  (e: 'generateCode'): void
}>()

const show = defineModel<boolean>()
const joinCode = ref('')
const activeTab = ref<'generate' | 'input'>('generate')

/** 处理输入连接码 */
function handleJoinWithCode() {
  if (joinCode.value.trim().length === 6) {
    emit('joinWithCode', joinCode.value.trim())
    show.value = false
    joinCode.value = ''
  }
}

/** 复制房间码 */
function copyRoomCode() {
  if (!props.roomCode)
    return
  copyToClipboard(props.roomCode)
  Message.success('连接码已复制')
}


</script>

<style lang="scss" scoped></style>
