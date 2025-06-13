import { numFixed } from '@jl-org/tool'

export function formatByte(byteLength: number): string {
  if (byteLength < 1000) {
    return byteLength + ' B'
  }
  if (byteLength < 1024 * 1024) {
    return numFixed(byteLength / 1024) + ' KB'
  }

  return numFixed(byteLength / 1024 / 1024) + ' MB'
}
