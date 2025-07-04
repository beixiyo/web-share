import type { ChunkInfo } from '@/types'
import localforage from 'localforage'
import { CHUNK_SIZE, ResumeConfig } from '@/config'
import { cleanupWorkerManager, getWorkerManager } from '@/worker/WorkerManager'
import { Log } from '..'

/**
 * 断点续传管理器
 * 负责断点续传缓存存储和管理
 */
export class ResumeManager {
  private localForageInstance: LocalForage

  constructor(config?: LocalForageOptions) {
    this.localForageInstance = localforage.createInstance({
      name: 'resumeManager',
      storeName: 'resumeCache',
      description: '断点续传缓存数据',
      ...(config || {}),
    })
  }

  /**
   * 生成文件唯一标识
   * 基于文件名和文件大小生成哈希
   */
  generateFileHash(fileName: string, fileSize: number): string {
    return `${fileName}_${fileSize}`
  }

  /**
   * 获取断点续传元数据
   */
  private async getMetadata(): Promise<ResumeMetadata> {
    const metadata = await this.localForageInstance.getItem<ResumeMetadata>(ResumeConfig.RESUME_METADATA_KEY)
    return metadata || {}
  }

  /**
   * 保存断点续传元数据
   */
  private async saveMetadata(metadata: ResumeMetadata): Promise<void> {
    await this.localForageInstance.setItem(ResumeConfig.RESUME_METADATA_KEY, metadata)
  }

  /**
   * 获取缓存键名
   */
  static getCacheKey(fileHash: string): string {
    return `${ResumeConfig.RESUME_CACHE_KEY_PREFIX}${fileHash}`
  }

  /**
   * 获取数据块键名
   * 使用文件哈希和偏移量确保唯一性
   */
  static getChunkKey(fileHash: string, offset?: number): string {
    return offset === undefined
      ? `${ResumeConfig.RESUME_CHUNK_KEY_PREFIX}${fileHash}_`
      : `${ResumeConfig.RESUME_CHUNK_KEY_PREFIX}${fileHash}_${offset}`
  }

  /**
   * 检查是否有断点续传缓存
   */
  async hasResumeCache(fileHash: string): Promise<boolean> {
    const metadata = await this.getMetadata()
    return !!metadata[fileHash]
  }

  /**
   * 获取断点续传信息
   */
  async getResumeInfo(fileHash: string): Promise<{
    startOffset: number
    hasCache: boolean
  }> {
    const metadata = await this.getMetadata()
    const cacheInfo = metadata[fileHash]

    if (!cacheInfo) {
      return { startOffset: 0, hasCache: false }
    }

    return {
      startOffset: cacheInfo.downloadedBytes,
      hasCache: true,
    }
  }

  /**
   * 创建断点续传缓存
   */
  async createResumeCache(
    fileName: string,
    fileSize: number,
  ): Promise<string> {
    const fileHash = this.generateFileHash(fileName, fileSize)
    const now = Date.now()

    const cacheItem: ResumeCacheItem = {
      fileHash,
      fileName,
      fileSize,
      downloadedBytes: 0,
      totalChunks: 0,
      createdAt: now,
      updatedAt: now,
    }

    /** 保存缓存项 */
    const cacheKey = ResumeManager.getCacheKey(fileHash)
    await this.localForageInstance.setItem(cacheKey, cacheItem)

    /** 更新元数据 */
    const metadata = await this.getMetadata()
    metadata[fileHash] = {
      fileName,
      fileSize,
      downloadedBytes: 0,
      createdAt: now,
      updatedAt: now,
    }
    await this.saveMetadata(metadata)

    console.warn(`创建断点续传缓存: ${fileHash} (${fileName})`)
    return fileHash
  }

