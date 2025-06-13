<template>
  <Modal class="RoomCodeModal-container"
    v-model="show"
    height="auto"
    title="房间连接码">
    <div
      class="flex flex-col items-center p-4 sm:p-3">
      <div v-if="roomCode"
        class="text-center">
        <div class="text-6xl font-mono font-bold text-indigo-600 dark:text-indigo-400 mb-4 tracking-wider">
          {{ roomCode }}
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">
          请将此6位数字码告诉对方，让对方输入此码加入房间
        </p>
      </div>

      <p v-else-if="showRoomCodeModal"
        class="text-gray-500 dark:text-gray-400 sm:text-sm">
        正在生成连接码...
      </p>

      <Button
        @click="copyRoomCode"
        variant="primary"
        size="md"
        class="mt-2 sm:mt-1 sm:text-sm"
        :disabled="!roomCode">
        复制连接码
      </Button>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import Modal from '@/components/Modal/index.vue'
import Button from '@/components/Button/index.vue'
import { copyToClipboard } from '@jl-org/tool'
import { Message } from '@/utils'

defineOptions({ name: 'RoomCodeModal' })

const show = defineModel<boolean>()
const props = withDefaults(
  defineProps<{
    roomCode: string
    showRoomCodeModal: boolean
  }>(),
  {
  }
)

const copyRoomCode = () => {
  if (!props.roomCode) return
  copyToClipboard(props.roomCode)
  Message.success('连接码已复制')
}

</script>

<style lang="scss" scoped></style>
