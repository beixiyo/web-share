<template>
  <Teleport to="body">
    <Mask v-show="show" class="Modal-container">
      <Transition appear name="modal">
        <div
          v-show="show"
          class="fixed left-1/2 top-1/2 z-50 origin-center rounded-md bg-white p-4 shadow-lg -translate-x-1/2 -translate-y-1/2"
          :style="modalStyle"
        >
          <slot name="title">
            <h4 :style="titleStyle">
              {{ title }}
            </h4>
          </slot>

          <div class="content mt-4">
            <slot name="content">
              <p :style="contentStyle">
                {{ content }}
              </p>
            </slot>
          </div>

          <div
            class="footer absolute bottom-2 right-4 flex items-center justify-end gap-3"
          >
            <slot name="footer">
              <button
                class="rounded bg-gray-400 px-2 py-1 text-white transition duration-200 hover:bg-gray-500"
                @click="onClose"
              >
                取消
              </Button>

              <button
                class="rounded bg-blue-400 px-2 py-1 text-white transition duration-200 hover:bg-blue-500"
                @click="onConfirm"
              >
                确认
              </button>
            </slot>
          </div>
        </div>
      </Transition>
    </Mask>
  </Teleport>
</template>

<script setup lang="ts">
import type { CompProps } from './compProps'
import Mask from '@/components/Mask.vue'
import { useToggle } from '@/hooks'
import { defaultProps } from './compProps'

defineOptions({
  name: 'Modal',
  inheritAttrs: true,
})
const props = withDefaults(
  defineProps<CompProps>(),
  defaultProps,
)
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm'): void
}>()

const modalStyle = computed(() => ({
  minWidth: props.width,
  minHeight: props.height,
}))

const titleStyle = computed(() => ({
  color: props.titleColor,
  fontSize: props.titleSize,
  fontWeight: props.titleWeight,
}))

const contentStyle = computed(() => ({
  color: props.color,
  fontSize: props.fontSize,
}))

const [show, toggleShow] = useToggle(true)

onMounted(() => {
  window.addEventListener('keydown', onEscape)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape)
})

/** =========================== 事件 ================================ */

function onClose() {
  emit('close')
  toggleShow(false)
}
function onConfirm() {
  emit('confirm')
  toggleShow(true)
}

function onEscape(e: KeyboardEvent) {
  if (e.code === 'Escape' && show.value)
    onClose()
}

defineExpose({
  close: onClose,
  confirm: onConfirm,
  DURATION: 400,
})
</script>

<style lang="scss" scoped>
@include vue-transition('modal', .4s) {
  transform: scale(0.1);
}
</style>
