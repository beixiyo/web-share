/**
 * 获取组件实例类型 例如：
 * @example
 * ```ts
 * const refForm = useCompRef(Form)
 * ```
 */
export function useCompRef<T extends abstract new (...args: any) => any>(_comp: T) {
  return ref<InstanceType<T> | null>()
}

/**
 * 分时渲染
 * @param maxFrame 最大帧，超过后不再计数
 * @returns 一个函数，接收一个数字，如果当前帧数大于传入的数字，则返回 true
 * @example
 * const defer = useDefer(60)
 * <Comp v-if="defer(10)" />
 */
export function useDefer(maxFrame = 60) {
  let id: number
  const curFrame = ref(0)

  onMounted(() => {
    refresh()
  })

  onUnmounted(() => {
    cancelAnimationFrame(id)
  })

  function refresh() {
    if (curFrame.value >= maxFrame) {
      return
    }

    id = requestAnimationFrame(() => {
      curFrame.value++
      refresh()
    })
  }

  return function (frame: number) {
    return curFrame.value > frame
  }
}
