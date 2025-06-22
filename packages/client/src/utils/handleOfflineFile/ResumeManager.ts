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
   * @param fileHash 文件哈希
   * @param offset 文件偏移量（字节位置）
   */
  private getChunkKey(fileHash: string, offset: number): string {
    return `${RESUME_CHUNK_KEY_PREFIX}${fileHash}_${offset}`
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
   * @param fileHash 文件哈希
   * @param chunk 数据块内容
   * @param offset 文件偏移量，用于确保数据的正确性
   */
  async appendChunk(fileHash: string, chunk: Uint8Array, offset: number): Promise<void> {
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

    const cacheKey = this.getCacheKey(fileHash)
    const cacheItem = await this.localForageInstance.getItem<ResumeCacheItem>(cacheKey)

    if (!cacheItem) {
      throw new Error(`断点续传缓存不存在: ${fileHash}`)
    }

    /** 检查是否已存在相同偏移量的数据块，避免重复存储 */
    const chunkKey = this.getChunkKey(fileHash, offset)
    const existingChunk = await this.localForageInstance.getItem<ChunkInfo>(chunkKey)

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

    /** 事务性操作: 同时更新元数据和存储数据块 */
    try {
      /** 先保存数据块，确保数据写入完成 */
      await this.localForageInstance.setItem(chunkKey, chunkInfo)

      /** 更新缓存项元数据 */
      cacheItem.downloadedBytes = Math.max(cacheItem.downloadedBytes, offset + safeChunk.byteLength)
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
    }
    catch (error) {
      console.error(`添加数据块到缓存失败: ${fileHash}, 偏移: ${offset}`, error)
      /** 如果元数据更新失败，尝试清理已存储的数据块 */
      try {
        await this.localForageInstance.removeItem(chunkKey)
      }
      catch (cleanupError) {
        console.error(`清理失败的数据块失败: ${fileHash}, 偏移: ${offset}`, cleanupError)
      }
      throw error
    }
  }

  /**
   * 真正的流式获取缓存数据块（内存优化版本）
   * 避免一次性加载所有数据到内存
   * 按照文件偏移量顺序逐个读取数据块
   */
  async* getCachedChunksStream(fileHash: string): AsyncGenerator<Uint8Array, void, unknown> {
    try {
      const cacheKey = this.getCacheKey(fileHash)
      const cacheItem = await this.localForageInstance.getItem<ResumeCacheItem>(cacheKey)

      if (!cacheItem || cacheItem.totalChunks === 0) {
        return
      }

      /** 获取所有数据块键并按偏移量排序 */
      const chunkKeys = await this.getAllChunkKeys(fileHash, cacheItem.totalChunks)

      /** 提取偏移量并排序，避免加载实际数据 */
      const sortedOffsets = chunkKeys
        .map((key) => {
          const offsetStr = key.split('_').pop()
          return { key, offset: Number.parseInt(offsetStr || '0', 10) }
        })
        .sort((a, b) => a.offset - b.offset)

      /** 按顺序逐个读取和输出数据块 */
      for (const { key } of sortedOffsets) {
        const chunkInfo = await this.localForageInstance.getItem<ChunkInfo>(key)
        if (chunkInfo && chunkInfo.data) {
          yield chunkInfo.data
        }
      }
    }
    catch (error) {
      console.error(`流式读取缓存数据块失败: ${fileHash}`, error)
      throw error
    }
  }

  /**
   * 获取所有数据块的键名
   * 由于使用偏移量作为键，需要遍历所有可能的键
   */
  private async getAllChunkKeys(fileHash: string, _totalChunks: number): Promise<string[]> {
    const keys: string[] = []

    /** 遍历所有存储的键，找到属于该文件的数据块 */
    await this.localForageInstance.iterate((_value, key) => {
      if (key.startsWith(`${RESUME_CHUNK_KEY_PREFIX}${fileHash}_`)) {
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
      const cacheKey = this.getCacheKey(fileHash)
      const cacheItem = await this.localForageInstance.getItem<ResumeCacheItem>(cacheKey)

      /** 删除所有数据块 - 使用正确的方式获取所有数据块键 */
      if (cacheItem && cacheItem.totalChunks > 0) {
        const deletePromises: Promise<void>[] = []

        /** 获取所有实际存在的数据块键 */
        const chunkKeys = await this.getAllChunkKeys(fileHash, cacheItem.totalChunks)

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
    missingOffsets: number[]
    totalChunks: number
    actualChunks: number
  }> {
    try {
      const cacheKey = this.getCacheKey(fileHash)
      const cacheItem = await this.localForageInstance.getItem<ResumeCacheItem>(cacheKey)

      if (!cacheItem) {
        return { isValid: false, missingOffsets: [], totalChunks: 0, actualChunks: 0 }
      }

      /** 获取所有实际存在的数据块 */
      const chunkKeys = await this.getAllChunkKeys(fileHash, cacheItem.totalChunks)
      const existingOffsets: number[] = []
      const missingOffsets: number[] = []

      /** 检查每个数据块的完整性 */
      for (const chunkKey of chunkKeys) {
        const chunkInfo = await this.localForageInstance.getItem<ChunkInfo>(chunkKey)
        if (chunkInfo && chunkInfo.data && chunkInfo.offset !== undefined) {
          existingOffsets.push(chunkInfo.offset)
        }
      }

      /** 验证数据块的连续性（从0开始到downloadedBytes） */
      existingOffsets.sort((a, b) => a - b)

      /** 检查是否有缺失的偏移量 */
      let expectedOffset = 0
      for (const offset of existingOffsets) {
        if (offset > expectedOffset) {
          /** 有缺失的数据块 */
          for (let missing = expectedOffset; missing < offset; missing += 1024) { // 假设块大小为1024
            missingOffsets.push(missing)
          }
        }
        expectedOffset = offset + 1024 // 假设每个块大小为1024字节
      }

      return {
        isValid: missingOffsets.length === 0 && existingOffsets.length > 0,
        missingOffsets,
        totalChunks: cacheItem.totalChunks,
        actualChunks: existingOffsets.length,
      }
    }
    catch (error) {
      console.error(`验证缓存完整性失败: ${fileHash}`, error)
      return { isValid: false, missingOffsets: [], totalChunks: 0, actualChunks: 0 }
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
  /** 数据块大小 */
  chunkSize: number
  /** 数据块数据 */
  data: Uint8Array
  /** 文件偏移量 */
  offset: number
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
