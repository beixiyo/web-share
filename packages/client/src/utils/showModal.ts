import type { CompProps } from '@/components/Modal/compProps'
import { defaultProps } from '@/components/Modal/compProps'
import ModalComp from '@/components/Modal/index.vue'

export function showModal(
  content: string,
  onConfirm?: () => void,
  onClose?: () => void,
  props: CompProps = defaultProps,
) {
  props.content = content
  // @ts-ignore
  const app = createApp(ModalComp, Object.assign(props, { onConfirm, onClose }))
  const frag = document.createDocumentFragment()

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
