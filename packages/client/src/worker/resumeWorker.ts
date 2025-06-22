/* eslint-disable no-restricted-globals */
import type { AppendChunkPayload, ChunkInfo, ResumeCacheItem, WorkerMessage, WorkerResponse } from './types'
import type { ResumeMetadata } from '@/utils'
import localforage from 'localforage'
import { ResumeConfig } from '@/config'

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
 * 获取断点续传元数据
 */
async function getMetadata(instance: LocalForage): Promise<ResumeMetadata> {
  const metadata = await instance.getItem<ResumeMetadata>(ResumeConfig.RESUME_METADATA_KEY)
  return metadata || {}
}

/**
 * 保存断点续传元数据
 */
async function saveMetadata(instance: LocalForage, metadata: ResumeMetadata): Promise<void> {
  await instance.setItem(ResumeConfig.RESUME_METADATA_KEY, metadata)
}

/**
 * 获取缓存键名
 */
function getCacheKey(fileHash: string): string {
  return `${ResumeConfig.RESUME_CACHE_KEY_PREFIX}${fileHash}`
}

/**
 * 获取数据块键名
 */
function getChunkKey(fileHash: string, offset: number): string {
  return `${ResumeConfig.RESUME_CHUNK_KEY_PREFIX}${fileHash}_${offset}`
}

/**
 * 在 Worker 中执行 appendChunk 操作
 */
async function appendChunkInWorker(payload: AppendChunkPayload): Promise<void> {
  const { fileHash, chunk, offset, config } = payload

  /** 验证输入参数 */
  if (!fileHash || !chunk || offset < 0) {
    throw new Error(`无效的参数: fileHash=${fileHash}, chunk=${!!chunk}, offset=${offset}`)
  }

  /** 检查 ArrayBuffer 是否已分离 */
  if (chunk.buffer.byteLength === 0 && chunk.byteLength > 0) {
    console.error(`检测到分离的 ArrayBuffer: fileHash=${fileHash}, offset=${offset}`)
    throw new Error(`ArrayBuffer 已分离，无法存储到 IndexedDB`)
  }

  /** 创建数据的深拷贝，避免 detached buffer 问题 */
  const safeChunk = new Uint8Array(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength))

  const instance = initLocalForage(config)
  const cacheKey = getCacheKey(fileHash)
  const cacheItem = await instance.getItem<ResumeCacheItem>(cacheKey)

  if (!cacheItem) {
    throw new Error(`断点续传缓存不存在: ${fileHash}`)
  }

  /** 检查是否已存在相同偏移量的数据块，避免重复存储 */
  const chunkKey = getChunkKey(fileHash, offset)
  const existingChunk = await instance.getItem<ChunkInfo>(chunkKey)

  if (existingChunk) {
    console.warn(`数据块已存在，跳过存储: ${fileHash}, 偏移: ${offset}`)
    return
  }

  /** 创建数据块信息 - 使用安全的数据拷贝 */
  const chunkInfo: ChunkInfo = {
    chunkSize: safeChunk.byteLength,
    offset,
    data: safeChunk,
  }

  try {
    /** 先保存数据块，确保数据写入完成 */
    await instance.setItem(chunkKey, chunkInfo)

    /** 更新缓存项元数据 */
    cacheItem.downloadedBytes = Math.max(cacheItem.downloadedBytes, offset + safeChunk.byteLength)
    cacheItem.totalChunks += 1
    cacheItem.updatedAt = Date.now()

    /** 保存更新的缓存项 */
    await instance.setItem(cacheKey, cacheItem)

    /** 更新元数据 */
    const metadata = await getMetadata(instance)
    if (metadata[fileHash]) {
      metadata[fileHash].downloadedBytes = cacheItem.downloadedBytes
      metadata[fileHash].updatedAt = cacheItem.updatedAt
      await saveMetadata(instance, metadata)
    }
  }
  catch (error) {
    console.error(`添加数据块到缓存失败: ${fileHash}, 偏移: ${offset}`, error)
    /** 如果元数据更新失败，尝试清理已存储的数据块 */
    try {
      await instance.removeItem(chunkKey)
    }
    catch (cleanupError) {
      console.error(`清理失败的数据块失败: ${fileHash}, 偏移: ${offset}`, cleanupError)
    }
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

      case 'appendChunk':
        await appendChunkInWorker(payload as AppendChunkPayload)
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