  /**
   * 添加数据块到缓存（Web Worker 优化版本）
   * @param fileHash 文件哈希
   * @param chunk 数据块内容
   * @param offset 文件偏移量，用于确保数据的正确性
   */
  async appendChunkToCache(fileHash: string, chunk: Uint8Array, offset: number): Promise<void> {
    try {
      /** 更新缓存项的最大偏移量和总块数 */
      const cacheKey = ResumeManager.getCacheKey(fileHash)
      const cacheItem = await this.localForageInstance.getItem<ResumeCacheItem>(cacheKey)

      if (cacheItem) {
        /** 更新缓存项信息 */
        const chunkSize = chunk.byteLength
        const newOffset = offset + chunkSize
        const downloadedBytes = Math.max(cacheItem.downloadedBytes, newOffset)

        /** 更新缓存项 */
        const updatedCacheItem: ResumeCacheItem = {
          ...cacheItem,
          totalChunks: cacheItem.totalChunks + 1,
          downloadedBytes,
          updatedAt: Date.now(),
        }

        await this.localForageInstance.setItem(cacheKey, updatedCacheItem)

        /** 更新元数据 */
        const metadata = await this.getMetadata()
        if (metadata[fileHash]) {
          metadata[fileHash].downloadedBytes = downloadedBytes
          metadata[fileHash].updatedAt = Date.now()
          await this.saveMetadata(metadata)
        }
      }

      const chunkKey = ResumeManager.getChunkKey(fileHash, offset)
      const existChunk = await this.localForageInstance.getItem(chunkKey)
      if (existChunk) {
        console.warn(`数据块已存在: ${fileHash}, 偏移: ${offset}`)
        return
      }

      const workerManager = getWorkerManager()
      const chunkInfo: ChunkInfo = {
        chunkSize: chunk.byteLength,
        data: chunk,
        offset,
      }

      await workerManager.storeChunk(chunkKey, chunkInfo, ResumeConfig.localForageOptions)
    }
    catch (error) {
      console.error(`Worker appendChunk 失败: ${fileHash}, 偏移: ${offset}`, error)
      throw error
    }
  }

  /**
   * 真正的流式获取缓存数据块（内存优化版本）
   * 避免一次性加载所有数据到内存
   * 按照文件偏移量顺序逐个读取数据块
   */
  async* getCachedChunksStream(fileHash: string): AsyncGenerator<ChunkInfo, void, unknown> {
    const cacheKey = ResumeManager.getCacheKey(fileHash)
    const cacheItem = await this.localForageInstance.getItem<ResumeCacheItem>(cacheKey)

    if (!cacheItem || cacheItem.totalChunks === 0) {
      console.warn(`没有找到缓存数据: ${fileHash}`)
      return
    }

    /** 获取所有数据块键并按偏移量排序 */
    const chunkKeys = await this.getAllChunkKeys(fileHash)

    if (chunkKeys.length === 0) {
      console.warn(`没有找到数据块: ${fileHash}`)
      return
    }

    let sortedOffsets = chunkKeys
      .map((key) => {
        const offsetStr = key.split('_').pop()
        return { key, offset: Number.parseInt(offsetStr || '0', 10) }
      })
      .sort((a, b) => a.offset - b.offset)

    // ======================
    // * 校验数据偏移连续性
    // ======================
    let offsetIndex = 0
    let isInvalid = false

    for (const { offset } of sortedOffsets) {
      if (offset !== offsetIndex++ * CHUNK_SIZE) {
        Log.error(`数据块不连续: ${fileHash}，期望偏移: ${offsetIndex * CHUNK_SIZE}, 实际偏移: ${offset}， 放弃部分数据 ${offsetIndex * CHUNK_SIZE}`)

        isInvalid = true
        sortedOffsets = sortedOffsets.slice(0, offsetIndex - 1)
        break
      }
    }
    // ======================
    // * 校验数据偏移连续性
    // ======================

    console.warn(`开始恢复缓存数据: ${fileHash}, 数据块数量: ${sortedOffsets.length}`)

    for (const { key, offset } of sortedOffsets) {
      const chunkInfo = await this.localForageInstance.getItem<ChunkInfo>(key)
      if (chunkInfo && chunkInfo.data && chunkInfo.data.byteLength > 0) {
        yield chunkInfo
      }
      else {
        console.warn(`数据块损坏或为空: offset=${offset}`)
      }
    }

    if (isInvalid) {
      this.deleteResumeCache(fileHash)
      Log.warn(`数据块不连续，已删除缓存: ${fileHash}`)
    }
  }

  /**
   * 获取所有数据块的键名
   * 由于使用偏移量作为键，需要遍历所有可能的键
   */
  private async getAllChunkKeys(fileHash: string): Promise<string[]> {
    const keys: string[] = []

    /** 遍历所有存储的键，找到属于该文件的数据块 */
    await this.localForageInstance.iterate((_value, key) => {
      const prefix = ResumeManager.getChunkKey(fileHash)
      if (key.startsWith(prefix)) {
        keys.push(key)
      }
    })

    return keys
  }

