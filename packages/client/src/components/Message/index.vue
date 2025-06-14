<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-in"
    leave-active-class="transition-all duration-300 ease-out"
    enter-from-class="transform translate-x-[-40%] translate-y-[-20px] opacity-0"
    leave-to-class="transform translate-x-[-40%] translate-y-[-20px] opacity-0"
  >
    <div
      v-show="show"
      class="fixed left-1/2 top-3 z-[99] max-w-[calc(100vw-2rem)] max-w-sm min-h-[40px] flex transform select-none items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 shadow-lg transition-all duration-300 ease-in-out sm:top-4 md:max-w-lg sm:max-w-md -translate-x-1/2 sm:gap-3 dark:border-gray-700 sm:px-4"
      :class="[
        currentVariant.bg,
        currentVariant.accent,
      ]"
    >
      <div
        class="h-5 w-5 flex flex-shrink-0 items-center justify-center rounded-full sm:h-6 sm:w-6"
        :class="[
          currentVariant.iconBg,
        ]"
      >
        <component
          :is="currentVariant.icon"
          ref="refIcon"
          class="h-3 w-3 sm:h-4 sm:w-4" :class="[
            currentVariant.accent,
            type === 'loading' && 'animate-spin',
            type === 'error' && 'animate-shake',
          ]"
        />
      </div>
      <span
        class="min-w-0 flex-1 break-words text-sm font-medium leading-tight hyphens-auto sm:text-base"
        :class="[
          type === 'error' && 'animate-shake',
        ]"
      >{{ content }}</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import type { MessageVariant } from './type'
import { useToggle } from '@/hooks'
import { MESSAGE_DURATION, variantStyles } from './constants'

defineOptions({ name: 'Message' })

const props = withDefaults(
  defineProps<{
    content?: string
    type?: MessageVariant
  }>(),
  {
    content: 'This is default content',
    type: 'info',
  },
)

/** 根据类型获取对应的样式变体 */
const currentVariant = computed(() => {
  return variantStyles[props.type] || variantStyles.info
})

const [show, toggleShow] = useToggle(false)
const refIcon = ref<HTMLElement>()

function setVisible(val: boolean) {
  toggleShow(val)

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(val)
    }, MESSAGE_DURATION)
  })
}

defineExpose({
  setVisible,
})
</script>
