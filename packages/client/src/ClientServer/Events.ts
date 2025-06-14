import type { Action } from 'web-share-common'
import { EventBus } from '@jl-org/tool'

export const Events = new EventBus<Action>({
  triggerBefore: true,
})
