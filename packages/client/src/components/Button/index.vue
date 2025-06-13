<template>
  <button
    :class="cn(buttonStyles)"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <div v-if="loading" class="flex items-center justify-center gap-2">
      <LoadingIcon
        :size="size === 'lg' ? 'md' : 'sm'"
        :color="variant === 'primary' ? '#fff' : undefined"
      />
      <span v-if="!iconOnly && loadingText">{{ loadingText }}</span>
      <slot v-else />
    </div>

    <template v-else-if="noChild && (leftIcon || rightIcon)">
      <component :is="leftIcon || rightIcon" />
    </template>

    <template v-else>
      <span v-if="leftIcon" :class="cn('mr-2', noChild && 'm-0')">
        <component :is="leftIcon" />
      </span>

      <slot />

      <span
        v-if="rightIcon"
        :class="cn('ml-2', noChild && 'm-0')"
      >
        <component :is="rightIcon" />
      </span>
    </template>
  </button>
</template>

<script setup lang="ts">
import type { ButtonDesignStyle, ButtonSize, ButtonVariant } from './types'
import LoadingIcon from '@/components/Loading/LoadingIcon.vue'
import { cn } from '@/utils'
import { computed, ref } from 'vue'
import { getFlatStyles, getGhostStyles, getIconButtonStyles, getNeumorphicStyles, getOutlinedStyles } from './styles'

defineOptions({ name: 'Button' })

const props = withDefaults(
  defineProps<{
    /**
     * 按钮左侧图标
     */
    leftIcon?: any
    /**
     * 按钮右侧图标
     */
    rightIcon?: any
    /**
     * 仅显示图标的按钮
     * @default false
     */
    iconOnly?: boolean
    /**
     * 加载状态
     * @default false
     */
    loading?: boolean
    /**
     * 加载状态时显示的文本
     */
    loadingText?: string
    /**
     * 禁用状态
     * @default false
     */
    disabled?: boolean
    /**
     * 设计风格
     * @default 'flat'
     */
    designStyle?: ButtonDesignStyle
    /**
     * 按钮变体
     * @default 'default'
     */
    variant?: ButtonVariant
    /**
     * 按钮尺寸
     * @default 'md'
     */
    size?: ButtonSize
    /**
     * 是否为块级元素（占满容器宽度）
     * @default false
     */
    block?: boolean
    /**
     * 圆角大小
     * @default 'md'
     */
    rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full'
    /**
     * 基础类名
     */
    className?: string
    /**
     * hover 状态类名
     */
    hoverClassName?: string
    /**
     * 激活状态类名
     */
    activeClassName?: string
    /**
     * 禁用状态类名
     */
    disabledClassName?: string
    /**
     * 加载状态类名
     */
    loadingClassName?: string
  }>(),
  {
    iconOnly: false,
    noIconGap: false,
    loading: false,
    disabled: false,
    designStyle: 'flat',
    variant: 'default',
    size: 'md',
    rounded: 'md',
    block: false,
  },
)

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const slots = useSlots()
const noChild = computed(() => {
  return !slots.default || props.iconOnly
})

/** 获取设计风格对应的样式 */
const getStylesByDesign = computed(() => {
  const styleProps = {
    variant: props.variant,
    size: props.size,
    rounded: props.rounded,
    className: props.className,
  }

  switch (props.designStyle) {
    case 'neumorphic':
      return getNeumorphicStyles(styleProps)
    case 'outlined':
      return getOutlinedStyles(styleProps)
    case 'ghost':
      return getGhostStyles(styleProps)
    case 'flat':
    default:
      return getFlatStyles(styleProps)
  }
})

/** 图标按钮的尺寸样式 */
const iconButtonSize = computed(() => {
  return noChild.value
    ? getIconButtonStyles(props.size)
    : ''
})

/** 最终的按钮样式 */
const buttonStyles = computed(() => {
  return [
    getStylesByDesign.value,
    props.block
      ? 'w-full'
      : '',
    noChild.value
      ? iconButtonSize.value
      : '',
    noChild.value
      ? 'p-0'
      : '',
    props.disabled
      ? props.disabledClassName
      : '',
    props.loading
      ? props.loadingClassName
      : '',
  ]
})

/** 处理点击事件 */
function handleClick(e: MouseEvent) {
  if (props.loading || props.disabled) {
    e.preventDefault()
    return
  }

  emit('click', e)
}
</script>

<style scoped>
button {
  position: relative;
  transition: all 0.2s;
}
</style>
