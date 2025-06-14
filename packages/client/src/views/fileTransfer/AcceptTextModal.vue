<template>
  <Modal
    v-model="show"
    class="AcceptTextModal-container"
    title="接收文本"
    height="auto"
  >
    <div class="p-4 sm:p-3">
      <div
        class="h-40 w-full overflow-y-auto border rounded-lg bg-gray-50 p-3 sm:h-32 dark:border-gray-600 dark:bg-gray-700/50 sm:text-sm dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400"
      >
        {{ props.text }}
      </div>
    </div>

    <template #footer>
      <div class="flex flex-shrink-0 gap-4">
        <Button
          design-style="ghost"
          variant="default"
          class="flex-1"
          size="md"
          @click="emit('close')"
        >
          关闭
        </Button>
        <Button
          variant="primary"
          class="flex-1"
          size="md"
          @click="emit('copy')"
        >
          复制
        </Button>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import Button from '@/components/Button/index.vue'
import Modal from '@/components/Modal/index.vue'

defineOptions({ name: 'AcceptTextModal' })

const props = withDefaults(
  defineProps<{
    text: string
  }>(),
  {
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'copy'): void
}>()

const show = defineModel<boolean>()
</script>

<style lang="scss" scoped></style>
