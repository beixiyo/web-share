import type { FileMeta, ProgressData, ResumeInfo, ResumeRequest } from 'web-share-common'
import type { FileInfo } from '@/types/fileInfo'
import { createStreamDownloader, retryTask, type StreamDownloader } from '@jl-org/tool'
import { Action } from 'web-share-common'
import { ResumeManager } from '@/utils/handleOfflineFile'

/**
 * 独立的文件下载管理器
 * 负责处理文件接收、缓冲区管理和流式下载
 */
export class FileDownloadManager {
  private config: FileDownloadConfig

  private downloader?: StreamDownloader
  private downloadRafId: number[] = []
  private downloadBuffer: Uint8Array[] = []

  private fileMetaCache: FileMeta[] = []
  private resumeManager: ResumeManager
  private currentFileHash?: string

  constructor(config: FileDownloadConfig) {
    this.config = config
    this.resumeManager = new ResumeManager()
  }

  /**
   * 创建文件下载器
   */
  async createFile(fileInfo: FileInfo): Promise<void> {
    try {
      console.log('创建文件下载器:', fileInfo)
      this.downloader = await createStreamDownloader(fileInfo.name, {
        swPath: '/sw.js',
        contentLength: fileInfo.size,
        mimeType: fileInfo.type,
      })

      /** 如果有缓存数据，恢复到下载缓冲区 */
      if (this.currentFileHash) {
        await this.restoreCachedData()
      }

      /** 开始处理缓冲区 */
      this.appendDownloadBuffer()
    }
    catch (error) {
      this.config.onError?.(`创建文件下载器失败: ${error}`)
      throw error
    }
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
    this.downloadBuffer.push(data)

    /** 如果有当前文件哈希，将数据块添加到断点续传缓存 */
    if (this.currentFileHash) {
      const arrayBuffer = data.buffer instanceof ArrayBuffer
        ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        : new ArrayBuffer(data.byteLength)

      if (!(data.buffer instanceof ArrayBuffer)) {
        new Uint8Array(arrayBuffer).set(data)
      }

      this.resumeManager.appendChunk(this.currentFileHash, arrayBuffer)
        .catch((error) => {
          console.warn('添加数据块到缓存失败:', error)
        })
    }
  }

  /**
   * 处理断点续传请求
   */
  async handleResumeRequest(resumeRequest: ResumeRequest): Promise<void> {
    const { fileHash, fileName } = resumeRequest

    /** 检查是否有缓存 */
    const resumeInfo = await this.resumeManager.getResumeInfo(fileHash)

    /** 发送断点续传信息响应 */
    const response: ResumeInfo = {
      fileHash,
      startOffset: resumeInfo.startOffset,
      hasCache: resumeInfo.hasCache,
      fromId: resumeRequest.fromId, // 使用请求方的ID作为响应目标
    }

    this.config.sendJSON({
      type: Action.ResumeInfo,
      data: response,
    })

    console.warn(`断点续传请求: ${fileName}, 缓存: ${resumeInfo.hasCache}, 偏移: ${resumeInfo.startOffset}`)
  }

  /**
   * 处理文件开始消息
   */
  async handleNewFile(fileInfo: FileInfo): Promise<void> {
    if (this.config.isChannelClosed()) {
      this.config.onError?.('通道已关闭，无法开始文件下载')
      return
    }

    /** 生成文件哈希并创建缓存 */
    this.currentFileHash = this.resumeManager.generateFileHash(fileInfo.name, fileInfo.size)

    /** 检查是否有现有缓存 */
    const hasCache = await this.resumeManager.hasResumeCache(this.currentFileHash)

    if (!hasCache) {
      /** 创建新的断点续传缓存 */
      await this.resumeManager.createResumeCache(fileInfo.name, fileInfo.size)
    }

    await this.createFile(fileInfo)
  }

  /**
   * 处理文件完成消息
   */
  async handleFileDone(): Promise<void> {
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

      console.log('文件下载和缓存清理完成')
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
   * 处理文件元数据并立即返回断点续传信息
   */
  async handleFileMetasForResume(fileMetas: FileMeta[]): Promise<void> {
    for (const fileMeta of fileMetas) {
      if (fileMeta.fileHash) {
        /** 检查是否有缓存并返回断点续传信息 */
        const resumeInfo = await this.resumeManager.getResumeInfo(fileMeta.fileHash)

        const response: ResumeInfo = {
          fileHash: fileMeta.fileHash,
          startOffset: resumeInfo.startOffset,
          hasCache: resumeInfo.hasCache,
          fromId: fileMeta.fromId, // 返回给发送方
        }

        this.config.sendJSON({
          type: Action.ResumeInfo,
          data: response,
        })

        console.warn(`文件元数据断点续传检查: ${fileMeta.name}, 缓存: ${resumeInfo.hasCache}, 偏移: ${resumeInfo.startOffset}`)
      }
    }
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
   * 恢复缓存的数据到下载缓冲区
   */
  private async restoreCachedData(): Promise<void> {
    if (!this.currentFileHash) {
      return
    }

    try {
      const cachedChunks = await this.resumeManager.getCachedChunks(this.currentFileHash)

      if (cachedChunks.length > 0) {
        console.warn(`恢复缓存数据: ${this.currentFileHash}, 数据块数量: ${cachedChunks.length}`)

        /** 将缓存的数据块写入 StreamDownloader */
        for (const chunk of cachedChunks) {
          await this.writeFileBuffer(new Uint8Array(chunk))
        }

        console.warn(`缓存数据恢复完成: ${this.currentFileHash}`)
      }
    }
    catch (error) {
      console.error('恢复缓存数据失败:', error)
      /** 恢复失败不应该阻止文件下载，只是记录错误 */
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

      console.log(`断点续传缓存清理成功: ${fileHash}`)
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
          this.downloadRafId.push(id)
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
    this.downloadRafId.forEach(cancelAnimationFrame)
    this.downloadRafId = []
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
}
