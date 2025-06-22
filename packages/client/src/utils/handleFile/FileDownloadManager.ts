import type { FileMeta, ProgressData, ResumeInfo } from 'web-share-common'
import type { FileInfo } from '@/types/fileInfo'
import { createStreamDownloader, type MIMEType, retryTask, type StreamDownloader } from '@jl-org/tool'
import { Action } from 'web-share-common'
import { ResumeManager } from '@/utils/handleOfflineFile'

/**
 * 独立的文件下载管理器
 * 负责文件接收和缓存管理、缓冲区管理和流式下载
 */
export class FileDownloadManager {
  private config: FileDownloadConfig

  private downloader?: StreamDownloader
  private downloadRafId?: number
  private downloadBuffer: Uint8Array[] = []

  /** 添加数据块计数器，用于计算文件偏移量 */
  private dataChunkCounter: number = 0
  /** 当前文件的起始偏移量（断点续传时使用） */
  private currentStartOffset: number = 0

  private fileMetaCache: FileMeta[] = []
  private resumeManager: ResumeManager
  private currentFileHash?: string
  private currentFileIndex: number = -1

  constructor(config: FileDownloadConfig) {
    this.config = config
    this.resumeManager = new ResumeManager()
  }

  /**
   * 开始接收文件队列
   */
  async start(fileMetas: FileMeta[]): Promise<void> {
    this.setFileMetaCache(fileMetas)
    this.currentFileIndex = -1
    await this.prepareNextFile()
  }

  /**
   * 为下一个文件准备下载环境
   */
  private async prepareNextFile(): Promise<void> {
    this.currentFileIndex++
    if (this.currentFileIndex >= this.fileMetaCache.length) {
      console.warn('所有文件接收完成')
      this.cleanup()
      return
    }

    const fileMeta = this.fileMetaCache[this.currentFileIndex]
    this.currentFileHash = fileMeta.fileHash

    if (!this.currentFileHash) {
      this.config.onError?.('文件缺少 fileHash，无法处理')
      return
    }

    /** 检查是否有缓存并获取断点续传信息 */
    const resumeInfo = await this.resumeManager.getResumeInfo(this.currentFileHash)

    /** 创建下载器 */
    this.downloader = await createStreamDownloader(fileMeta.name, {
      swPath: '/sw.js',
      contentLength: fileMeta.size,
      mimeType: fileMeta.type as MIMEType,
    })

    /**
     * 避免缓存恢复和新数据接收之间的竞态条件
     */
    if (resumeInfo.hasCache) {
      console.warn(`开始恢复缓存数据: ${this.currentFileHash}`)
      await this.restoreCachedData()
    }

    /** 开始处理缓冲区 */
    this.appendDownloadBuffer()

    /** 发送准备就绪消息，包含偏移量 */
    const response: ResumeInfo = {
      fileHash: this.currentFileHash,
      startOffset: resumeInfo.startOffset,
      hasCache: resumeInfo.hasCache,
      fromId: fileMeta.fromId, // fromId in fileMeta is the sender's peerId
    }

    // @9. [接收方] 发送准备下载响应
    this.config.sendJSON({
      type: Action.ResumeInfo,
      data: response,
    })

    console.warn(`准备接收文件: ${fileMeta.name}, 缓存: ${resumeInfo.hasCache}, 偏移: ${resumeInfo.startOffset}`)
  }

  /**
   * 重置数据块计数器，在每次开始新文件传输时调用
   * @param startOffset 断点续传的起始偏移量，用于正确初始化计数器
   */
  resetDataChunkCounter(startOffset: number = 0): void {
    this.dataChunkCounter = 0
    this.currentStartOffset = startOffset
    console.warn(`重置数据块计数器: startOffset=${startOffset}, chunkSize=${this.config.chunkSize}, 将从偏移量 ${startOffset} 开始接收`)
  }

  /**
   * 完成文件下载
   */
  async download(): Promise<void> {
    try {
      if (!this.downloader) {
        throw new Error('下载器未初始化')
      }

      /** 完成下载并等待文件保存 */
      await this.downloader.complete()
    }
    catch (error) {
      const errorMessage = `文件下载完成失败: ${error}`
      console.error(errorMessage)
      this.config.onError?.(errorMessage)
      throw error
    }
  }

