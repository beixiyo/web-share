import type { ServerConnection } from './ServerConnection'

export abstract class Peer {
  server: ServerConnection
  peerId: string
  /**
   * 文件分片大小
   * @default 1024 * 12
   */
  chunkSize: number

  constructor(opts: PeerOpts) {
    this.server = opts.server
    this.peerId = opts.peerId
    /**
     * 12KB 避免 IP 强制分片
     */
    this.chunkSize = opts.chunkSize || 1024 * 12
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
}

export type PeerOpts = {
  server: ServerConnection
  peerId: string
  /**
   * @default 1024 * 12
   */
  chunkSize?: number
}
