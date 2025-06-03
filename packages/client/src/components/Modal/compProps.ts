import type { BaseType } from '@jl-org/tool'
import { handleCssUnit } from '@jl-org/tool'

export interface CompProps {
  title?: string
  titleWeight?: BaseType
  titleSize?: BaseType
  titleColor?: string

  width?: BaseType
  height?: BaseType
  content?: string
  fontSize?: BaseType
  color?: string
}

export const defaultProps = {
  title: '标题',
  titleSize: handleCssUnit(17),
  titleWeight: 600,
  titleColor: '#000000e0',

  width: handleCssUnit(500),
  height: handleCssUnit(300),

  content: '内容',
  fontSize: handleCssUnit(14),
  color: '#000000e0',
}
