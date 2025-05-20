// import SparkMD5 from 'spark-md5'
import Worker from '@/worker/fileToChunk?worker'
import { numFixed } from '@jl-org/tool'


/** 线程数 */
const THREAD_COUNT = navigator.hardwareConcurrency || 4

/**
 * 多线程文件分块
 * @param file 文件
 * @param chunkSize 分块大小
 */
export async function threadFileToChunk(
  file: File,
  chunkSize: number,
  opts: ThreadFileToChunkOpts = {}
): Promise<ChunkFile[]> {
  let count = 0,
    progress = 0
  const
    /** 
     * 文件最大分块数量边界
     * 比如文件大小 1024MB，分块大小 10MB
     * 则 maxChunkCount = 1024 / 10 = 102.4，向上取整为 103
     */
    maxChunkCount = Math.ceil(file.size / chunkSize),
    /** 
     * 每个线程分配的分块数量
     * 比如 maxChunkCount = 103，THREAD_COUNT = 4
     * 则 threadChunkCount = 103 / 4 = 25.75，向上取整为 26
     */
    threadChunkCount = Math.ceil(maxChunkCount / THREAD_COUNT),
    res: ChunkFile[] = []

  const addProgress = () => {
    progress += chunkSize / file.size
    opts.onProgress?.(Math.min(numFixed(progress, 2), 1))
  }

  return new Promise(async (resolve, reject) => {
    /** 
     * 给每个线程分配任务，处理文件的每一段
     * - 第一个线程分配到 startIndex = 0，endIndex = 26
     * - 第二个线程分配到 startIndex = 26，endIndex = 52
     * - 第三个线程分配到 startIndex = 52，endIndex = 78
     * - 第四个线程分配到 startIndex = 78，endIndex = 103
     */
    for (let i = 0; i < THREAD_COUNT; i++) {
      const
        worker = new Worker(),
        startIndex = i * threadChunkCount,
        endIndex = Math.min((i + 1) * threadChunkCount, maxChunkCount)

      worker.postMessage({
        file,
        chunkSize,
        startIndex,
        endIndex,
      })

      worker.onmessage = async ({ data }) => {
        if (data === null) reject(new Error('文件分割失败'))

        if (data.type === 'progress') {
          addProgress()
          opts.onData?.(data.data, data.index)
          return
        }

        for (let i = startIndex; i < endIndex; i++) {
          /**
           * 每个线程返回的数组是挨个 push 的，所以需要将其合并到一个数组中
           * 第一个线程 startIndex = 0，endIndex = 26
           * 第二个线程 startIndex = 26，endIndex = 52
           * 
           * 那么数组的索引为 i - startIndex
           * 第一个线程的 startIndex = 0，i 递增后一直减 0，所以按照顺序放入
           * 第二个线程的 startIndex = 26，i 递增后一直减 26，所以按照顺序放入
           */
          res[i] = data[i - startIndex]
        }
        worker.terminate()

        if (++count === THREAD_COUNT) {
          resolve(res)
        }
      }
    }
  })
}


export type ChunkFile = {
  start: number
  end: number
  blob: Blob
  // hash: string
}

export type ThreadFileToChunkOpts = {
  onProgress?: (progress: number) => void
  /**
   * 当某个线程数据块被处理时触发
   * @param blob 
   * @param index 
   */
  onData?: (blob: Blob, index: number) => void
}