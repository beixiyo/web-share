<template>
  <Modal class="AcceptTextModal-container" v-model="show">
    <div class="p-6 w-96 bg-white rounded-2xl shadow-2xl
                dark:bg-gray-800 dark:shadow-gray-900/50
                sm:w-[90vw] sm:max-w-sm sm:p-4">
      <h3 class="mb-4 font-semibold text-gray-900 dark:text-gray-100 sm:text-base sm:mb-3">
        接收文本
      </h3>

      <div
        class="p-2 w-full h-40 rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500 overflow-y-auto
               dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:focus:ring-indigo-400
               sm:h-32 sm:text-sm">
        {{ props.text }}
      </div>

      <div class="flex justify-end mt-4 space-x-4 sm:space-x-2 sm:flex-col-reverse sm:space-y-2 sm:space-y-reverse sm:space-x-0 sm:mt-3">
        <Button
          @click="emit('copy')"
          variant="primary"
          size="md"
          class="sm:w-full">
          复制
        </Button>

        <Button
          @click="emit('close')"
          design-style="ghost"
          variant="default"
          size="md"
          class="sm:w-full">
          关闭
        </Button>
      </div>
    </div>
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
