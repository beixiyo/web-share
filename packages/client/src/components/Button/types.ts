/**
 * 按钮设计风格
 */
export type ButtonDesignStyle = 'flat' | 'neumorphic' | 'outlined' | 'ghost'

/**
 * 按钮尺寸
 */
export type ButtonSize = 'sm' | 'md' | 'lg'

/**
 * 按钮变体
 */
export type ButtonVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'

/**
 * 按钮属性
 */
export interface ButtonProps {
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
   * 不显示图标间距
   * @default false
   */
  noIconGap?: boolean

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

  /**
   * 点击回调
   */
  onClick?: (event: MouseEvent) => void
}

