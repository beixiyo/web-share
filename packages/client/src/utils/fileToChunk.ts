import { numFixed } from '@jl-org/tool'

export function fileToChunk(
  file: File,
  chunkSize = 64 * 1024,
  opts: FileToChunkOpts = {}
) {
  return new Promise(async (resolve) => {
    const len = Math.ceil(file.size / chunkSize)
    const chunks = []

    for (let i = 0; i < len; i++) {
      const blob = file.slice(i * chunkSize, (i + 1) * chunkSize)
      const buffer = await blob.arrayBuffer()
      const progress = numFixed((i + 1) / len, 2)
      chunks.push(buffer)

      opts.onProgress?.(progress, buffer)
    }

    resolve(chunks)
  })
}


export type FileToChunkOpts = {
  onProgress?: (progress: number, buffer: ArrayBuffer) => void
}