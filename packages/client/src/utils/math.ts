import { numFixed } from '@jl-org/tool'

export function byteToMB(byteLength: number) {
  return numFixed(byteLength / 1024 / 1024)
}
