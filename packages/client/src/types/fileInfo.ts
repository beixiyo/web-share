import type { MIMEType } from '@jl-org/tool'

export type FileInfo = {
  size: number
  name: string
  type: MIMEType
  lastModified: number
}

export type ChunkMetaData = {
  fileHash: string
  offset: number
}

/**
 * 数据块信息
 */
export type ChunkInfo = {
  /** 数据块大小 */
  chunkSize: number
  /** 数据块数据 */
  data: Uint8Array
  /** 文件偏移量 */
  offset: number
}
