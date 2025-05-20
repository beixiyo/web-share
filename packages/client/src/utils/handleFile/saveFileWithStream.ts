import { createWriteStream } from 'streamsaver'
import type { FileStore } from './FileStore'


export async function saveFileWithStream(
  filename: string,
  fileStore: FileStore
) {
  const fileStream = createWriteStream(filename, {
    size: undefined,
  })
  const writer = fileStream.getWriter()

  await fileStore.getFile(
    async (chunk: ArrayBuffer) => {
      const unit8Arr = new Uint8Array(chunk)
      await writer.write(unit8Arr)
    },
    async (error) => {
      writer.releaseLock()
      await writer.abort(error.message)
      console.error(`流式传输文件 ${filename} 失败:`, error)
    }
  )

  writer.close()
  console.log(`文件已成功流式传输到 ${filename}`)
}
