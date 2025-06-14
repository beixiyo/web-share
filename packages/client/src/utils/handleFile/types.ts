/**
 * 传输状态枚举
 */
export enum TransferStatus {
  /** 等待开始 */
  PENDING = 'pending',
  /** 传输中 */
  TRANSFERRING = 'transferring',
  /** 已暂停 */
  PAUSED = 'paused',
  /** 传输完成 */
  COMPLETED = 'completed',
  /** 传输失败 */
  FAILED = 'failed',
  /** 已取消 */
  CANCELLED = 'cancelled',
}

/**
 * 传输会话接口
 */
export interface TransferSession {
  /** 会话唯一标识 */
  sessionId: string
  /** 关联的文件ID */
  fileId: string
  /** 原始文件名 */
  originalFileName: string
  /** 文件总大小 */
  totalSize: number
  /** 文件类型 */
  fileType: string
  /** 已传输的字节数 */
  transferredBytes: number
  /** 传输状态 */
  status: TransferStatus
  /** 创建时间戳 */
  createdAt: number
  /** 最后更新时间戳 */
  updatedAt: number
  /** 传输开始时间 */
  startedAt?: number
  /** 传输完成时间 */
  completedAt?: number
  /** 错误信息 */
  error?: string
  /** 对端用户ID */
  peerId?: string
  /** 传输方向 */
  direction: 'send' | 'receive'
}

/**
 * 传输进度数据
 */
export interface TransferProgress {
  /** 会话ID */
  sessionId: string
  /** 已传输字节数 */
  transferredBytes: number
  /** 总字节数 */
  totalBytes: number
  /** 传输百分比 (0-100) */
  percentage: number
  /** 传输速度 (bytes/s) */
  speed: number
  /** 预计剩余时间 (秒) */
  estimatedTime: number
  /** 当前状态 */
  status: TransferStatus
}

/**
 * 传输统计信息
 */
export interface TransferStats {
  /** 总传输会话数 */
  totalSessions: number
  /** 成功完成的会话数 */
  completedSessions: number
  /** 失败的会话数 */
  failedSessions: number
  /** 总传输字节数 */
  totalBytes: number
  /** 平均传输速度 */
  averageSpeed: number
  /** 最后清理时间 */
  lastCleanupTime: number
}

/**
 * 清理选项
 */
export interface CleanupOptions {
  /** 清理类型 */
  type: 'all' | 'expired' | 'failed' | 'completed'
  /** 过期时间（天数），仅在 type 为 'expired' 时有效 */
  expireDays?: number
  /** 是否清理文件数据 */
  includeFileData?: boolean
  /** 是否清理传输记录 */
  includeTransferRecords?: boolean
}

/**
 * 清理结果
 */
export interface CleanupResult {
  /** 清理的会话数量 */
  cleanedSessions: number
  /** 清理的文件数量 */
  cleanedFiles: number
  /** 释放的存储空间（字节） */
  freedBytes: number
  /** 清理耗时（毫秒） */
  duration: number
}

/**
 * 传输管理器配置
 */
export interface TransferManagerConfig {
  /** 自动清理过期数据的天数 */
  autoCleanupDays?: number
  /** 最大并发传输数 */
  maxConcurrentTransfers?: number
  /** 传输超时时间（毫秒） */
  transferTimeout?: number
  /** 是否启用断点续传 */
  enableResume?: boolean
  /** 进度更新间隔（毫秒） */
  progressUpdateInterval?: number
}