  /**
   * 写入文件缓冲区
   */
  async writeFileBuffer(data: Uint8Array | ArrayBufferLike): Promise<void> {
    try {
      await this.downloader?.append(
        data instanceof Uint8Array
          ? data
          : new Uint8Array(data),
      )
    }
    catch (error) {
      this.config.onError?.(`写入文件缓冲区失败: ${error}`)
      throw error
    }
  }

  /**
   * 接收数据块
   */
  receiveDataChunk(data: Uint8Array): void {
    /** 创建数据的安全拷贝，避免 detached buffer 问题 */
    const safeData = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))

    this.downloadBuffer.push(safeData)

    /** 如果有当前文件哈希，将数据块添加到断点续传缓存 */
    if (this.currentFileHash) {
      /**
       * 偏移量 = 起始偏移量 + 已接收的数据块总大小
       */
      const currentOffset = this.currentStartOffset + (this.dataChunkCounter * this.config.chunkSize)

      this.dataChunkCounter++

      /** 异步添加到缓存，使用安全的数据拷贝 */
      this.resumeManager.appendChunkToCache(this.currentFileHash, safeData, currentOffset)
        .catch((error) => {
          console.error('添加数据块到缓存失败:', error)
          /** 记录详细的错误信息用于调试 */
          console.error('错误详情:', {
            fileHash: this.currentFileHash,
            offset: currentOffset,
            dataLength: safeData.byteLength,
            bufferDetached: safeData.buffer.byteLength === 0 && safeData.byteLength > 0,
            error: error.message,
          })
        })
    }
  }

  /**
   * 处理文件开始消息
   */
  async handleNewFile(fileInfo: FileInfo): Promise<void> {
    if (this.config.isChannelClosed()) {
      this.config.onError?.('通道已关闭，无法开始文件下载')
      return
    }

    const fileHash = this.resumeManager.generateFileHash(fileInfo.name, fileInfo.size)
    if (fileHash !== this.currentFileHash) {
      this.config.onError?.('收到的新文件与预期的不符')
      return
    }

    /** 检查是否有现有缓存并获取断点续传信息 */
    const resumeInfo = await this.resumeManager.getResumeInfo(this.currentFileHash)

    if (!resumeInfo.hasCache) {
      /** 创建新的断点续传缓存 */
      await this.resumeManager.createResumeCache(fileInfo.name, fileInfo.size)
    }

    /** 根据断点续传信息正确初始化数据块计数器 */
    this.resetDataChunkCounter(resumeInfo.startOffset)
  }

  /**
   * 处理文件完成消息
   */
  async handleFileDone(): Promise<void> {
    // @17. [接收方] 收到文件完成信号，完成文件下载，清理所有数据
    this.stopAllRaf()
    await this.appendBuffer()

    try {
      /** 完成文件下载 */
      await this.download()

      /** 文件下载成功，清理断点续传缓存 */
      if (this.currentFileHash) {
        await this.cleanupResumeCache(this.currentFileHash)
        this.currentFileHash = undefined
      }

      /** 准备接收下一个文件 */
      await this.prepareNextFile()
    }
    catch (error) {
      console.error('文件下载完成处理失败:', error)
      /** 即使下载失败，也要尝试清理缓存以避免数据残留 */
      if (this.currentFileHash) {
        try {
          await this.cleanupResumeCache(this.currentFileHash)
          this.currentFileHash = undefined
        }
        catch (cleanupError) {
          console.error('清理缓存失败:', cleanupError)
        }
      }
      throw error
    }
  }

  /**
   * 处理进度更新
   */
  handleProgress(progressData: ProgressData): void {
    this.config.onProgress?.(progressData)
  }

  /**
   * 设置文件元数据缓存
   */
  setFileMetaCache(fileMetas: FileMeta[]): void {
    this.fileMetaCache = [...fileMetas]
  }

  /**
   * 获取文件元数据缓存
   */
  getFileMetaCache(): FileMeta[] {
    return [...this.fileMetaCache]
  }

  /**
   * 恢复缓存的数据到下载缓冲区（优化版本 - 流式处理）
   */
  private async restoreCachedData(): Promise<void> {
    if (!this.currentFileHash) {
      return
    }

    try {
      /** 使用流式处理，避免一次性加载所有数据到内存 */
      const chunkStream = this.resumeManager.getCachedChunksStream(this.currentFileHash)
      let chunkCount = 0

      /** 流式处理每个数据块 */
      for await (const chunk of chunkStream) {
        await this.writeFileBuffer(chunk)
        chunkCount++

        /** 每处理100个数据块输出一次进度 */
        if (chunkCount % 100 === 0) {
          console.warn(`恢复缓存数据进度: ${this.currentFileHash}, 已处理: ${chunkCount} 个数据块`)
        }
      }

      if (chunkCount > 0) {
        console.warn(`缓存数据恢复完成: ${this.currentFileHash}, 总计: ${chunkCount} 个数据块`)
      }
    }
    catch (error) {
      console.error('恢复缓存数据失败:', error)
      /**
       * 恢复失败不应该阻止文件下载，只是记录错误
       * 如果缓存损坏，可以考虑清理缓存
       */
      if (this.currentFileHash) {
        try {
          await this.resumeManager.deleteResumeCache(this.currentFileHash)
          console.warn(`缓存损坏已清理: ${this.currentFileHash}`)
        }
        catch (cleanupError) {
          console.error('清理损坏缓存失败:', cleanupError)
        }
      }
    }
  }

  /**
   * 清理断点续传缓存
   * 提供重试机制和详细的错误处理
   */
  private async cleanupResumeCache(fileHash: string, maxRetries: number = 3): Promise<void> {
    const rmCache = async () => {
      /** 删除断点续传缓存 */
      await this.resumeManager.deleteResumeCache(fileHash)

      /** 验证缓存是否真正被清理 */
      const hasCache = await this.resumeManager.hasResumeCache(fileHash)
      if (hasCache) {
        return Promise.reject(new Error('缓存清理后仍然存在，可能清理失败'))
      }

      console.warn(`断点续传缓存清理成功: ${fileHash}`)
    }

    return retryTask(rmCache, maxRetries)
      .catch(() => {
        /** 所有重试都失败了 */
        console.error(`清理断点续传缓存最终失败: ${fileHash}`)
        throw new Error(`清理断点续传缓存失败`)
      })
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    this.stopAllRaf()
    this.downloadBuffer = []
    this.fileMetaCache = []
    this.downloader = undefined
    this.currentFileHash = undefined
    this.currentFileIndex = -1
  }

  /**
   * 处理下载缓冲区数据
   */
  private async appendBuffer(): Promise<void> {
    let data = this.downloadBuffer.shift()
    while (data) {
      await this.writeFileBuffer(data)
      data = this.downloadBuffer.shift()
    }
  }

  /**
   * 启动下载缓冲区处理循环
   */
  private appendDownloadBuffer(): void {
    const consume = () => {
      const id = requestAnimationFrame(async () => {
        try {
          await this.appendBuffer()
          this.downloadRafId = id
          if (!this.config.isChannelClosed()) {
            requestAnimationFrame(consume)
          }
        }
        catch (error) {
          this.config.onError?.(`处理下载缓冲区失败: ${error}`)
        }
      })
    }

    consume()
  }

  /**
   * 停止所有动画帧请求
   */
  private stopAllRaf(): void {
    this.downloadRafId && cancelAnimationFrame(this.downloadRafId)
    this.downloadRafId = undefined
  }
}

/**
 * 文件下载管理器配置
 */
export interface FileDownloadConfig {
  /** 发送JSON消息的方法 */
  sendJSON: (data: any) => void
  /** 进度回调 */
  onProgress?: (data: ProgressData) => void
  /** 错误处理回调 */
  onError?: (error: string) => void
  /** 检查通道是否关闭 */
  isChannelClosed: () => boolean
  chunkSize: number
}
