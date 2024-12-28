import { debounce, throttle } from '@jl-org/tool'


/** 开关 */
export function useToggle(val: boolean) {
  const show = ref(val)
  const toggle = (v?: boolean) => {
    if (v !== undefined) {
      show.value = v
    }
    else {
      show.value = !show.value
    }
  }

  return [show, toggle] as const
}

/**
 * 防抖版 ref
 * @param durationMS 延迟时间，默认 200
 */
export function debounceRef<T>(value: T, durationMS = 200) {
  return customRef<T>((track, trigger) => {
    const _set = (v: T) => {
      trigger()
      value = v
    }

    return {
      get: () => {
        track()
        return value
      },
      set: debounce(_set, durationMS)
    }
  })
}

/**
 * 节流版 ref
 * @param durationMS 延迟时间，默认 200
 */
export function throttleRef<T>(value: T, durationMS = 200) {
  return customRef<T>((track, trigger) => {
    const _set = (v: T) => {
      trigger()
      value = v
    }

    return {
      get: () => {
        track()
        return value
      },
      set: throttle(_set, durationMS)
    }
  })
}

/**
 * 把 props 的属性，转成 v-model 的计算属性
 * ### 直接对其赋值，即可触发 update:modelValue 事件
 * @param getter - 一个函数，用于获取当前的 v-model 值
 * @param emit - 组件的 emit 函数，用于触发更新 v-model 值的事件
 * @param emitKey - 更新事件的名称，默认为 'modelValue'。允许自定义事件名称，以适应不同的需求
 * @returns 返回一个计算属性，getter 用于获取当前 v-model 的值，setter 用于更新 v-model 的值
 */
export function useVModelValue<T>(
  getter: () => T,
  emit: Function,
  emitKey = 'modelValue'
) {
  return computed({
    get: () => getter(),
    set: (value: T) => emit(`update:${emitKey}`, value)
  })
}