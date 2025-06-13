<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-in"
    leave-active-class="transition-all duration-300 ease-out"
    enter-from-class="transform translate-x-[-40%] translate-y-[-20px] opacity-0"
    leave-to-class="transform translate-x-[-40%] translate-y-[-20px] opacity-0"
  >
    <div
      v-show="show"
      class="fixed left-1/2 top-4 z-[99] min-h-[40px] flex transform select-none items-center justify-center gap-3 border border-gray-200 rounded-lg px-4 py-2 text-center shadow-lg transition-all duration-300 ease-in-out -translate-x-1/2 dark:border-gray-700"
      :class="[
        currentVariant.bg,
        currentVariant.accent,
      ]"
    >
      <div
        class="h-6 w-6 flex items-center justify-center rounded-full"
        :class="[
          currentVariant.iconBg,
        ]"
      >
        <component
          :is="currentVariant.icon"
          ref="refIcon"
          class="h-4 w-4" :class="[
            currentVariant.accent,
            type === 'loading' && 'animate-spin',
            type === 'error' && 'animate-shake',
          ]"
        />
      </div>
      <span
        class="font-medium" :class="[
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
