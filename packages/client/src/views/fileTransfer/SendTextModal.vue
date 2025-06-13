<template>
  <Modal class="TextModal-container" v-model="show">
    <div class="p-6 w-96 bg-white rounded-2xl shadow-2xl
                dark:bg-gray-800 dark:shadow-gray-900/50
                sm:w-[90vw] sm:max-w-sm sm:p-4">
      <h3 class="mb-4 font-semibold text-gray-900 dark:text-gray-100 sm:text-base sm:mb-3">
        发送文本给
        {{ toName }}
      </h3>
      <textarea v-model.trim="textModel"
        class="p-3 w-full h-32 rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500
               dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:focus:ring-emerald-400
               dark:placeholder-gray-400
               sm:h-24 sm:p-2 sm:text-sm"
        placeholder="输入要发送的文本...">
        </textarea>
      <div class="flex justify-end mt-4 space-x-4 sm:space-x-2 sm:flex-col-reverse sm:space-y-2 sm:space-y-reverse sm:space-x-0 sm:mt-3">
        <Button
          @click="emit('close')"
          design-style="ghost"
          variant="default"
          size="md"
          class="sm:w-full">
          取消
        </Button>
        <Button
          @click="emit('send')"
          variant="primary"
          size="md"
          class="sm:w-full">
          发送
        </Button>
      </div>
    </div>
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
