import { EventBus } from '@jl-org/tool'
import type { Action } from 'web-share-common'


export const Events = new EventBus<Action>({
  triggerBefore: true
})