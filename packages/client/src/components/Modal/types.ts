import type Modal from '@/components/Modal/index.vue'
import type { BaseType } from '@jl-org/tool'
import type { CSSProperties } from 'vue'
import { handleCssUnit } from '@jl-org/tool'

export interface CompProps {
  /**
   * 弹窗标题
   * @default '标题'
   */
  title?: string

  /**
   * 弹窗宽度，单位 px
   * @default 500
   */
  width?: BaseType

  /**
   * 弹窗高度，单位 px
   * @default 300
   */
  height?: BaseType

  /**
   * 弹窗内容，可以是字符串或者 VNode
   */
  content?: string // 如果需要支持 VNode，可以改为 any 或更具体的类型

  /**
   * 弹窗变体类型
   * @default 'default'
   */
  variant?: ModalVariant

  /**
   * 确认按钮文本
   * @default '确认'
   */
  okText?: string

  /**
   * 取消按钮文本
   * @default '取消'
   */
  cancelText?: string

  /**
   * 自定义头部样式
   */
  headerStyle?: CSSProperties

  /**
   * 自定义内容区域样式
   */
  bodyStyle?: CSSProperties

  /**
   * 自定义底部样式
   */
  footerStyle?: CSSProperties

  /**
   * z-index 层级
   * @default 99
   */
  zIndex?: number
}

export const defaultProps = {
  title: '标题',

  width: handleCssUnit(500),
  height: handleCssUnit(300),

  content: '内容',

  variant: 'default' as ModalVariant,
  okText: '确认',
  cancelText: '取消',
  zIndex: 99,
}

export type ModalVariant = 'default' | 'success' | 'warning' | 'error' | 'info'

export type ExtendedCompProps = CompProps & {
  onConfirm?: () => void
  onClose?: () => void
}

export type ModalInstance = InstanceType<typeof Modal>

export type ModelType = typeof Modal & {
  [K in ModalVariant]: (props: ExtendedCompProps) => void
}
