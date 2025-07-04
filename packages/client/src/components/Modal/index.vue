<template>
  <Teleport to="body">
    <Mask v-show="show" class="Modal-container" :style="{ zIndex }">
      <div
        v-if="maskClosable" class="absolute inset-0 z-[-1]"
        @click="onClose"
      />

      <Transition
        appear
        enter-active-class="transition duration-300"
        enter-from-class="opacity-0 scale-50"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-300"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-50"
      >
        <div
          v-show="show"
          class="rounded-xl bg-white shadow-black/10 shadow-xl dark:text-slate-200"
          :class="[variantStyles[variant].bg]"
          :style="modalStyle"
        >
          <div class="h-full max-h-[85vh] flex flex-col gap-4 p-4 sm:max-h-[90vh] sm:gap-6 sm:p-6">
            <!-- 头部 -->
            <slot name="header">
              <div
                class="flex items-start justify-between rounded-t"
                :style="headerStyle"
              >
                <div class="flex items-center gap-2 sm:gap-3">
                  <div
                    class="rounded-lg p-1 sm:p-1.5"
                    :class="[variantStyles[variant].iconBg]"
                  >
                    <component
                      :is="variantStyles[variant].icon"
                      class="h-3.5 w-3.5 sm:h-4 sm:w-4"
                      :class="[variantStyles[variant].accent]"
                    />
                  </div>
                  <h2 class="text-base sm:text-lg">
                    {{ title }}
                  </h2>
                </div>
              </div>
            </slot>

            <!-- 内容区域 -->
            <div
              class="flex-1 overflow-y-auto"
              :style="bodyStyle"
            >
              <slot>
                <p>{{ content }}</p>
              </slot>
            </div>

            <!-- 底部 -->
            <slot name="footer">
              <div
                class="mt-auto flex items-center justify-end gap-2 sm:gap-4"
                :style="footerStyle"
              >
                <Button
                  @click="onClose"
                >
                  {{ cancelText }}
                </Button>

                <Button
                  variant="primary"
                  @click="onConfirm"
                >
                  {{ okText }}
                </Button>
              </div>
            </slot>
          </div>
        </div>
      </Transition>
    </Mask>
  </Teleport>
</template>

<script setup lang="ts">
import type { CompProps } from './types'
import { handleCssUnit } from '@jl-org/tool'
import Button from '@/components/Button/index.vue'
import Mask from '@/components/Mask.vue'
import { variantStyles } from './constants'
import { defaultProps } from './types'

defineOptions({ name: 'Modal' })

const props = withDefaults(
  defineProps<CompProps>(),
  {
    ...defaultProps,
  },
)
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm'): void
}>()

const show = defineModel<boolean>({ default: false })

const modalStyle = computed(() => ({
  width: handleCssUnit(props.width),
  height: handleCssUnit(props.height),
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
  duration: 300,
})
</script>
