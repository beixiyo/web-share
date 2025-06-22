/**
 * Web Worker 相关类型定义
 */

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
 * 数据块信息
 */
export interface ChunkInfo {
  /** 数据块大小 */
  chunkSize: number
  /** 数据块数据 */
  data: Uint8Array
  /** 文件偏移量 */
  offset: number
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
  type: 'appendChunk' | 'init'
  /** 消息载荷 */
  payload: any
}

/**
 * 错误类型
 */
export enum WorkerErrorType {
  /** 初始化错误 */
  INITIALIZATION_ERROR = 'INITIALIZATION_ERROR',
  /** 通信错误 */
  COMMUNICATION_ERROR = 'COMMUNICATION_ERROR',
  /** 超时错误 */
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  /** 数据错误 */
  DATA_ERROR = 'DATA_ERROR',
  /** 存储错误 */
  STORAGE_ERROR = 'STORAGE_ERROR',
  /** 未知错误 */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Worker 错误
 */
export class WorkerError extends Error {
  constructor(
    public type: WorkerErrorType,
    message: string,
    public originalError?: Error,
  ) {
    super(message)
    this.name = 'WorkerError'
  }
}
