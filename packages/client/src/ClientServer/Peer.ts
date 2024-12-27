import { Action, SELECTED_PEER_ID, type FileMeta, type ProgressData, type SendData, type ToUser } from 'web-share-common'
import type { ServerConnection } from './ServerConnection'
import { downloadByData } from '@jl-org/tool'
import { Events } from './Events'


export abstract class Peer {

  server: ServerConnection
  peerId: string
  chunkSize: number

  /**
   * 发送方和接收方各存一份，当都完成是才会清空
   * 用于计算进度等
   */
  fileMetaCache: FileMeta[] = []

  fileMetaQueue: FileMeta[] = []
  fileQueue: ArrayBuffer[][] = []

  constructor(opts: PeerOpts) {
    this.server = opts.server
    this.peerId = opts.peerId
    this.chunkSize = opts.chunkSize ?? 1024 * 64
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

  protected sendProgress(progressData: ProgressData) {
    Events.emit(Action.Progress, progressData)
    const toId = sessionStorage.getItem(SELECTED_PEER_ID)
    if (!toId) return

    this.server.relay({
      type: Action.Relay,
      data: {
        type: Action.Progress,
        fromId: this.peerId,
        toId: toId,
        ...progressData,
      }
    })
  }

  /**
   * 添加一个文件位置
   */
  protected addFile() {
    this.fileQueue.push([])
  }

  /**
   * 拿出一个文件 Buffer
   */
  protected pushFileBuffer(buffer: ArrayBuffer) {
    const curFile = this.fileQueue.at(-1)
    curFile?.push(buffer)
  }

  /**
   * 下载文件
   */
  download() {
    const {
      fileChunks,
      fileMeta,
    } = this.takeFile()

    if (!fileMeta || !fileChunks) return

    if (!this.fileIsReceived(fileChunks, fileMeta)) {
      this.fileMetaQueue.unshift(fileMeta)
      this.fileQueue.unshift(fileChunks)
      requestAnimationFrame(() => this.download())
      return
    }

    return downloadByData(
      new Blob(fileChunks, { type: fileMeta.type }),
      fileMeta.name
    )
  }

  private fileIsReceived(
    fileChunks: ArrayBuffer[],
    fileMeta: FileMeta,
  ) {
    return fileChunks.length === fileMeta.totalChunkSize
  }

  private takeFile() {
    const fileMeta = this.fileMetaQueue.shift()
    const fileChunks = this.fileQueue.shift()

    return {
      fileMeta,
      fileChunks,
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
