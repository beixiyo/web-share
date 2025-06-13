<template>
  <Modal class="TextModal-container" v-model="show">
    <div class="p-6 w-96 bg-white rounded-2xl shadow-2xl">
      <h3 class="mb-4 font-semibold text-gray-900">
        发送文本给
        {{ toName }}
      </h3>
      <textarea v-model.trim="textModel"
        class="p-3 w-full h-32 rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500"
        placeholder="输入要发送的文本...">
        </textarea>
      <div class="flex justify-end mt-4 space-x-4">
        <button @click="emit('close')"
          class="px-4 py-2 text-gray-600 transition-colors hover:text-gray-800">
          取消
        </button>
        <button @click="emit('send')"
          class="px-4 py-2 text-white bg-indigo-600 rounded-lg transition-colors hover:bg-indigo-700">
          发送
        </button>
      </div>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import Modal from '@/components/Modal/index.vue'

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
