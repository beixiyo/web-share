import ModalComp from '@/components/Modal/index.vue'
import { type CompProps, defaultProps } from '@/components/Modal/compProps'
import type { App } from 'vue'


const appArr: {
  app: App<Element>,
  el: HTMLElement
}[] = []

export function showModal(
  content: string,
  onConfirm?: () => void,
  onClose?: () => void,
  props: CompProps = defaultProps
) {
  props.content = content
  gc()

  const app = createApp(ModalComp, Object.assign(props, { onConfirm, onClose })),
    frag = document.createDocumentFragment()

  const vm = app.mount(frag as unknown as HTMLElement) as ModalInstance
  document.body.appendChild(frag)
  appArr.push({
    app,
    el: vm.$el
  })
}

function gc() {
  appArr.forEach(({ app, el }) => {
    el.remove()
    app.unmount()
  })
  appArr.splice(0)
}


type ModalInstance = InstanceType<typeof ModalComp>