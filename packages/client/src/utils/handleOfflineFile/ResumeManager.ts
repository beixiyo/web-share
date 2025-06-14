import localforage from 'localforage'

/** 断点续传缓存键前缀 */
const RESUME_CACHE_KEY_PREFIX = 'resume_cache_'
/** 断点续传元数据键 */
const RESUME_METADATA_KEY = 'resume_metadata'

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
  /** 缓存的数据块 */
  chunks: ArrayBuffer[]
  /** 创建时间 */
  createdAt: number
  /** 最后更新时间 */
  updatedAt: number
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

/**
 * 断点续传管理器
 * 负责管理文件传输的断点续传缓存
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
      chunks: [],
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

    console.log(`创建断点续传缓存: ${fileHash} (${fileName})`)
    return fileHash
  }

  /**
   * 添加数据块到缓存
   */
  async appendChunk(fileHash: string, chunk: ArrayBuffer): Promise<void> {
    const cacheKey = this.getCacheKey(fileHash)
    const cacheItem = await this.localForageInstance.getItem<ResumeCacheItem>(cacheKey)

    if (!cacheItem) {
      throw new Error(`断点续传缓存不存在: ${fileHash}`)
    }

    /** 添加数据块 */
    cacheItem.chunks.push(chunk)
    cacheItem.downloadedBytes += chunk.byteLength
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

    console.log(`添加数据块到缓存: ${fileHash}, 大小: ${chunk.byteLength}, 总计: ${cacheItem.downloadedBytes}`)
  }

  /**
   * 获取缓存的所有数据块
   */
  async getCachedChunks(fileHash: string): Promise<ArrayBuffer[]> {
    try {
      const cacheKey = this.getCacheKey(fileHash)
      const cacheItem = await this.localForageInstance.getItem<ResumeCacheItem>(cacheKey)

      if (!cacheItem || !cacheItem.chunks) {
        return []
      }

      console.warn(`获取缓存数据块: ${fileHash}, 数量: ${cacheItem.chunks.length}`)
      return cacheItem.chunks
    } catch (error) {
      console.error(`获取缓存数据块失败: ${fileHash}`, error)
      return []
    }
  }

  /**
   * 删除断点续传缓存
   */
  async deleteResumeCache(fileHash: string): Promise<void> {
    const cacheKey = this.getCacheKey(fileHash)
    await this.localForageInstance.removeItem(cacheKey)

    /** 更新元数据 */
    const metadata = await this.getMetadata()
    delete metadata[fileHash]
    await this.saveMetadata(metadata)

    console.log(`删除断点续传缓存: ${fileHash}`)
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

    console.log(`清理过期缓存: ${cleanedCount} 个文件, 释放 ${freedBytes} 字节`)
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

    console.log(`清理所有缓存: ${cleanedCount} 个文件, 释放 ${freedBytes} 字节`)
    return { cleanedCount, freedBytes }
  }
}
