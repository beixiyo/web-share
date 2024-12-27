import { type ChunkFile } from '@/utils'


self.addEventListener('message', ({ data }: any) => {
  const {
    file,
    chunkSize,
    startIndex,
    endIndex,
  } = data

  const res: ChunkFile[] = []
  for (let i = startIndex; i < endIndex; i++) {
    const chunk = createChunk(file, i, chunkSize)
    res.push(chunk)
    self.postMessage({
      type: 'progress',
      data: chunk.blob,
      index: i,
    })
  }

  self.postMessage(res)
})

function createChunk(
  file: File,
  index: number,
  chunkSize: number,
): ChunkFile {
  const start = index * chunkSize,
    end = start + chunkSize,
    blob = file.slice(start, end)

  return {
    start,
    end,
    blob,
  }

  // return new Promise((resolve) => {
  // const reader = new FileReader()
  // const curFileMD5 = new SparkMD5.ArrayBuffer()

  // reader.onload = function () {
  //   const buffer = this.result as ArrayBuffer
  //   curFileMD5.append(buffer)

  //   resolve({
  //     start,
  //     end,
  //     blob,
  //     hash: curFileMD5.end(),
  //   })
  // }

  // reader.readAsArrayBuffer(blob)
  // })
}
