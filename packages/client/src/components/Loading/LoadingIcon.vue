<template>
  <div
    class="relative flex items-center justify-center overflow-hidden rounded-full" :class="[
      styles.classNames,
    ]"
    :style="styles.styles"
  >
    <!-- 蓝色渐变 loading 圆圈，铺满、旋转 -->
    <div
      v-if="props.gradient"
      class="absolute inset-0 animate-spin rounded-full"
      :style="{
        background: 'conic-gradient(from 0deg, transparent, #3b82f6)',
        mask: 'radial-gradient(circle, transparent 50%, black 58%)',
        WebkitMask: 'radial-gradient(circle, transparent 50%, black 58%)',
      }"
    />
    <div
      v-else
      class="size-full animate-spin border-2 rounded-full"
      :style="{
        borderColor: color,
        borderRightColor: 'transparent',
        borderBottomColor: 'transparent',
      }"
    />
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { LoadingProps } from './types'
import { handleCssUnit, isStr } from '@jl-org/tool'
import { defaultLoadingProps } from './types'

defineOptions({ name: 'LoadingIcon' })
const props = withDefaults(
  defineProps<LoadingProps>(),
  defaultLoadingProps,
)

const styles = computed<{ classNames: string, styles: CSSProperties }>(() => {
  if (isStr(props.size)) {
    const sizeMap = {
      sm: 'size-4',
      md: 'size-5',
      lg: 'size-6',
    } as const

    return {
      styles: {},
      classNames: sizeMap[props.size],
    }
  }

  return {
    styles: {
      width: handleCssUnit(props.size),
      height: handleCssUnit(props.size),
    },
    classNames: '',
  }
})
</script>

<style lang="scss" scoped></style>
