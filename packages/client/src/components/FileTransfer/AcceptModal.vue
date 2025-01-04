<template>
  <Mask class="AcceptModal-container">
    <div class="p-6 w-96 bg-white rounded-2xl shadow-2xl">
      <div class="flex items-center mb-4 space-x-4">
        <div
          class="flex justify-center items-center size-10 bg-green-100 rounded-full">
          <svg xmlns="http://www.w3.org/2000/svg"
            class="text-green-600" fill="none" viewBox="0 0 23 23"
            stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round"
              stroke-width="2" d="M7.2 14 l4-4 m0 0l4 4m-4-4v12" />
          </svg>
        </div>
        <div>
          <h3 class="flex items-center">
            <span class="font-semibold">接收文件</span>
            <span class="text-gray-500 ml-2 w-48 truncate">{{ filename }}</span>
          </h3>
          <div>
            <span>共</span>
            <span class="font-semibold mx-1 text-indigo-600"> {{ total }}</span>
            <span>个文件</span>
          </div>
        </div>
      </div>

      <div class="mb-4" v-if="src">
        <img ref="previewImage" :src="src"
          class="w-full rounded-lg" alt="预览图" />
      </div>

      <div class="flex justify-end space-x-4">
        <button
          @click="emit('deny')"
          class="px-4 py-2 text-gray-600 transition-colors hover:text-gray-800">
          拒绝
        </button>

        <button @click="emit('accept')"
          class="px-4 py-2 text-white bg-indigo-600 rounded-lg transition-colors hover:bg-indigo-700">
          接收
        </button>
      </div>
    </div>
  </Mask>
</template>

<script setup lang="ts">
import Mask from '../Mask.vue'


defineOptions({ name: 'AcceptModal' })
const props = withDefaults(
  defineProps<{
    src: string
    filename: string
    total: number
  }>(),
  {
  }
)

const emit = defineEmits<{
  (e: 'accept'): void
  (e: 'deny'): void
}>()

</script>

<style lang="scss" scoped></style>
