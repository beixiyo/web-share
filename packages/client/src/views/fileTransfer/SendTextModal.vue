<template>
  <Modal
    v-model="show"
    class="TextModal-container"
    :title="`发送文本给 ${toName}`"
    height="auto"
  >
    <div class="p-4 sm:p-3">
      <textarea
        v-model.trim="textModel"
        class="h-32 w-full border rounded-lg bg-gray-50 p-3 sm:h-24 dark:border-gray-600 dark:bg-gray-700/50 sm:p-2 sm:text-sm dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 dark:placeholder-gray-400"
        placeholder="输入要发送的文本..."
      />
    </div>

    <template #footer>
      <div class="flex flex-shrink-0 gap-4">
        <Button
          design-style="ghost"
          variant="default"
          size="md"
          class="flex-1"
          @click="emit('close')"
        >
          取消
        </Button>
        <Button
          variant="primary"
          size="md"
          class="flex-1"
          @click="emit('send')"
        >
          发送
        </Button>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import Button from '@/components/Button/index.vue'
import Modal from '@/components/Modal/index.vue'

defineOptions({ name: 'SendTextModal' })

const props = withDefaults(
  defineProps<{
    toName: string
  }>(),
  {
  },
)
const emit = defineEmits<{
  (e: 'send'): void
  (e: 'close'): void
}>()
const show = defineModel<boolean>({ default: false, required: true })
const textModel = defineModel<string>('text', { default: '' })
</script>

<style lang="scss" scoped></style>
