<template>
  <Modal class="AcceptTextModal-container"
    v-model="show"
    title="接收文本"
    height="auto">
    <div class="p-4 sm:p-3">
      <div
        class="p-3 w-full h-40 rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500 overflow-y-auto
               bg-gray-50 dark:bg-gray-700/50
               dark:border-gray-600 dark:text-gray-200 dark:focus:ring-emerald-400
               sm:h-32 sm:text-sm">
        {{ props.text }}
      </div>
    </div>

    <template #footer>
      <div class="flex-shrink-0 flex gap-4">
        <Button
          @click="emit('close')"
          design-style="ghost"
          variant="default"
          class="flex-1"
          size="md">
          关闭
        </Button>
        <Button
          @click="emit('copy')"
          variant="primary"
          class="flex-1"
          size="md">
          复制
        </Button>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import Modal from '@/components/Modal/index.vue'
import Button from '@/components/Button/index.vue'

const show = defineModel<boolean>()

defineOptions({ name: 'AcceptTextModal' })
const props = withDefaults(
  defineProps<{
    text: string
  }>(),
  {
  }
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'copy'): void
}>()

</script>

<style lang="scss" scoped></style>
