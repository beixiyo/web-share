import type { ServerConnection } from './ServerConnection'

export abstract class Peer {
  server: ServerConnection
  peerId: string

  constructor(opts: PeerOpts) {
    this.server = opts.server
    this.peerId = opts.peerId
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
}
