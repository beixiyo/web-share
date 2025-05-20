import { numFixed } from '@jl-org/tool'

/**
 * 分割文件
 * @example
 * const chunker = new FileChunker(file, this.chunkSize)
 * const blob = chunker.next()
 * const done = chunker.done
 * const progress = chunker.progress
 */
export class FileChunker {

  private offset: number = 0

  constructor(
    private file: File | Blob,
    private chunkSize: number
  ) { }

  /**
   * 获取下一块分片
   */
  next() {
    const blob = this.file.slice(this.offset, this.offset + this.chunkSize)
    this.offset += this.chunkSize
    return blob
  }

  /**
   * 是否完成
   */
  get done() {
    return this.offset >= this.file.size
  }

  /**
   * 进度
   */
  get progress() {
    return numFixed(this.offset / this.file.size)
  }

}
