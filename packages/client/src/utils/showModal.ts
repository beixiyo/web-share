import type { ExtendedCompProps, ModalInstance, ModalVariant, ModelType } from '@/components/Modal/types'
import { variantStyles } from '@/components/Modal/constants'
import ModalComp from '@/components/Modal/index.vue'
import { defaultProps } from '@/components/Modal/types'

export const modal: ModelType = (() => {
  const modalObj: ModelType = {} as ModelType

  const methods = Object.keys(variantStyles) as ModalVariant[]
  methods.forEach((variant) => {
    modalObj[variant] = (props: ExtendedCompProps) => {
      const newProps: ExtendedCompProps = {
        ...defaultProps,
        ...props,
        variant,

        onConfirm: () => {
          props.onConfirm?.()
          cleanup()
        },
        onClose: () => {
          props.onClose?.()
          cleanup()
        },
      }

      const app = createApp(ModalComp, {
        ...newProps,
        modelValue: true,
      })
      const frag = document.createDocumentFragment()

      const vm = app.mount(frag as unknown as HTMLElement) as ModalInstance
      document.body.appendChild(frag)

      function cleanup() {
        setTimeout(() => {
          app.unmount()
          vm.$el.remove()
        }, vm.duration)
      }
    }
  })

  return modalObj
})()
