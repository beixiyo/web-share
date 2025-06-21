import localforage from 'localforage'

/** 断点续传缓存键前缀 */
const RESUME_CACHE_KEY_PREFIX = 'resume_cache_'
/** 断点续传数据块键前缀 */
const RESUME_CHUNK_KEY_PREFIX = 'resume_chunk_'
/** 断点续传元数据键 */
const RESUME_METADATA_KEY = 'resume_metadata'

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
    const metadata = await this.localForageInstance.getItem<ResumeMetadata>(RESUME_METADATA_KEY)
    return metadata || {}
  }

  /**
   * 保存断点续传元数据
   */
  private async saveMetadata(metadata: ResumeMetadata): Promise<void> {
    await this.localForageInstance.setItem(RESUME_METADATA_KEY, metadata)
  }

  /**
   * 获取缓存键名
   */
  private getCacheKey(fileHash: string): string {
    return `${RESUME_CACHE_KEY_PREFIX}${fileHash}`
  }

  /**
   * 获取数据块键名
   */
  private getChunkKey(fileHash: string, chunkIndex: number): string {
    return `${RESUME_CHUNK_KEY_PREFIX}${fileHash}_${chunkIndex}`
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
    const cacheKey = this.getCacheKey(fileHash)
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
   * 添加数据块到缓存（优化版本 - 分片存储）
   */
  async appendChunk(fileHash: string, chunk: ArrayBuffer): Promise<void> {
    const cacheKey = this.getCacheKey(fileHash)
    const cacheItem = await this.localForageInstance.getItem<ResumeCacheItem>(cacheKey)

    if (!cacheItem) {
      throw new Error(`断点续传缓存不存在: ${fileHash}`)
    }

    /** 计算当前数据块索引 */
    const chunkIndex = cacheItem.totalChunks

    /** 创建数据块信息 */
    const chunkInfo: ChunkInfo = {
      chunkIndex,
      chunkSize: chunk.byteLength,
      data: chunk,
    }

    /** 单独存储数据块，避免读取所有数据块 */
    const chunkKey = this.getChunkKey(fileHash, chunkIndex)
    await this.localForageInstance.setItem(chunkKey, chunkInfo)

    /** 更新缓存项元数据（不包含实际数据） */
    cacheItem.downloadedBytes += chunk.byteLength
    cacheItem.totalChunks += 1
    cacheItem.updatedAt = Date.now()

    /** 保存更新的缓存项 */
    await this.localForageInstance.setItem(cacheKey, cacheItem)

    /** 更新元数据 */
    const metadata = await this.getMetadata()
    if (metadata[fileHash]) {
      metadata[fileHash].downloadedBytes = cacheItem.downloadedBytes
      metadata[fileHash].updatedAt = cacheItem.updatedAt
      await this.saveMetadata(metadata)
    }

    console.log(`添加数据块到缓存: ${fileHash}, 索引: ${chunkIndex}, 大小: ${chunk.byteLength}, 总计: ${cacheItem.downloadedBytes}`)
  }

  /**
   * 流式获取缓存数据块（推荐使用）
   * 避免一次性加载所有数据到内存
   */
  async* getCachedChunksStream(fileHash: string): AsyncGenerator<ArrayBuffer, void, unknown> {
    try {
      const cacheKey = this.getCacheKey(fileHash)
      const cacheItem = await this.localForageInstance.getItem<ResumeCacheItem>(cacheKey)

      if (!cacheItem || cacheItem.totalChunks === 0) {
        return
      }

      console.warn(`开始流式读取缓存数据块: ${fileHash}, 总数: ${cacheItem.totalChunks}`)

      /** 按顺序流式读取数据块 */
      for (let i = 0; i < cacheItem.totalChunks; i++) {
        const chunkKey = this.getChunkKey(fileHash, i)
        const chunkInfo = await this.localForageInstance.getItem<ChunkInfo>(chunkKey)

        if (chunkInfo && chunkInfo.data) {
          yield chunkInfo.data
        }
        else {
          console.error(`数据块缺失: ${fileHash}, 索引: ${i}`)
          throw new Error(`数据块缺失: ${fileHash}, 索引: ${i}`)
        }
      }

      console.warn(`流式读取缓存数据块完成: ${fileHash}`)
    }
    catch (error) {
      console.error(`流式读取缓存数据块失败: ${fileHash}`, error)
      throw error
    }
  }

  /**
   * 删除断点续传缓存（优化版本 - 删除所有相关数据块）
   */
  async deleteResumeCache(fileHash: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(fileHash)
      const cacheItem = await this.localForageInstance.getItem<ResumeCacheItem>(cacheKey)

      /** 删除所有数据块 */
      if (cacheItem && cacheItem.totalChunks > 0) {
        const deletePromises: Promise<void>[] = []

        for (let i = 0; i < cacheItem.totalChunks; i++) {
          const chunkKey = this.getChunkKey(fileHash, i)
          deletePromises.push(this.localForageInstance.removeItem(chunkKey))
        }

        /** 并行删除所有数据块 */
        await Promise.all(deletePromises)
        console.warn(`删除数据块: ${fileHash}, 数量: ${cacheItem.totalChunks}`)
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
   * 获取缓存统计信息
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
      const cacheKey = this.getCacheKey(fileHash)
      const cacheItem = await this.localForageInstance.getItem<ResumeCacheItem>(cacheKey)
      if (cacheItem) {
        totalChunks += cacheItem.totalChunks
      }
    }

    return { totalFiles, totalSize, totalChunks }
  }

  /**
   * 验证缓存完整性
   */
  async validateCacheIntegrity(fileHash: string): Promise<{
    isValid: boolean
    missingChunks: number[]
    totalChunks: number
  }> {
    try {
      const cacheKey = this.getCacheKey(fileHash)
      const cacheItem = await this.localForageInstance.getItem<ResumeCacheItem>(cacheKey)

      if (!cacheItem) {
        return { isValid: false, missingChunks: [], totalChunks: 0 }
      }

      const missingChunks: number[] = []

      /** 检查每个数据块是否存在 */
      for (let i = 0; i < cacheItem.totalChunks; i++) {
        const chunkKey = this.getChunkKey(fileHash, i)
        const chunkInfo = await this.localForageInstance.getItem<ChunkInfo>(chunkKey)

        if (!chunkInfo || !chunkInfo.data) {
          missingChunks.push(i)
        }
      }

      return {
        isValid: missingChunks.length === 0,
        missingChunks,
        totalChunks: cacheItem.totalChunks,
      }
    }
    catch (error) {
      console.error(`验证缓存完整性失败: ${fileHash}`, error)
      return { isValid: false, missingChunks: [], totalChunks: 0 }
    }
  }
}

/**
 * 断点续传缓存项（优化后，不再存储 chunks 数组）
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
 * 数据块信息
 */
export type ChunkInfo = {
  /** 数据块索引 */
  chunkIndex: number
  /** 数据块大小 */
  chunkSize: number
  /** 数据块数据 */
  data: ArrayBuffer
}

/**
 * 断点续传元数据
 */
export interface ResumeMetadata {
  [fileHash: string]: {
    fileName: string
    fileSize: number
    downloadedBytes: number
    createdAt: number
    updatedAt: number
  }
}
