import type { CompProps } from '@/components/Modal/compProps'
import { defaultProps } from '@/components/Modal/compProps'
import ModalComp from '@/components/Modal/index.vue'

export function showModal(
  content: string,
  handleConfirm?: () => void,
  handleClose?: () => void,
  props: CompProps = defaultProps,
) {
  props.content = content
  // @ts-ignore
  const app = createApp(ModalComp, {
    onConfirm: () => {
      handleConfirm?.()
      cleanup()
    },
    onClose: () => {
      handleClose?.()
      cleanup()
    },
    modelValue: true,
    ...props
  })
  const frag = document.createDocumentFragment()

  const vm = app.mount(frag as unknown as HTMLElement) as ModalInstance
  document.body.appendChild(frag)

  function cleanup() {
    setTimeout(() => {
      vm.close()
      app.unmount()
      vm.$el.remove()
    }, vm.DURATION)
  }
}

type ModalInstance = InstanceType<typeof ModalComp>
