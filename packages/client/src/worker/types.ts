/**
 * Web Worker 相关类型定义
 */

import type { ChunkInfo } from '@/types'

/**
 * Worker 响应类型
 */
export interface WorkerResponse {
  id: string
  type: 'success' | 'error'
  payload?: any
  error?: string
}

/**
 * appendChunk 操作的参数
 */
export interface AppendChunkPayload {
  fileHash: string
  chunk: Uint8Array
  offset: number
  config?: LocalForageOptions
}

/**
 * storeChunk 操作的参数
 */
export interface StoreChunkPayload {
  chunkKey: string
  chunkInfo: ChunkInfo
  config?: LocalForageOptions
}

/**
 * 断点续传缓存项
 */
export interface ResumeCacheItem {
  /** 文件唯一标识 */
  fileHash: string
  /** 原始文件名 */
  fileName: string
  /** 文件大小 */
  fileSize: number
  /** 已下载字节数 */
  downloadedBytes: number
  /** 数据块总数 */
  totalChunks: number
  /** 创建时间 */
  createdAt: number
  /** 最后更新时间 */
  updatedAt: number
}

/**
 * Worker 消息类型
 */
export type WorkerMessage = {
  /** 操作类型 */
  type: 'storeChunk' | 'init'
  /** 消息载荷 */
  payload: any
}
