import type { CleanupOptions, CleanupResult, TransferManagerConfig, TransferProgress, TransferSession, TransferStatus } from './types'
import { ResumeManager } from './ResumeManager'
import { TransferStore } from './TransferStore'

/**
 * 传输管理器
 * 负责管理文件传输的断点续传、进度跟踪和状态管理
 */
export class TransferManager {
  private resumeManager: ResumeManager
  private transferStore: TransferStore
  private config: Required<TransferManagerConfig>
  private progressCallbacks: Map<string, (progress: TransferProgress) => void> = new Map()
  private speedCalculator: Map<string, { lastBytes: number, lastTime: number }> = new Map()

  constructor(config: TransferManagerConfig = {}) {
    this.resumeManager = new ResumeManager()
    this.transferStore = new TransferStore()

    /** 默认配置 */
    this.config = {
      autoCleanupDays: 7,
      maxConcurrentTransfers: 3,
      transferTimeout: 30000,
      enableResume: true,
      progressUpdateInterval: 1000,
      ...config,
    }

    /** 启动时自动清理过期数据 */
    this.autoCleanup()
  }

  /**
   * 开始新的文件传输
   */
  async startTransfer(
    file: File,
    direction: 'send' | 'receive',
    peerId?: string,
  ): Promise<string> {
    /** 创建断点续传缓存 */
    const fileHash = await this.resumeManager.createResumeCache(file.name, file.size)

    /** 创建传输会话 */
    const session = await this.transferStore.createSession(
      fileHash, // 使用 fileHash 作为 fileId
      file.name,
      file.size,
      file.type,
      direction,
      peerId,
    )

    /** 更新状态为传输中 */
    await this.transferStore.updateSession(session.sessionId, {
      status: 'transferring' as TransferStatus,
      startedAt: Date.now(),
    })

    console.log(`开始传输: ${session.sessionId} (${file.name})`)
    return session.sessionId
  }

  /**
   * 恢复中断的传输
   */
  async resumeTransfer(sessionId: string): Promise<boolean> {
    if (!this.config.enableResume) {
      console.warn('断点续传功能已禁用')
      return false
    }

    const session = await this.transferStore.getSession(sessionId)
    if (!session) {
      console.warn(`传输会话 ${sessionId} 不存在`)
      return false
    }

    if (session.status !== 'paused' && session.status !== 'failed') {
      console.warn(`传输会话 ${sessionId} 状态不支持恢复: ${session.status}`)
      return false
    }

    /** 检查断点续传缓存是否存在 */
    const hasCache = await this.resumeManager.hasResumeCache(session.fileId)
    if (!hasCache) {
      console.warn(`断点续传缓存 ${session.fileId} 不存在，无法恢复传输`)
      await this.transferStore.updateSession(sessionId, { status: 'failed' as TransferStatus })
      return false
    }

    /** 更新状态为传输中 */
    await this.transferStore.updateSession(sessionId, {
      status: 'transferring' as TransferStatus,
      startedAt: Date.now(),
    })

    console.log(`恢复传输: ${sessionId} (已传输: ${session.transferredBytes}/${session.totalSize})`)
    return true
  }

  /**
   * 暂停传输
   */
  async pauseTransfer(sessionId: string): Promise<void> {
    await this.transferStore.updateSession(sessionId, {
      status: 'paused' as TransferStatus,
    })
    console.log(`暂停传输: ${sessionId}`)
  }

  /**
   * 取消传输
   */
  async cancelTransfer(sessionId: string): Promise<void> {
    const session = await this.transferStore.getSession(sessionId)
    if (session) {
      /** 删除断点续传缓存 */
      await this.resumeManager.deleteResumeCache(session.fileId)

      /** 更新会话状态 */
      await this.transferStore.updateSession(sessionId, {
        status: 'cancelled' as TransferStatus,
      })
    }
    console.log(`取消传输: ${sessionId}`)
  }

  /**
   * 更新传输进度
   */
  async updateProgress(sessionId: string, transferredBytes: number): Promise<void> {
    const session = await this.transferStore.getSession(sessionId)
    if (!session)
      return

    /** 计算传输速度 */
    const now = Date.now()
    const speedData = this.speedCalculator.get(sessionId)
    let speed = 0

    if (speedData) {
      const timeDiff = (now - speedData.lastTime) / 1000 // 秒
      const bytesDiff = transferredBytes - speedData.lastBytes
      speed = timeDiff > 0
        ? bytesDiff / timeDiff
        : 0
    }

    this.speedCalculator.set(sessionId, {
      lastBytes: transferredBytes,
      lastTime: now,
    })

    /** 更新会话进度 */
    await this.transferStore.updateSession(sessionId, {
      transferredBytes,
    })

    /** 计算进度数据 */
    const percentage = session.totalSize > 0
      ? (transferredBytes / session.totalSize) * 100
      : 0
    const remainingBytes = session.totalSize - transferredBytes
    const estimatedTime = speed > 0
      ? remainingBytes / speed
      : 0

    const progress: TransferProgress = {
      sessionId,
      transferredBytes,
      totalBytes: session.totalSize,
      percentage: Math.min(100, Math.max(0, percentage)),
      speed,
      estimatedTime,
      status: session.status,
    }

    /** 调用进度回调 */
    const callback = this.progressCallbacks.get(sessionId)
    if (callback) {
      callback(progress)
    }

    /** 检查是否完成 */
    if (transferredBytes >= session.totalSize) {
      await this.completeTransfer(sessionId)
    }
  }

