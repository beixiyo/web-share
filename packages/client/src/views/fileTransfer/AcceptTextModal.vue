<template>
  <Mask class="AcceptTextModal-container">
    <div class="p-6 w-96 bg-white rounded-2xl shadow-2xl">
      <h3 class="mb-4 font-semibold text-gray-900">
        接收文本
      </h3>

      <div
        class="p-2 w-full h-40 rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500 overflow-y-auto">
        {{ props.text }}
      </div>

      <div class="flex justify-end mt-4 space-x-4">
        <button @click="emit('copy')"
          class="px-4 py-2 text-gray-600 transition-colors hover:text-gray-800">
          复制
        </button>

        <button @click="emit('close')"
          class="px-4 py-2 text-gray-600 transition-colors hover:text-gray-800">
          拒绝
        </button>
      </div>
    </div>
  </Mask>
</template>

<script setup lang="ts">
import Mask from '@/components/Mask.vue'


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
