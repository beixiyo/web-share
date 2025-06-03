import { type FileMeta } from 'web-share-common'
import type { ServerConnection } from './ServerConnection'
import type { FileInfo } from '@/types/fileInfo'
import { createStreamDownloader, type StreamDownloader } from '@jl-org/tool'


export abstract class Peer {

  server: ServerConnection
  peerId: string
  /**
   * 文件分片大小
   * @default 1024 * 12
   */
  chunkSize: number

  private downloader?: StreamDownloader

  /**
   * 发送方和接收方各存一份，当都完成时才会清空
   * 用于计算进度等
   */
  /** 在整个传输过程中保持不变，用于进度计算和 UI 显示 */
  fileMetaCache: FileMeta[] = []

  constructor(opts: PeerOpts) {
    this.server = opts.server
    this.peerId = opts.peerId
    /**
     * 12KB 避免 IP 强制分片
     */
    this.chunkSize = opts.chunkSize || 1024 * 12
  }

  async createFile(fileInfo: FileInfo) {
    console.log(fileInfo)
    this.downloader = await createStreamDownloader(fileInfo.name, {
      swPath: '/sw.js',
      contentLength: fileInfo.size,
      mimeType: fileInfo.type,
    })
  }

  async download() {
    await this.downloader?.complete()
  }

  async wirteFileBuffer(data: Uint8Array | ArrayBufferLike) {
    return this.downloader?.append(
      data instanceof Uint8Array
        ? data
        : new Uint8Array(data)
    )
  }

  /***************************************************
   *                   Abstract
   ***************************************************/
  abstract close(): void
  abstract sendText(text: string): void
  abstract sendFileMetas(files: File[]): Promise<void>
  abstract sendFiles(
    files: File[],
    onDeny?: Function
  ): Promise<void>

  /**
   * 存储文件元数据
   */
  protected saveFileMetas(fileMetas: FileMeta[]) {
    this.fileMetaCache.push(...fileMetas)
  }

}


export type PeerOpts = {
  server: ServerConnection
  peerId: string
  /**
   * @default 1024 * 12
   */
  chunkSize?: number
}
