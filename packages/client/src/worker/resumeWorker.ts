/* eslint-disable no-restricted-globals */
import type { StoreChunkPayload, WorkerMessage, WorkerResponse } from './types'
import type { ChunkInfo } from '@/types'
import localforage from 'localforage'

/**
 * LocalForage 实例管理
 */
let localForageInstance: LocalForage | null = null

/**
 * 初始化 LocalForage 实例
 */
function initLocalForage(config?: LocalForageOptions): LocalForage {
  if (!localForageInstance) {
    localForageInstance = localforage.createInstance({
      name: 'resumeManager',
      storeName: 'resumeCache',
      description: '断点续传缓存数据',
      ...(config || {}),
    })
  }
  return localForageInstance
}

/**
 * 在 Worker 中直接存储数据块
 */
async function storeChunkInWorker(payload: StoreChunkPayload): Promise<void> {
  const { chunkKey, chunkInfo, config } = payload

  /** 验证输入参数 */
  if (!chunkKey || !chunkInfo || !chunkInfo.data) {
    throw new Error(`无效的参数: chunkKey=${chunkKey}, chunkInfo=${!!chunkInfo}`)
  }

  /** 检查 ArrayBuffer 是否已分离 */
  if (chunkInfo.data.buffer.byteLength === 0 && chunkInfo.data.byteLength > 0) {
    console.error(`检测到分离的 ArrayBuffer: chunkKey=${chunkKey}`)
    throw new Error(`ArrayBuffer 已分离，无法存储到 IndexedDB`)
  }

  const instance = initLocalForage(config)

  /** 检查是否已存在相同键名的数据块，避免重复存储 */
  const existingChunk = await instance.getItem<ChunkInfo>(chunkKey)
  if (existingChunk) {
    console.warn(`数据块已存在，跳过存储: ${chunkKey}`)
    return
  }

  try {
    /** 保存数据块 */
    await instance.setItem(chunkKey, chunkInfo)
  }
  catch (error) {
    console.error(`存储数据块失败: ${chunkKey}`, error)
    throw error
  }
}

/**
 * Worker 消息处理
 */
self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data

  try {
    switch (type) {
      case 'init':
        /** 初始化操作，如果需要的话 */
        initLocalForage(payload?.config)
        break

      case 'storeChunk':
        await storeChunkInWorker(payload as StoreChunkPayload)
        break

      default:
        throw new Error(`未知的操作类型: ${type}`)
    }
  }
  catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error
        ? error.message
        : String(error),
    } as WorkerResponse)
  }
})
