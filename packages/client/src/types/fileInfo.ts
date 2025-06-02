import type { MIMEType } from '@jl-org/tool'

export type FileInfo = {
  size: number
  name: string
  type: MIMEType
  lastModified: number
}
