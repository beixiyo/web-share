import type { App } from 'vue'
import Loading from '@/components/Loading/index.vue'

const map = new WeakMap<HTMLElement, LoadingData>()

/**
 * @example
 * ```html
 * <Test v-loading:50px,#f408="loading" />
 * <Test v-loading="{ loading: true, text: '自定义加载文本' }" />
 * ```
 * 第一个参数是大小 第二个参数是背景色 都可以不传
 * 支持传递对象 { loading: boolean, text?: string } 来自定义加载文本
 */
export function loading(app: App<HTMLElement>) {
  app.directive('loading', {
    mounted(el, { arg, value }) {
      let loadingValue: boolean
      let loadingText: string | undefined

      /** 支持两种格式：boolean 或 { loading: boolean, text?: string } */
      if (typeof value === 'object' && value !== null) {
        loadingValue = value.loading
        loadingText = value.text
      }
      else {
        loadingValue = value
      }

      const opts: any = { __loading: loadingValue }
      const frag = document.createDocumentFragment()

      if (arg) {
        const [size, bgc] = arg?.split(',')
        opts.width = size
        opts.height = size
        opts.bgc = bgc
      }

      if (loadingText) {
        opts.__loadingText = loadingText
      }

      if (getComputedStyle(el).position === 'static') {
        el.style.position = 'relative'
      }

      const Comp = createApp(Loading, opts)
      const vm = Comp.mount(frag as unknown as Element) as LoadingData['vm']

      map.set(el, { comp: Comp, vm, lastLoadingText: loadingText })
      el.appendChild(frag)
    },

    updated(el, { value }) {
      const data = map.get(el)
      if (!data)
        return

      let loadingValue: boolean
      let loadingText: string | undefined

      /** 支持两种格式：boolean 或 { loading: boolean, text?: string } */
      if (typeof value === 'object' && value !== null) {
        loadingValue = value.loading
        loadingText = value.text
      }
      else {
        loadingValue = value
      }

      /** 更新loading状态 */
      data.vm.update?.(loadingValue)

      /** 如果文本发生变化，重新创建组件 */
      if (loadingText !== data.lastLoadingText) {
        data.lastLoadingText = loadingText
        data.comp.unmount()

        const opts: any = { __loading: loadingValue }
        if (loadingText) {
          opts.__loadingText = loadingText
        }

        const frag = document.createDocumentFragment()
        const newComp = createApp(Loading, opts)
        const newVm = newComp.mount(frag as unknown as Element) as LoadingData['vm']

        data.comp = newComp
        data.vm = newVm
        el.appendChild(frag)
      }
    },

    beforeUnmount(el) {
      map.get(el)?.comp.unmount()
    },
  })
}

interface LoadingData {
  comp: App<Element>
  vm: InstanceType<typeof Loading>
  lastLoadingText?: string | null
}
