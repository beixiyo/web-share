import type { MessageVariant } from '@/components/Message/type'
import type { App } from 'vue'
import { MESSAGE_DURATION, MESSAGE_ENUM } from '@/components/Message/constants'
import MessageComp from '@/components/Message/index.vue'

const disposeFns: Function[] = []

/**
 * 如果调用`Message.loading` 则返回一个关闭函数
 */
export const Message: MessageInstance = (() => {
  const _Msg = (
    content = 'This is default content',
    duration = MESSAGE_DURATION,
    type: MessageVariant = 'info',
  ) => {
    const props = { content, type }
    const app = createApp(MessageComp, props)

    if (type === 'loading') {
      return show(app, Infinity)
    }
    return show(app, duration)
  }

  const extraMethods = MESSAGE_ENUM.map((type) => {
    const fn = (content: string, duration: number) => {
      return _Msg(content, duration, type)
    }
    return [type, fn]
  })

  return Object.assign(_Msg, Object.fromEntries(extraMethods))
})()

function show(app: App<Element>, duration: number) {
  cleanup()
  const oFrag = document.createDocumentFragment()
  const vm = app.mount(oFrag as unknown as Element) as MessageCompInstance

  document.body.appendChild(oFrag)
  vm.setVisible(true)

  const disposeFn = hide(app, vm, duration)
  disposeFns.push(disposeFn)

  return disposeFn
}

function cleanup() {
  disposeFns.forEach(fn => fn())
  disposeFns.splice(0)
}

function hide(app: App<Element>, vm: MessageCompInstance, duration: number) {
  const dispose = async () => {
    /** 等待动画加载完再卸载 */
    await vm.setVisible(false)
    vm.$el.remove()
    app.unmount()
  }

  /**
   * Loading 时
   */
  if (duration === Infinity)
    return dispose

  setTimeout(dispose, duration)
  return dispose
}

type MessageFns = {
  [K in MessageVariant]: (content: string, duration?: number) => Function
}

interface MessageInstance extends MessageFns {
  (content: string, duration?: number, type?: MessageVariant): Function
}

type MessageCompInstance = InstanceType<typeof MessageComp>
