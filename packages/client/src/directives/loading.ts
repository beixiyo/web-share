import type { App } from 'vue'
import Loading from '@/components/Loading/index.vue'


const map = new WeakMap<HTMLElement, LoadingData>()

/**
 * @example
 * ```html
 * <Test v-loading:50px,#f408="loading" />
 * ```
 * 第一个参数是大小 第二个参数是背景色 都可以不传
 */
export function loading(app: App<HTMLElement>) {
  app.directive('loading', {
    mounted(el, { arg, value }) {
      const opts: any = { __loading: value },
        frag = document.createDocumentFragment()

      if (arg) {
        const [size, bgc] = arg?.split(',')
        opts.width = size
        opts.height = size
        opts.bgc = bgc
      }

      if (getComputedStyle(el)['position'] === 'static') {
        el.style.position = 'relative'
      }

      const Comp = createApp(Loading, opts),
        vm = Comp.mount(frag as unknown as Element) as LoadingData['vm']

      map.set(el, { comp: Comp, vm })
      el.appendChild(frag)
    },

    updated(el, { value }) {
      map.get(el)?.vm.update?.(value)
    },
    beforeUnmount(el) {
      map.get(el)?.comp.unmount()
    }
  })
}


interface LoadingData {
  comp: App<Element>,
  vm: InstanceType<typeof Loading>
}
