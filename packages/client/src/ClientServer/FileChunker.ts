import { numFixed } from '@jl-org/tool'

export class FileChunker {

  private offset: number = 0

  constructor(
    private file: File,
    private chunkSize: number
  ) { }

  async next() {
    const blob = this.file.slice(this.offset, this.offset + this.chunkSize)
    const arrayBuffer = await blob.arrayBuffer()
    this.offset += this.chunkSize

    return {
      blob,
      arrayBuffer,
    }
  }

  get done() {
    return this.offset >= this.file.size
  }

  get progress() {
    return numFixed(this.offset / this.file.size)
  }

}
