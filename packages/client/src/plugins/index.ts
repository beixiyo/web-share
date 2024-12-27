import { PromisePolyfill } from './PromisePolyfill'
import { arrPolyfill } from './arrPolyfill'
import VConsole from 'vconsole'
import { isMobile } from '@jl-org/tool'


PromisePolyfill()
arrPolyfill()

if (import.meta.env.DEV && isMobile()) {
  new VConsole()
}