import type { WinListenerParams } from '@jl-org/tool'
import { bindWinEvent } from '@jl-org/tool'

/**
 * 绑定 window 事件，并自动解绑事件
 * @param eventName 事件名称
 * @param listener 事件回调
 * @returns 解绑事件函数
 */
export function useBindWinEvent<K extends keyof WindowEventMap>(
  eventName: K,
  listener: WinListenerParams<K>[1],
  options?: WinListenerParams<K>[2],
) {
  const unBind = bindWinEvent(eventName, listener, options)

  onUnmounted(unBind)
  onBeforeRouteLeave(unBind)

  return unBind
}

/**
 * 监听窗口隐藏
 * @param hiddenFn 窗口隐藏时执行的函数
 * @param showFn 窗口显示时执行的函数
 */
export function useOnWinHidden(
  hiddenFn: VoidFunction,
  showFn?: VoidFunction,
) {
  const fn = () => {
    const isHidden = document.visibilityState === 'hidden'
    if (isHidden) {
      hiddenFn()
      return
    }

    const isVisible = document.visibilityState === 'visible'
    if (isVisible && showFn) {
      showFn()
      return
    }
  }

  document.addEventListener('visibilitychange', fn)
  const unBind = () => {
    document.removeEventListener('visibilitychange', fn)
  }

  onUnmounted(unBind)
  onBeforeRouteLeave(unBind)

  return unBind
}
