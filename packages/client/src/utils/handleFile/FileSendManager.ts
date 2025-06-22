import type { FileMeta, ProgressData, ResumeInfo } from 'web-share-common'
import type { FileInfo } from '@/types/fileInfo'
import { compressImg, FileChunker, getImg, type MIMEType } from '@jl-org/tool'
import { Action } from 'web-share-common'
import { ResumeManager } from '@/utils/handleOfflineFile'

/**
 * 独立的文件发送管理器
 * 负责处理文件发送、元数据生成、断点续传协商和进度跟踪
 */
export class FileSendManager {
  private config: FileSendConfig
  private fileMetaCache: FileMeta[] = []
  private resumeManager: ResumeManager

  constructor(config: FileSendConfig) {
    this.config = config
    this.resumeManager = new ResumeManager()
  }

  /**
   * 发送文件元数据和预览图
   */
  async sendFileMetas(files: File[]): Promise<void> {
    const toId = this.config.getToId()
    if (!toId) {
      const error = '没有指定对方 ID，无法发送文件元数据'
      this.config.onError?.(error)
      throw new Error(error)
    }

    console.warn(`发送文件元数据: ${files[0].name}`)

    try {
      const getMeta = (file: File): FileMeta => ({
        name: file.name,
        size: file.size,
        type: file.type,
        totalChunkSize: Math.ceil(file.size / this.config.chunkSize),
        fromId: this.config.getPeerId(),
        fileHash: this.resumeManager.generateFileHash(file.name, file.size),
      })

      let hasImg = false
      this.fileMetaCache = files.map(getMeta)

      const metaPromises = files.map((file) => {
        return new Promise<FileMeta>(async (resolve, reject) => {
          const res: FileMeta = getMeta(file)

          /** 为第一个图片文件生成预览 */
          if (res.type.includes('image') && !hasImg) {
            hasImg = true
            try {
              const url = URL.createObjectURL(file)
              const img = await getImg(url)
              if (!img) {
                return reject(new Error('文件预览失败'))
              }

              const base64 = await compressImg(img, 'base64', 0.1, 'image/webp')
              res.base64 = base64
              URL.revokeObjectURL(url) // 清理URL
            }
            catch (error) {
              console.warn('生成预览图失败:', error)
              /** 预览失败不影响文件发送 */
            }
          }

          resolve(res)
        })
      })

      const data = await Promise.all(metaPromises)
      this.fileMetaCache = data

      /** 通过 WebSocket 发送，因为 WebRTC 接收文件大小有限 */
      this.config.relay({
        data,
        toId,
        fromId: this.config.getPeerId(),
        type: Action.FileMetas,
      })
    }
    catch (error) {
      this.config.onError?.(`发送文件元数据失败: ${error}`)
      throw error
    }
  }

  /**
   * 获取文件元数据缓存
   */
  getFileMetaCache(): FileMeta[] {
    return [...this.fileMetaCache]
  }

  /**
   * 处理断点续传信息响应
   * 在新的流程中，此方法将触发单个文件的发送
   */
  async handleResumeInfo(resumeInfo: ResumeInfo): Promise<void> {
    const { fileHash, startOffset } = resumeInfo
    const fileMeta = this.fileMetaCache.find(meta => meta.fileHash === fileHash)
    const file = this.config.getOriginalFile(fileHash)

    if (!fileMeta || !file) {
      const errorMsg = `找不到文件信息: ${fileHash}`
      this.config.onError?.(errorMsg)
      throw new Error(errorMsg)
    }

    const fileIndex = this.fileMetaCache.findIndex(meta => meta.fileHash === fileHash)
    await this.sendSingleFile(file, fileIndex, startOffset)

    console.warn(`收到断点续传响应: ${resumeInfo.fileHash}, 偏移: ${resumeInfo.startOffset}, 缓存: ${resumeInfo.hasCache}`)
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    this.fileMetaCache = []
  }

  /**
   * 发送单个文件
   */
  private async sendSingleFile(file: File, fileIndex: number, startOffset: number): Promise<void> {
    const fileInfo: FileInfo = {
      lastModified: file.lastModified,
      name: file.name,
      size: file.size,
      type: file.type as MIMEType,
    }

    // @11. [发送方] 发送新文件信号
    this.config.sendJSON({ type: Action.NewFile, data: fileInfo })

    /** 创建文件分片器，支持断点续传 */
    const chunker = new FileChunker(file, {
      chunkSize: this.config.chunkSize,
      startOffset,
    })

    /** 如果是断点续传，记录日志 */
    if (startOffset > 0) {
      console.warn(`断点续传: ${file.name}, 从 ${startOffset} 字节开始`)
    }

    /** 发送文件分片 */
    while (!chunker.done) {
      if (this.config.isChannelClosed()) {
        throw new Error('RTC channel 已关闭, 中断文件传输')
      }

      const blob = chunker.next()
      const arrayBuffer = await blob.arrayBuffer()

      /** 处理通道流控制 */
      if (this.config.isChannelAmountHigh()) {
        await this.config.waitUntilChannelIdle()
      }

      // @13. [发送方] 发送文件数据
      this.config.send(arrayBuffer)

      /** 发送进度更新 */
      const progressData: ProgressData = {
        curIndex: fileIndex,
        progress: chunker.progress,
        total: this.fileMetaCache.length,
        filename: this.fileMetaCache[fileIndex].name,
      }

      this.config.sendJSON({ type: Action.Progress, data: progressData })
      this.config.onProgress?.(progressData)
      // await wait(10)
    }

    // @15. [发送方] 发送文件完成信号
    this.config.sendJSON({ type: Action.FileDone, data: null })
  }
}

/**
 * 文件发送管理器配置
 */
export interface FileSendConfig {
  /** 发送JSON消息的方法 */
  sendJSON: (data: any) => void
  /** 发送二进制数据的方法 */
  send: (data: ArrayBuffer) => void
  /** 【WebSocket】通过服务器中继消息的方法 */
  relay: (data: any) => void
  /** 等待通道空闲的方法 */
  waitUntilChannelIdle: () => Promise<void>
  /** 检查通道缓冲区是否过高 */
  isChannelAmountHigh: () => boolean
  /** 检查通道是否关闭 */
  isChannelClosed: () => boolean
  /** 获取目标用户ID */
  getToId: () => string | undefined
  /** 获取当前用户ID */
  getPeerId: () => string
  /** 原始文件 Getter */
  getOriginalFile: (fileHash: string) => File | undefined
  /** 文件分片大小 */
  chunkSize: number
  /** 进度回调 */
  onProgress?: (data: ProgressData) => void
  /** 错误处理回调 */
  onError?: (error: string) => void
}
