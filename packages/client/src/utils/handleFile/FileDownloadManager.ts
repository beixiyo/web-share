import type { FileMeta, ProgressData } from 'web-share-common'
import type { FileInfo } from '@/types/fileInfo'
import { createStreamDownloader, type StreamDownloader } from '@jl-org/tool'

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

  constructor(config: FileDownloadConfig) {
    this.config = config
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
      await this.downloader?.complete()
      console.log('文件下载完成')
    }
    catch (error) {
      this.config.onError?.(`文件下载完成失败: ${error}`)
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
  }

  /**
   * 处理文件开始消息
   */
  async handleNewFile(fileInfo: FileInfo): Promise<void> {
    if (this.config.isChannelClosed()) {
      this.config.onError?.('通道已关闭，无法开始文件下载')
      return
    }

    await this.createFile(fileInfo)
  }

  /**
   * 处理文件完成消息
   */
  async handleFileDone(): Promise<void> {
    this.stopAllRaf()
    await this.appendBuffer()
    await this.download()
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
   * 清理资源
   */
  cleanup(): void {
    this.stopAllRaf()
    this.downloadBuffer = []
    this.fileMetaCache = []
    this.downloader = undefined
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
