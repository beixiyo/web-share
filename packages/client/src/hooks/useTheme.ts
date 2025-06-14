import type { Theme } from '@jl-org/tool'
import { onChangeTheme } from '@jl-org/tool'
import { getCurrentTheme, setHTMLTheme, toggleTheme } from '@/utils'
import { useMutationObserver } from './ob'

/**
 * 监听用户主题变化，自动设置主题色，触发对应回调
 * ### 首次执行会优先设置用户主题，没有则为系统主题
 * @param onLight 用户切换到浅色模式时触发
 * @param onDark 用户切换到深色模式时触发
 */
export function useChangeTheme(
  onLight?: VoidFunction,
  onDark?: VoidFunction,
) {
  toggleTheme(getCurrentTheme().theme)
  const unbind = onChangeTheme(
    () => {
      setHTMLTheme('light')
      onLight?.()
    },
    () => {
      setHTMLTheme('dark')
      onDark?.()
    },
  )

  onBeforeUnmount(unbind)
}

/**
 * 获取和设置当前主题
 */
export function useTheme(defaultTheme: Theme = 'light') {
  const theme = ref<Theme>(defaultTheme)
  const docEl = document.documentElement

  const _toggleTheme = (value?: Theme) => {
    const nextTheme = toggleTheme(value)
    theme.value = nextTheme
  }

  const themeInfo = getCurrentTheme()
  theme.value = themeInfo.theme
  setHTMLTheme(themeInfo.theme)

  const unbindSystemTheme = onChangeTheme(
    () => theme.value = 'light',
    () => theme.value = 'dark',
  )

  onBeforeUnmount(unbindSystemTheme)

  useMutationObserver(
    docEl,
    () => {
      const themeVal = getCurrentTheme().theme
      theme.value = themeVal
    },
    {
      attributes: true,
      attributeFilter: ['class'],
    },
  )

  return [theme, _toggleTheme] as const
}
