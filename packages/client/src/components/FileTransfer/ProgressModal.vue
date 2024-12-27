<template>
  <Mask class="ProgressModal-container">
    <div class="p-6 w-96 bg-white rounded-2xl shadow-2xl">
      <div class="flex items-center mb-4 space-x-4">
        <div
          class="flex justify-center items-center w-12 h-12 bg-indigo-100 rounded-full">
          <svg xmlns="http://www.w3.org/2000/svg"
            class="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24"
            stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round"
              stroke-width="2"
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>

        <div>
          <h3 class="font-semibold text-gray-900 flex items-center">
            <span>正在传输</span>
            <span class="text-gray-500 ml-1 w-40 truncate">{{ progress.filename }}</span>

            <span class="text-indigo-600 font-bold ml-2">
              {{ progress.curIndex }}
            </span>
            <span>/</span>
            <span>{{ progress.total }}</span>
          </h3>
        </div>
      </div>

      <div class="relative">
        <div
          class="flex overflow-hidden mb-4 h-2 text-xs bg-indigo-200 rounded">
          <div
            :style="{
              width: '100%',
              transform: `scaleX(${progress.progress})`,
              transformOrigin: 'left center'
            }"
            class="flex flex-col justify-center text-center text-white whitespace-nowrap bg-indigo-500 shadow-none transition-all duration-300">
          </div>
        </div>

        <div class="text-sm text-right text-gray-500">
          {{ progress.progress * 100 }}%
        </div>
      </div>
    </div>
  </Mask>
</template>

<script setup lang="ts">
import type { ProgressData } from 'web-share-common'
import Mask from '../Mask.vue'

defineOptions({ name: 'ProgressModal' })
const props = withDefaults(
  defineProps<{
    progress: ProgressData
  }>(),
  {
  }
)

</script>

<style lang="scss" scoped></style>
