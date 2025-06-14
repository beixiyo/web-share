export interface LoadingProps {
  size?: number | 'sm' | 'md' | 'lg'
  /**
   * Whether to use gradient background.
   * @default false
   */
  gradient?: boolean
  /**
   * The color of the loading icon.
   * @default '#3b82f6'
   */
  color?: string
  /**
   * 自定义加载文本
   * @default '加载中...'
   */
  loadingText?: string
}

export const defaultLoadingProps: LoadingProps = {
  size: 'md',
  color: '#3b82f6',
  gradient: false,
  loadingText: '加载中...',
}
