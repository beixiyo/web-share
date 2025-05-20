import { type FileMeta } from 'web-share-common'
import type { ServerConnection } from './ServerConnection'
import { createWriteStream } from 'streamsaver'
import type { FileInfo } from '@/types/fileInfo'


export abstract class Peer {

  server: ServerConnection
  peerId: string
  /**
   * 文件分片大小
   * @default 64 * 1024
   */
  chunkSize: number

  private fileStream?: WritableStream<Uint8Array>
  private writer?: WritableStreamDefaultWriter<Uint8Array<ArrayBufferLike>>

  /**
   * 发送方和接收方各存一份，当都完成时才会清空
   * 用于计算进度等
   */
  fileMetaCache: FileMeta[] = []
  fileMetaQueue: FileMeta[] = []

  constructor(opts: PeerOpts) {
    this.server = opts.server
    this.peerId = opts.peerId
    this.chunkSize = opts.chunkSize || 1024 * 64
  }

  createFile(fileInfo: FileInfo) {
    this.fileStream = createWriteStream(fileInfo.name, {
      size: fileInfo.size
    })
    this.writer = this.fileStream!.getWriter()
  }

  async download() {
    await this.writer?.close()
  }

  async wirteFileBuffer(data: Uint8Array | ArrayBufferLike) {
    return this.writer?.write(
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
    for (const meta of fileMetas) {
      this.fileMetaQueue.push(meta)
      this.fileMetaCache.push(meta)
    }
  }

}


export type PeerOpts = {
  server: ServerConnection
  peerId: string
  /**
   * @default 1024 * 64
   */
  chunkSize?: number
}
