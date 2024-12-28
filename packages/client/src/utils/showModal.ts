import ModalComp from '@/components/Modal/index.vue'
import { type CompProps, defaultProps } from '@/components/Modal/compProps'


export function showModal(
  content: string,
  onConfirm?: () => void,
  onClose?: () => void,
  props: CompProps = defaultProps
) {
  props.content = content

  const app = createApp(ModalComp, Object.assign(props, { onConfirm, onClose })),
    frag = document.createDocumentFragment()

  const vm = app.mount(frag as unknown as HTMLElement) as ModalInstance
  document.body.appendChild(frag)

  return () => {
    vm.close()
    setTimeout(() => {
      app.unmount()
      vm.$el.remove()
    }, vm.DURATION)
  }
}

type ModalInstance = InstanceType<typeof ModalComp>
