import type { MaybeRefOrGetter, Ref } from 'vue'
import { toValue, watchEffect } from 'vue'

/**
 * 观察元素交叉状态 (IntersectionObserver)
 * @param els - 要观察的元素引用数组 (可以是 ref 或 getter)
 * @param callback - 交叉状态变化的回调函数
 * @param options - IntersectionObserver 的配置选项
 */
export function useIntersectionObserver<E extends HTMLElement>(
  els: MaybeRefOrGetter<(Ref<E | null | undefined> | E | null | undefined)[]>,
  callback: (entry: IntersectionObserverEntry) => void,
  options?: IntersectionObserverInit,
) {
  return useOb(IntersectionObserver, els, callback, options)
}

/**
 * 观察元素尺寸变化 (ResizeObserver)
 * @param els - 要观察的元素引用数组 (可以是 ref 或 getter)
 * @param callback - 尺寸变化的回调函数
 */
export function useResizeObserver<E extends HTMLElement>(
  els: MaybeRefOrGetter<(Ref<E | null | undefined> | E | null | undefined)[]>,
  callback: (entry: ResizeObserverEntry) => void,
) {
  return useOb(ResizeObserver, els, callback)
}

/**
 * 观察 DOM 变化 (MutationObserver)
 * @param el - 要观察的元素引用 (可以是 ref 或 getter)
 * @param callback - DOM 变化的回调函数
 * @param options - MutationObserver 的配置选项
 */
export function useMutationObserver<E extends HTMLElement>(
  el: MaybeRefOrGetter<Ref<E | null | undefined> | E | null | undefined>,
  callback: MutationCallback,
  options: MutationObserverInit & { immediate?: boolean } = {
    childList: true,
    subtree: true,
    characterData: true,
    immediate: true,
  },
) {
  const { immediate, ...obOptions } = options
  let observer: MutationObserver | null = null

  watchEffect((onCleanup) => {
    const element = toValue(el)
    if (!element)
      return

    /** 创建观察器 */
    observer = new MutationObserver((mutations, ob) => {
      callback(mutations, ob)
    })

    /** 立即执行一次回调 */
    if (immediate) {
      callback([], observer)
    }

    /** 开始观察 */
    observer.observe(
      element instanceof HTMLElement
        ? element
        : element.value as HTMLElement,
      obOptions,
    )

    /** 组件卸载时清理 */
    onCleanup(() => {
      observer?.disconnect()
    })
  })

  return observer
}

/**
 * 通用的 Observer 逻辑
 * @param ObserverClass - Observer 类 (IntersectionObserver/ResizeObserver)
 * @param els - 要观察的元素引用数组 (可以是 ref 或 getter)
 * @param callback - 变化的回调函数
 * @param options - Observer 的配置选项
 */
function useOb<
  T extends new (
    callback: (entries: Entry[], observer: InstanceType<T>) => void,
    options?: any
  ) => {
    observe: (target: Element) => void
    unobserve: (target: Element) => void
    disconnect: () => void
  },
  Entry,
  E extends HTMLElement,
>(
  ObserverClass: T,
  els: MaybeRefOrGetter<(Ref<E | null | undefined> | E | null | undefined)[]>,
  callback: (entry: Entry) => void,
  options?: ConstructorParameters<T>[1],
) {
  let observer: InstanceType<T> | null = null

  watchEffect((onCleanup) => {
    /** 获取所有有效的 DOM 元素 */
    const elements = toValue(els)
      .map(el => toValue(el))
      .filter((el): el is E => el instanceof HTMLElement)

    if (elements.length === 0)
      return

    // @ts-ignore
    observer = new ObserverClass(
      (entries: Entry[]) => {
        entries.forEach(entry => callback(entry))
      },
      options,
    )

    /** 观察所有元素 */
    elements.forEach(el => observer?.observe(el))

    /** 组件卸载时清理 */
    onCleanup(() => {
      observer?.disconnect()
    })
  })

  return observer
}
