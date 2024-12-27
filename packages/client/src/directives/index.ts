import type { App } from "vue"
import { loading } from '@/directives/loading'


export default {
  install(app: App<Element>) {
    const directiveArr = [
      loading,
    ]

    directiveArr.forEach((fn) => fn(app as App<HTMLElement>))
  }
}
