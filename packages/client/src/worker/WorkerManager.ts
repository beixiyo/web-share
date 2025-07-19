import type { StoreChunkPayload, WorkerMessage, WorkerResponse } from './types'
import type { ChunkInfo } from '@/types'
import ResumeWorker from './resumeWorker?worker'

/**
 * Worker 管理器
 * 负责管理 Web Worker 的生命周期和消息通信
 */
export class WorkerManager {
  private worker: Worker | null = null

  /**
   * 初始化 Worker
   */
  private async initWorker(): Promise<void> {
    if (this.worker) {
      return
    }

    try {
      this.worker = new ResumeWorker()

      this.worker.addEventListener('message', this.handleWorkerMessage.bind(this))
      this.worker.addEventListener('error', this.handleWorkerError.bind(this))

      /** 发送初始化消息 */
      await this.sendMessage('init', {})
    }
    catch (error) {
      console.error('初始化 Worker 失败:', error)
      throw new Error(`初始化 Worker 失败: ${error}`)
    }
  }

  private handleWorkerMessage(event: MessageEvent<WorkerResponse>): void {
    const { type, error } = event.data
    if (type === 'error') {
      console.error(error)
    }
  }

  /**
   * 处理 Worker 错误
   */
  private handleWorkerError(error: ErrorEvent): void {
    console.error('Worker 错误:', error)
    /** 重置 Worker */
    this.terminateWorker()
  }

  /**
   * 发送消息到 Worker
   */
  private async sendMessage(type: WorkerMessage['type'], payload: any): Promise<any> {
    if (!this.worker) {
      await this.initWorker()
    }

    /** 发送消息 */
    const message: WorkerMessage = { type, payload }
    this.worker!.postMessage(message)
  }

  /**
   * 在 Worker 中存储数据块
   * 使用指定的键名直接存储数据块
   */
  async storeChunk(
    chunkKey: string,
    chunkInfo: ChunkInfo,
    config?: LocalForageOptions,
  ): Promise<void> {
    try {
      const payload: StoreChunkPayload = {
        chunkKey,
        chunkInfo,
        config,
      }

      await this.sendMessage('storeChunk', payload)
    }
    catch (error) {
      console.error(`Worker storeChunk 失败: ${chunkKey}`, error)
      throw error
    }
  }

  /**
   * 终止 Worker
   */
  terminateWorker(): void {
    if (this.worker) {
      /** 终止 Worker */
      this.worker.terminate()
      this.worker = null
    }
  }

  /**
   * 检查 Worker 是否活跃
   */
  isWorkerActive(): boolean {
    return this.worker !== null
  }
}

/**
 * 全局 Worker 管理器实例
 */
let globalWorkerManager: WorkerManager | null = null

/**
 * 获取全局 Worker 管理器实例
 */
export function getWorkerManager(): WorkerManager {
  if (!globalWorkerManager) {
    globalWorkerManager = new WorkerManager()
  }
  return globalWorkerManager
}

/**
 * 清理全局 Worker 管理器
 */
export function cleanupWorkerManager(): void {
  if (globalWorkerManager) {
    globalWorkerManager.terminateWorker()
    globalWorkerManager = null
  }
}
