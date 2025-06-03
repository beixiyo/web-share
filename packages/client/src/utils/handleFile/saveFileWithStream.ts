import { createStreamDownloader } from '@jl-org/tool'
import type { FileStore } from './FileStore'


export async function saveFileWithStream(
  filename: string,
  fileStore: FileStore
) {
  const downloader = await createStreamDownloader(filename, { swPath: '/sw.js' })

  await fileStore.getFile(
    async (chunk: ArrayBuffer) => {
      const unit8Arr = new Uint8Array(chunk)
      await downloader.append(unit8Arr)
    },
    async (error) => {
      await downloader.abort()
      console.error(`流式传输文件 ${filename} 失败:`, error)
    }
  )

  await downloader.complete()
  console.log(`文件已成功流式传输到 ${filename}`)
}
