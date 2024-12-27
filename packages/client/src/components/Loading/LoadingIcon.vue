<template>
  <div
    class="relative flex items-center justify-center overflow-hidden rounded-full "
    :style="{
      width: size,
      height: size
    }">

    <!-- 蓝色渐变 loading 圆圈，铺满、旋转 -->
    <div
      class="absolute inset-0 rounded-full animate-spin"
      :style="{
        background: 'conic-gradient(from 0deg, transparent, #3b82f6)',
        mask: 'radial-gradient(circle, transparent 50%, black 58%)',
        WebkitMask: 'radial-gradient(circle, transparent 50%, black 58%)',
      }">
    </div>
  </div>
</template>

<script setup lang="ts">
import { handleCssUnit, type BaseType } from '@jl-org/tool'

defineOptions({ name: 'LoadingIcon' })
const props = withDefaults(
  defineProps<{
    size?: BaseType
  }>(),
  {
    size: '30px',
  }
)

const size = handleCssUnit(props.size)
</script>

<style lang="scss" scoped>
@keyframes loading {
  to {
    transform: rotate(360deg);
  }
}
</style>
