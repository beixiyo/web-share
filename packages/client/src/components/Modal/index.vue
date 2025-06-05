<template>
  <Teleport to="body">
    <Mask v-show="show" class="Modal-container" :style="{ zIndex }">
      <Transition
        appear
        enter-active-class="transition duration-300"
        enter-from-class="opacity-0 scale-50"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-300"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-50">
        <div
          v-show="show"
          class="rounded-xl shadow-xl shadow-black/10 bg-white"
          :class="[variantStyles[variant].bg]"
          :style="modalStyle">
          <div class="h-full max-h-[90vh] flex flex-col gap-6 p-6">
            <!-- 头部 -->
            <slot name="header">
              <div
                class="flex items-start justify-between rounded-t"
                :style="headerStyle">
                <div class="flex items-center gap-3">
                  <div
                    :class="['rounded-lg p-1.5', variantStyles[variant].iconBg]">
                    <component
                      :is="variantStyles[variant].icon"
                      :class="['h-4 w-4', variantStyles[variant].accent]" />
                  </div>
                  <h2 class="text-lg">{{ title }}</h2>
                </div>
              </div>
            </slot>

            <!-- 内容区域 -->
            <div
              class="flex-1 overflow-y-auto"
              :style="bodyStyle">
              <slot>
                <p>{{ content }}</p>
              </slot>
            </div>

            <!-- 底部 -->
            <slot name="footer">
              <div
                class="mt-auto flex items-center justify-end gap-4"
                :style="footerStyle">
                <button
                  class="rounded bg-gray-400 px-2 py-1 text-white transition duration-200 hover:bg-gray-500"
                  @click="onClose">
                  {{ cancelText }}
                </button>

                <button
                  class="rounded bg-blue-400 px-2 py-1 text-white transition duration-200 hover:bg-blue-500"
                  @click="onConfirm">
                  {{ okText }}
                </button>
              </div>
            </slot>
          </div>
        </div>
      </Transition>
    </Mask>
  </Teleport>
</template>

<script setup lang="ts">
import { defaultProps, type CompProps } from './types'
import Mask from '@/components/Mask.vue'
import { variantStyles } from './constants'

defineOptions({ name: 'Modal' })

const props = withDefaults(
  defineProps<CompProps>(),
  {
    ...defaultProps,
  },
)
const show = defineModel<boolean>({ default: false })

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm'): void
}>()

const modalStyle = computed(() => ({
  width: props.width ? `${props.width}px` : undefined,
  height: props.height ? `${props.height}px` : undefined,
}))

/** =========================== 事件 ================================ */

function onClose() {
  emit('close')
  show.value = false
}

function onConfirm() {
  emit('confirm')
  show.value = false
}

function onEscape(e: KeyboardEvent) {
  if (e.code === 'Escape' && show.value)
    onClose()
}

onMounted(() => {
  window.addEventListener('keydown', onEscape)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape)
})

defineExpose({
  close: onClose,
  confirm: onConfirm,
  duration: 300
})
</script>