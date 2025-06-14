import { onMounted, ref } from 'vue'
import { ResumeManager } from '@/utils/handleOfflineFile'

/**
 * 断点续传缓存管理 Hook
 */
export function useResumeCache() {
  const resumeManager = new ResumeManager()
  const hasCacheData = ref(false)
  const cacheInfo = ref<Record<string, any>>({})
  const isCheckingCache = ref(false)

  /**
   * 检查是否有缓存数据
   */
  const checkCacheData = async () => {
    isCheckingCache.value = true
    try {
      const allCacheInfo = await resumeManager.getAllCacheInfo()
      const hasData = Object.keys(allCacheInfo).length > 0

      hasCacheData.value = hasData
      cacheInfo.value = allCacheInfo

      return { hasData, cacheInfo: allCacheInfo }
    }
    catch (error) {
      console.error('检查缓存数据失败:', error)
      return { hasData: false, cacheInfo: {} }
    }
    finally {
      isCheckingCache.value = false
    }
  }

  /**
   * 清理过期缓存
   */
  const cleanupExpiredCache = async (expireDays: number = 7) => {
    try {
      const result = await resumeManager.cleanupExpiredCache(expireDays)
      console.warn(`清理过期缓存完成: ${result.cleanedCount} 个文件, 释放 ${result.freedBytes} 字节`)

      /** 重新检查缓存状态 */
      await checkCacheData()

      return result
    }
    catch (error) {
      console.error('清理过期缓存失败:', error)
      throw error
    }
  }

  /**
   * 清理所有缓存
   */
  const clearAllCache = async () => {
    try {
      const result = await resumeManager.clearAllCache()
      console.warn(`清理所有缓存完成: ${result.cleanedCount} 个文件, 释放 ${result.freedBytes} 字节`)

      /** 重新检查缓存状态 */
      await checkCacheData()

      return result
    }
    catch (error) {
      console.error('清理所有缓存失败:', error)
      throw error
    }
  }

  /**
   * 获取缓存统计信息
   */
  const getCacheStats = () => {
    const totalFiles = Object.keys(cacheInfo.value).length
    const totalBytes = Object.values(cacheInfo.value).reduce(
      (sum: number, info: any) => sum + (info.downloadedBytes || 0),
      0,
    )

    return {
      totalFiles,
      totalBytes,
      cacheInfo: cacheInfo.value,
    }
  }

  /**
   * 格式化缓存信息用于显示
   */
  const formatCacheInfo = () => {
    return Object.entries(cacheInfo.value).map(([fileHash, info]: [string, any]) => ({
      fileHash,
      fileName: info.fileName,
      fileSize: info.fileSize,
      downloadedBytes: info.downloadedBytes,
      progress: Math.round((info.downloadedBytes / info.fileSize) * 100),
      createdAt: new Date(info.createdAt).toLocaleString(),
      updatedAt: new Date(info.updatedAt).toLocaleString(),
    }))
  }

  /** 组件挂载时自动检查缓存 */
  onMounted(() => {
    checkCacheData()
  })

  return {
    /** 状态 */
    hasCacheData: readonly(hasCacheData),
    cacheInfo: readonly(cacheInfo),
    isCheckingCache: readonly(isCheckingCache),

    /** 方法 */
    checkCacheData,
    cleanupExpiredCache,
    clearAllCache,
    getCacheStats,
    formatCacheInfo,

    /** 管理器实例 */
    resumeManager,
  }
}
