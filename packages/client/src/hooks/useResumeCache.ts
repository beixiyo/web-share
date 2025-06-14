import { ref } from 'vue'
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

      /** 验证缓存数据的有效性 */
      const validCacheInfo: Record<string, any> = {}
      let hasValidData = false

      for (const [fileHash, info] of Object.entries(allCacheInfo)) {
        try {
          /** 检查缓存项是否真实存在 */
          const hasCache = await resumeManager.hasResumeCache(fileHash)
          if (hasCache) {
            validCacheInfo[fileHash] = info
            hasValidData = true
          }
          else {
            console.warn(`发现无效缓存项，将清理: ${fileHash}`)
            /** 清理无效的元数据 */
            await resumeManager.deleteResumeCache(fileHash).catch((error) => {
              console.warn(`清理无效缓存项失败: ${fileHash}`, error)
            })
          }
        }
        catch (error) {
          console.warn(`验证缓存项失败: ${fileHash}`, error)
        }
      }

      hasCacheData.value = hasValidData
      cacheInfo.value = validCacheInfo

      console.log(`缓存检查完成: 有效缓存 ${Object.keys(validCacheInfo).length} 个`)
      return { hasData: hasValidData, cacheInfo: validCacheInfo }
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
