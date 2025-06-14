import type { CleanupOptions, CleanupResult, TransferSession, TransferStats, TransferStatus } from './types'
import { uniqueId } from '@jl-org/tool'

/** 传输会话存储键 */
const TRANSFER_SESSIONS_KEY = 'transferStore_sessions'
/** 传输统计存储键 */
const TRANSFER_STATS_KEY = 'transferStore_stats'

/**
 * 传输状态存储管理器
 * 负责管理传输会话的持久化存储
 */
export class TransferStore {
  /**
   * 创建新的传输会话
   */
  async createSession(
    fileId: string,
    originalFileName: string,
    totalSize: number,
    fileType: string,
    direction: 'send' | 'receive',
    peerId?: string,
  ): Promise<TransferSession> {
    const sessionId = uniqueId()
    const now = Date.now()

    const session: TransferSession = {
      sessionId,
      fileId,
      originalFileName,
      totalSize,
      fileType,
      transferredBytes: 0,
      status: 'pending' as TransferStatus,
      createdAt: now,
      updatedAt: now,
      direction,
      peerId,
    }

    const sessions = await this.getAllSessions()
    sessions[sessionId] = session
    await this.saveSessions(sessions)

    console.log(`创建传输会话: ${sessionId} (${originalFileName})`)
    return session
  }

  /**
   * 更新传输会话
   */
  async updateSession(sessionId: string, updates: Partial<TransferSession>): Promise<void> {
    const sessions = await this.getAllSessions()
    const session = sessions[sessionId]

    if (!session) {
      console.warn(`传输会话 ${sessionId} 不存在`)
      return
    }

    /** 更新会话数据 */
    Object.assign(session, updates, { updatedAt: Date.now() })

    /** 如果状态变为完成或失败，记录完成时间 */
    if (updates.status === 'completed' || updates.status === 'failed') {
      session.completedAt = Date.now()
    }

    await this.saveSessions(sessions)
    console.log(`更新传输会话: ${sessionId}`, updates)
  }

  /**
   * 获取传输会话
   */
  async getSession(sessionId: string): Promise<TransferSession | null> {
    const sessions = await this.getAllSessions()
    return sessions[sessionId] || null
  }

  /**
   * 获取所有传输会话
   */
  async getAllSessions(): Promise<Record<string, TransferSession>> {
    try {
      const data = localStorage.getItem(TRANSFER_SESSIONS_KEY)
      return data
        ? JSON.parse(data)
        : {}
    }
    catch (error) {
      console.error('获取传输会话失败:', error)
      return {}
    }
  }

  /**
   * 保存传输会话
   */
  private async saveSessions(sessions: Record<string, TransferSession>): Promise<void> {
    try {
      localStorage.setItem(TRANSFER_SESSIONS_KEY, JSON.stringify(sessions))
    }
    catch (error) {
      console.error('保存传输会话失败:', error)
      throw error
    }
  }

  /**
   * 删除传输会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    const sessions = await this.getAllSessions()
    if (sessions[sessionId]) {
      delete sessions[sessionId]
      await this.saveSessions(sessions)
      console.log(`删除传输会话: ${sessionId}`)
    }
  }

  /**
   * 获取未完成的传输会话
   */
  async getIncompleteSessions(): Promise<TransferSession[]> {
    const sessions = await this.getAllSessions()
    return Object.values(sessions).filter(session =>
      session.status === 'pending'
      || session.status === 'transferring'
      || session.status === 'paused',
    )
  }

  /**
   * 获取传输统计信息
   */
  async getStats(): Promise<TransferStats> {
    try {
      const data = localStorage.getItem(TRANSFER_STATS_KEY)
      const defaultStats: TransferStats = {
        totalSessions: 0,
        completedSessions: 0,
        failedSessions: 0,
        totalBytes: 0,
        averageSpeed: 0,
        lastCleanupTime: 0,
      }
      return data
        ? { ...defaultStats, ...JSON.parse(data) }
        : defaultStats
    }
    catch (error) {
      console.error('获取传输统计失败:', error)
      return {
        totalSessions: 0,
        completedSessions: 0,
        failedSessions: 0,
        totalBytes: 0,
        averageSpeed: 0,
        lastCleanupTime: 0,
      }
    }
  }

  /**
   * 更新传输统计信息
   */
  async updateStats(updates: Partial<TransferStats>): Promise<void> {
    try {
      const currentStats = await this.getStats()
      const newStats = { ...currentStats, ...updates }
      localStorage.setItem(TRANSFER_STATS_KEY, JSON.stringify(newStats))
    }
    catch (error) {
      console.error('更新传输统计失败:', error)
    }
  }

  /**
   * 清理传输数据
   */
  async cleanup(options: CleanupOptions): Promise<CleanupResult> {
    const startTime = Date.now()
    const sessions = await this.getAllSessions()
    const sessionList = Object.values(sessions)

    let cleanedSessions = 0
    let freedBytes = 0

    /** 根据清理类型筛选要清理的会话 */
    const sessionsToClean = sessionList.filter((session) => {
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

    /** 清理会话记录 */
    if (options.includeTransferRecords !== false) {
      for (const session of sessionsToClean) {
        delete sessions[session.sessionId]
        cleanedSessions++
        freedBytes += session.totalSize
      }
      await this.saveSessions(sessions)
    }

    /** 更新统计信息 */
    await this.updateStats({ lastCleanupTime: Date.now() })

    const result: CleanupResult = {
      cleanedSessions,
      cleanedFiles: 0, // 将在 TransferManager 中计算
      freedBytes,
      duration: Date.now() - startTime,
    }

    console.log('传输数据清理完成:', result)
    return result
  }

  /**
   * 清除所有传输数据
   */
  async clearAll(): Promise<void> {
    try {
      localStorage.removeItem(TRANSFER_SESSIONS_KEY)
      localStorage.removeItem(TRANSFER_STATS_KEY)
      console.log('所有传输数据已清除')
    }
    catch (error) {
      console.error('清除传输数据失败:', error)
      throw error
    }
  }
}