  /**
   * 删除断点续传缓存（优化版本 - 删除所有相关数据块）
   */
  async deleteResumeCache(fileHash: string): Promise<void> {
    try {
      const cacheKey = ResumeManager.getCacheKey(fileHash)
      const cacheItem = await this.localForageInstance.getItem<ResumeCacheItem>(cacheKey)

      /** 删除所有数据块 - 使用正确的方式获取所有数据块键 */
      if (cacheItem && cacheItem.totalChunks > 0) {
        const deletePromises: Promise<void>[] = []

        /** 获取所有实际存在的数据块键 */
        const chunkKeys = await this.getAllChunkKeys(fileHash)

        for (const chunkKey of chunkKeys) {
          deletePromises.push(this.localForageInstance.removeItem(chunkKey))
        }

        /** 并行删除所有数据块 */
        await Promise.all(deletePromises)
        console.warn(`删除数据块: ${fileHash}, 数量: ${chunkKeys.length}`)
      }

      /** 删除缓存项 */
      await this.localForageInstance.removeItem(cacheKey)

      /** 更新元数据 */
      const metadata = await this.getMetadata()
      delete metadata[fileHash]
      await this.saveMetadata(metadata)

      console.warn(`删除断点续传缓存成功: ${fileHash}`)
    }
    catch (error) {
      console.error(`删除断点续传缓存失败: ${fileHash}`, error)
      throw new Error(`删除断点续传缓存失败: ${error}`)
    }
  }

  /**
   * 获取所有缓存信息
   */
  async getAllCacheInfo(): Promise<ResumeMetadata> {
    return this.getMetadata()
  }

  /**
   * 清理过期缓存
   */
  async cleanupExpiredCache(expireDays: number = 7): Promise<{
    cleanedCount: number
    freedBytes: number
  }> {
    const metadata = await this.getMetadata()
    const expireTime = Date.now() - (expireDays * 24 * 60 * 60 * 1000)

    let cleanedCount = 0
    let freedBytes = 0

    for (const [fileHash, info] of Object.entries(metadata)) {
      if (info.updatedAt < expireTime) {
        freedBytes += info.downloadedBytes
        await this.deleteResumeCache(fileHash)
        cleanedCount++
      }
    }

    console.warn(`清理过期缓存: ${cleanedCount} 个文件, 释放 ${freedBytes} 字节`)
    return { cleanedCount, freedBytes }
  }

  /**
   * 清理所有缓存
   */
  async clearAllCache(): Promise<{
    cleanedCount: number
    freedBytes: number
  }> {
    const metadata = await this.getMetadata()
    let cleanedCount = 0
    let freedBytes = 0

    for (const [fileHash, info] of Object.entries(metadata)) {
      freedBytes += info.downloadedBytes
      await this.deleteResumeCache(fileHash)
      cleanedCount++
    }

    console.warn(`清理所有缓存: ${cleanedCount} 个文件, 释放 ${freedBytes} 字节`)
    return { cleanedCount, freedBytes }
  }

  /**
   * 获取详细缓存统计信息（包含数据块数量）
   * 注意：此方法需要异步查询 IndexedDB，性能较慢
   * 推荐使用 useResumeCache.getCacheStats() 获取基础统计信息
   */
  async getCacheStats(): Promise<{
    totalFiles: number
    totalSize: number
    totalChunks: number
  }> {
    const metadata = await this.getMetadata()
    let totalFiles = 0
    let totalSize = 0
    let totalChunks = 0

    for (const [fileHash, info] of Object.entries(metadata)) {
      totalFiles++
      totalSize += info.downloadedBytes

      /** 获取数据块数量 */
      const cacheKey = ResumeManager.getCacheKey(fileHash)
      const cacheItem = await this.localForageInstance.getItem<ResumeCacheItem>(cacheKey)
      if (cacheItem) {
        totalChunks += cacheItem.totalChunks
      }
    }

    return { totalFiles, totalSize, totalChunks }
  }

  /**
   * 清理资源
   * 在不再使用 ResumeManager 时调用，清理 Web Worker 等资源
   */
  cleanup(): void {
    cleanupWorkerManager()
  }
}

/**
 * 断点续传缓存项（优化后，不再存储 chunks 数组）
 */
export type ResumeCacheItem = {
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
 * 断点续传元数据
 */
export type ResumeMetadata = {
  [fileHash: string]: {
    fileName: string
    fileSize: number
    downloadedBytes: number
    createdAt: number
    updatedAt: number
  }
}
