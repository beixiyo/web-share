<template>
  <Modal class="TextModal-container"
    v-model="show"
    :title="`发送文本给 ${toName}`"
    height="auto">
    <div class="p-4 sm:p-3">
      <textarea v-model.trim="textModel"
        class="p-3 w-full h-32 rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500
               bg-gray-50 dark:bg-gray-700/50
               dark:border-gray-600 dark:text-gray-200 dark:focus:ring-emerald-400
               dark:placeholder-gray-400
               sm:h-24 sm:p-2 sm:text-sm"
        placeholder="输入要发送的文本...">
      </textarea>
    </div>

    <template #footer>
      <div class="flex-shrink-0 flex gap-4">
        <Button
          @click="emit('close')"
          design-style="ghost"
          variant="default"
          size="md"
          class="flex-1">
          取消
        </Button>
        <Button
          @click="emit('send')"
          variant="primary"
          size="md"
          class="flex-1">
          发送
        </Button>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import Modal from '@/components/Modal/index.vue'
import Button from '@/components/Button/index.vue'

defineOptions({ name: 'SendTextModal' })

const show = defineModel<boolean>({ default: false, required: true })
const textModel = defineModel<string>('text', { default: '' })

const props = withDefaults(
  defineProps<{
    toName: string
  }>(),
  {
  }
)

const emit = defineEmits<{
  (e: 'send'): void
  (e: 'close'): void
}>()


</script>

<style lang="scss" scoped></style>
