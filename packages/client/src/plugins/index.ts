import { isMobile } from '@jl-org/tool'
import VConsole from 'vconsole'
import { arrPolyfill } from './arrPolyfill'
import { PromisePolyfill } from './PromisePolyfill'

PromisePolyfill()
arrPolyfill()

if (import.meta.env.DEV && isMobile()) {
  new VConsole()
}