  /**
   * 完成传输
   */
  async completeTransfer(sessionId: string): Promise<void> {
    await this.transferStore.updateSession(sessionId, {
      status: 'completed' as TransferStatus,
      transferredBytes: (await this.transferStore.getSession(sessionId))?.totalSize || 0,
    })

    /** 清理速度计算器 */
    this.speedCalculator.delete(sessionId)
    this.progressCallbacks.delete(sessionId)

    console.log(`传输完成: ${sessionId}`)
  }

  /**
   * 传输失败
   */
  async failTransfer(sessionId: string, error: string): Promise<void> {
    await this.transferStore.updateSession(sessionId, {
      status: 'failed' as TransferStatus,
      error,
    })

    /** 清理速度计算器 */
    this.speedCalculator.delete(sessionId)
    this.progressCallbacks.delete(sessionId)

    console.log(`传输失败: ${sessionId} - ${error}`)
  }

  /**
   * 设置进度回调
   */
  setProgressCallback(sessionId: string, callback: (progress: TransferProgress) => void): void {
    this.progressCallbacks.set(sessionId, callback)
  }

  /**
   * 获取未完成的传输会话
   */
  async getIncompleteSessions(): Promise<TransferSession[]> {
    return this.transferStore.getIncompleteSessions()
  }

  /**
   * 获取传输会话
   */
  async getSession(sessionId: string): Promise<TransferSession | null> {
    return this.transferStore.getSession(sessionId)
  }

  /**
   * 清理传输数据
   */
  async cleanup(options: CleanupOptions): Promise<CleanupResult> {
    const result = await this.transferStore.cleanup(options)

    /** 如果需要清理文件数据 */
    if (options.includeFileData !== false) {
      const sessions = await this.transferStore.getAllSessions()
      const sessionList = Object.values(sessions)

      /** 获取要清理的文件ID列表 */
      const fileIdsToClean = sessionList
        .filter((session) => {
          switch (options.type) {
            case 'all':
              return true
            case 'expired':
              const expireDays = options.expireDays || 7
              const expireTime = Date.now() - (expireDays * 24 * 60 * 60 * 1000)
              return session.updatedAt < expireTime
            case 'failed':
              return session.status === 'failed' || session.status === 'cancelled'
            case 'completed':
              return session.status === 'completed'
            default:
              return false
          }
        })
        .map(session => session.fileId)

      /** 清理断点续传缓存 */
      for (const fileId of fileIdsToClean) {
        try {
          await this.resumeManager.deleteResumeCache(fileId)
          result.cleanedFiles++
        }
        catch (error) {
          console.warn(`清理断点续传缓存 ${fileId} 失败:`, error)
        }
      }
    }

    return result
  }

  /**
   * 清除所有数据
   */
  async clearAll(): Promise<CleanupResult> {
    const startTime = Date.now()

    /** 获取统计信息 */
    const sessions = await this.transferStore.getAllSessions()
    const sessionCount = Object.keys(sessions).length
    const totalBytes = Object.values(sessions).reduce((sum, session) => sum + session.totalSize, 0)

    /** 清理断点续传缓存 */
    await this.resumeManager.clearAllCache()

    /** 清理传输存储 */
    await this.transferStore.clearAll()

    /** 清理内存数据 */
    this.progressCallbacks.clear()
    this.speedCalculator.clear()

    const result: CleanupResult = {
      cleanedSessions: sessionCount,
      cleanedFiles: sessionCount,
      freedBytes: totalBytes,
      duration: Date.now() - startTime,
    }

    console.log('所有传输数据已清除:', result)
    return result
  }

  /**
   * 自动清理过期数据
   */
  private async autoCleanup(): Promise<void> {
    try {
      const result = await this.cleanup({
        type: 'expired',
        expireDays: this.config.autoCleanupDays,
        includeFileData: true,
        includeTransferRecords: true,
      })

      if (result.cleanedSessions > 0) {
        console.log(`自动清理完成: 清理了 ${result.cleanedSessions} 个过期传输会话`)
      }
    }
    catch (error) {
      console.error('自动清理失败:', error)
    }
  }
}
