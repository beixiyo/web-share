<template>
  <div class="Loading-container"
    v-show="show">
    <LoadingIcon :size="size" />
  </div>
</template>

<script setup lang="ts">
import { type BaseType } from '@jl-org/tool'
import LoadingIcon from './LoadingIcon.vue'
import { defaultLoadingProps, type LoadingProps } from './types'


defineOptions({
  name: 'Loading'
})
const props = withDefaults(
  defineProps<{
    /** 正常调用给的值 */
    loading?: boolean
    /** 指令调用给的值 */
    __loading?: boolean
    zIndex?: BaseType
    bgc?: string
  } & LoadingProps>(),
  {
    ...defaultLoadingProps,
    zIndex: 999,
    bgc: '#0005',
  }
)

let show: Ref<boolean>


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
  if (props.__loading === undefined) return
  show.value = value
}

defineExpose({
  update
})
</script>

<style lang="scss" scoped>
.Loading-container {
  @include flex(center, center);
  position: absolute;
  z-index: v-bind(zIndex);
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  cursor: not-allowed;
  background: v-bind(bgc);
}
</style>
