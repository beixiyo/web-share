<template>
  <Mask
    v-show="show"
    class="Loading-container"
    :style="{
      zIndex,
      background: bgc,
    }"
  >
    <div class="flex flex-col items-center space-y-4">
      <LoadingIcon :size="size" />
      <div
        v-if="displayText"
        class="px-4 text-center text-sm text-gray-900 font-medium dark:text-gray-300"
      >
        {{ displayText }}
      </div>
    </div>
  </Mask>
</template>

<script setup lang="ts">
/* eslint-disable vue/prop-name-casing */
import type { BaseType } from '@jl-org/tool'
import type { LoadingProps } from './types'
import Mask from '../Mask.vue'
import LoadingIcon from './LoadingIcon.vue'
import { defaultLoadingProps } from './types'

defineOptions({
  name: 'Loading',
})
const props = withDefaults(
  defineProps<{
    /** 正常调用给的值 */
    loading?: boolean
    /** 指令调用给的值 */
    __loading?: boolean
    /** 指令传递的加载文本 */
    __loadingText?: string
    zIndex?: BaseType
    bgc?: string
  } & LoadingProps>(),
  {
    ...defaultLoadingProps,
    loading: undefined,
    __loading: undefined,
    __loadingText: undefined,
    zIndex: 99,
    bgc: '#0005',
    size: 'lg',
  },
)

let show: Ref<boolean>

/** 计算显示的文本 */
const displayText = computed(() => {
  /** 优先使用指令传递的文本，然后是组件属性，最后是默认值 */
  return props.__loadingText || props.loadingText || defaultLoadingProps.loadingText
})

/** 初始化入口 */
init()
function init() {
  if (props.loading !== undefined) {
    show = ref(props.loading)
    return
  }

  if (props.__loading !== undefined) {
    show = ref(props.__loading)
  }
}

/** 只让指令调用 */
function update(value: boolean) {
  if (props.__loading === undefined)
    return
  show.value = value
}

defineExpose({
  update,
})
</script>

<style lang="scss" scoped></style>
