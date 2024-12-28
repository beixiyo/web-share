<template>
  <Teleport to="body">
    <Mask class="Modal-container" v-show="show">
      <Transition appear>
        <div class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50
          p-4 bg-white shadow-lg rounded-md"
          v-show="show"
          :style="modalStyle">

          <slot name="title">
            <h4 :style="titleStyle">{{ title }}</h4>
          </slot>

          <div class="content mt-4">
            <slot name="content">
              <p :style="contentStyle">{{ content }}</p>
            </slot>
          </div>

          <div
            class="footer flex justify-end items-center gap-3 absolute bottom-2 right-4">
            <slot name="footer">
              <button
                class="bg-gray-400 text-white py-1 px-2 rounded 
                hover:bg-gray-500 transition duration-200"
                @click="onClose">
                取消
              </Button>

              <button
                class="bg-blue-400 text-white py-1 px-2 rounded 
                hover:bg-blue-500 transition duration-200"
                @click="onConfirm">
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
import { useToggle } from '@/hooks'
import { defaultProps, type CompProps } from './compProps'
import Mask from '@/components/Mask.vue'


defineOptions({
  inheritAttrs: true,
  name: 'Modal'
})
const props = withDefaults(
  defineProps<CompProps>(),
  defaultProps
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
  fontWeight: props.titleWeight
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
  toggleShow()
}
function onConfirm() {
  emit('confirm')
  toggleShow()
}

function onEscape(e: KeyboardEvent) {
  if (e.code === 'Escape' && show.value) onClose()
}

</script>

<style lang="scss" scoped>
@include vue-transition('v', .4s) {
  transform: scale(0.1);
}
</style>
