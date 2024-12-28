import type { WatchOptions, WatchSource, Ref } from 'vue'


/**
 * 返回一个 **加载状态 和 请求函数**，当请求时自动改变加载状态  
 * 遇到报错时 最终也会把 `loading` 改为 `false`，并且抛出异常
 */
export function useReq<T>(
  {
    request: req,
    refLoading,
    onSuccess,
    onError,
    onFinally,
  }: UseReqOpts<T>
) {
  const loading = refLoading
    ? refLoading
    : ref(false)

  let data: T
  const _req = async () => {
    loading.value = true

    try {
      data = await req()
      onSuccess?.()
    }
    catch (error) {
      onError?.(error)
      throw error
    }
    finally {
      loading.value = false
      onFinally?.()
      return data
    }
  }

  return [_req, loading] as const
}

/**
 * 当监听的值变化时，自动执行请求，并且自动设置加载状态
 * @param request 请求函数
 * @param WatchSource 监听的值
 * @param watchOpts 监听配置
 * @returns 加载状态
 */
export function useWatchReq<T>(
  request: () => Promise<T>,
  WatchSource: WatchSource,
  watchOpts: useWatchReqOpts = {},
  opts?: Pick<UseReqOpts<T>, 'onSuccess' | 'onError' | 'onFinally'>
) {
  const { refLoading, ...watchOpt } = watchOpts

  const { onError, onFinally, onSuccess } = opts || {}
  const [_req, loading] = useReq({
    request,
    refLoading,
    onError, onFinally, onSuccess
  })

  watch(
    WatchSource,
    () => {
      _req()
    },
    watchOpt
  )

  return loading
}


interface useWatchReqOpts extends WatchOptions {
  /** 已有加载状态，可选 */
  refLoading?: Ref<boolean>
}

type UseReqOpts<T> = {
  /** 请求函数 */
  request: () => Promise<T>
  /** 已有加载状态，可选 */
  refLoading?: Ref<boolean>
  /** 成功时执行的函数，可选 */
  onSuccess?: VoidFunction
  /** 失败时执行的函数，可选 */
  onError?: (error: any) => void
  /** 无论成功与否，都会执行的函数，可选 */
  onFinally?: VoidFunction
}