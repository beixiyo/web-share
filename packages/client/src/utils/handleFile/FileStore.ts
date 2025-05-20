import localforage from 'localforage'
import { uniqueId } from '@jl-org/tool'


/** 文件元数据在 localforage 中存储的键 */
const FILE_METADATA_KEY = 'fileStore_metadata'
/** 文件数据块键名的前缀 */
const FILE_CHUNK_KEY_PREFIX = 'fschunk_'

/**
 * ## 暂未使用
 * 使用 localforage 进行 ArrayBuffer 文件分块存储和管理的类
 * 专为大文件流式处理优化
 */
export class FileStore {
  private localForageInstance: LocalForage

  constructor(config?: LocalForageOptions) {
    this.localForageInstance = localforage.createInstance({
      name: 'fileStore', // 数据库名称，可以自定义
      storeName: 'fileDataChunks',   // 表名，可以自定义
      description: '存储应用的大文件数据块',
      ...(config || {}),
    })
  }

  /**
   * 获取所有文件的元数据
   * @private
   * @returns {Promise<AllFilesMetadata>}
   */
  private async _getMetadata(): Promise<AllFilesMetadata> {
    const metadata = await this.localForageInstance.getItem<AllFilesMetadata>(FILE_METADATA_KEY)
    return metadata || {}
  }

  /**
   * 保存所有文件的元数据
   * @private
   * @param {AllFilesMetadata} metadata - 要保存的元数据
   */
  private async _saveMetadata(metadata: AllFilesMetadata): Promise<void> {
    await this.localForageInstance.setItem(FILE_METADATA_KEY, metadata)
  }

  /**
   * 根据 fileId 和块索引生成存储键
   * @private
   * @param {string} fileId - 文件ID
   * @param {number} chunkIndex - 块索引
   * @returns {string} 存储键
   */
  private _getChunkStorageKey(fileId: string, chunkIndex: number): string {
    return `${FILE_CHUNK_KEY_PREFIX}${fileId}-${chunkIndex}`
  }

  /**
   * 创建一个新文件记录，并返回其唯一 ID。
   * @param {string} [originalFileName] - 可选的原始文件名，将存储在元数据中
   * @returns {Promise<string>} 新创建文件的唯一 ID (fileId)
   */
  async createFile(originalFileName?: string): Promise<string> {
    const fileId = uniqueId() // 使用外部库生成唯一 ID
    const metadata = await this._getMetadata()

    // 理论上 uniqueId 应该保证唯一，但以防万一可以检查
    if (metadata[fileId]) {
      console.warn(`File ID ${fileId} collision. This should be rare. Retrying...`)
      // 如果发生碰撞，简单地再次调用或实现更复杂的重试逻辑
      return this.createFile(originalFileName)
    }

    metadata[fileId] = {
      totalChunks: 0,
      createdAt: Date.now(),
      ...(originalFileName && { originalFileName }),
    }
    await this._saveMetadata(metadata)
    console.log(`新文件记录已创建: ${fileId}${originalFileName ? ` (原始文件名: ${originalFileName})` : ''}`)
    return fileId
  }

  /**
   * 向指定文件追加一个 ArrayBuffer 数据块。
   * 每个块独立存储，不会读取或修改已存储的块。
   * @param {string} fileId - 目标文件的 ID
   * @param {ArrayBuffer} buffer - 要追加的数据块
   * @throws {Error} 如果 fileId 无效或未创建
   */
  async appendChunk(fileId: string, buffer: ArrayBuffer) {
    const metadata = await this._getMetadata()
    const fileMeta = metadata[fileId]

    if (!fileMeta) {
      throw new Error(`文件 ${fileId} 不存在。请先使用 createFile 创建文件记录。`)
    }

    const newChunkIndex = fileMeta.totalChunks // 新块的索引是当前总块数
    const chunkKey = this._getChunkStorageKey(fileId, newChunkIndex)

    await this.localForageInstance.setItem<ArrayBuffer>(chunkKey, buffer)

    fileMeta.totalChunks += 1 // 更新总块数
    await this._saveMetadata(metadata)

    console.log(`数据块 ${newChunkIndex} (大小: ${buffer.byteLength} bytes) 已追加到文件: ${fileId}`)
    return { fileId, newChunkIndex, totalChunks: fileMeta.totalChunks }
  }

  /**
   * 获取指定文件的特定数据块。
   * 此方法按需读取，不会加载整个文件到内存。
   * @param {string} fileId - 目标文件的 ID
   * @param {number} chunkIndex - 要获取的数据块的索引 (从0开始)
   * @returns {Promise<ArrayBuffer | null>} 数据块，如果文件或块不存在则返回 null
   */
  async getChunk(fileId: string, chunkIndex: number): Promise<ArrayBuffer | null> {
    const metadata = await this._getMetadata()
    const fileMeta = metadata[fileId]

    if (!fileMeta) {
      console.warn(`获取块失败：文件 ${fileId} 的元数据不存在。`)
      return null
    }
    if (chunkIndex < 0 || chunkIndex >= fileMeta.totalChunks) {
      console.warn(`获取块失败：文件 ${fileId} 的块索引 ${chunkIndex} 无效 (总块数: ${fileMeta.totalChunks})。`)
      return null
    }

    const chunkKey = this._getChunkStorageKey(fileId, chunkIndex)
    const chunkData = await this.localForageInstance.getItem<ArrayBuffer>(chunkKey)
    if (!chunkData) {
      console.warn(`获取块失败：文件 ${fileId} 的块 ${chunkIndex} (键: ${chunkKey}) 数据未找到。可能已被删除或存储失败。`)
    }
    return chunkData
  }

  /**
   * 获取指定文件的元数据。
   * @param {string} fileId - 目标文件的 ID
   * @returns {Promise<FileMeta | null>} 文件的元数据，如果文件不存在则返回 null
   */
  async getFileMetadata(fileId: string): Promise<FileMeta | null> {
    const metadata = await this._getMetadata()
    return metadata[fileId] || null
  }

  /**
   * 删除指定文件及其所有数据块和元数据。
   * @param {string} fileId - 要删除的文件的 ID
   * @returns {Promise<void>}
   */
  async deleteFile(fileId: string): Promise<void> {
    const metadata = await this._getMetadata()
    const fileMeta = metadata[fileId]

    if (!fileMeta) {
      console.warn(`删除文件操作：文件 ${fileId} 的元数据不存在，可能已被删除。`)
      return
    }

    // 删除所有数据块
    for (let i = 0; i < fileMeta.totalChunks; i++) {
      const chunkKey = this._getChunkStorageKey(fileId, i)
      await this.localForageInstance.removeItem(chunkKey)
    }

    // 删除元数据条目
    delete metadata[fileId]
    await this._saveMetadata(metadata)

    console.log(`文件 ${fileId} 及其所有数据块已成功删除。`)
  }

  /**
   * 获取所有已存储文件的 ID 列表。
   * @returns {Promise<string[]>} 文件 ID 数组
   */
  async getAllFileIds(): Promise<string[]> {
    const metadata = await this._getMetadata()
    return Object.keys(metadata)
  }

  /**
   * 异步获取最后一个文件数据并分块处理
   * @remarks
   * - 获取最新文件ID并验证文件元数据
   * - 按总块数循环获取每个文件块
   * - 处理异常情况：无文件/文件为空/块缺失
   * - 可选自动清理文件
   */
  async getFile<T = ArrayBuffer>(
    callback: (chunk: T) => Promise<void>,
    onError?: (error: Error) => Promise<void>,
    autoClear = true
  ) {
    const field = (await this.getAllFileIds()).at(-1)
    if (!field) {
      console.log('没有文件')
      return
    }

    const fileMeta = await this.getFileMetadata(field)
    if (!fileMeta) {
      console.log('没有文件')
      await onError?.(new Error('没有文件'))
      return
    }

    const totalChunks = fileMeta.totalChunks
    if (totalChunks === 0) {
      console.warn(`文件 ${field} 为空，无需流式传输。`)
      await onError?.(new Error(`文件 ${field} 为空，无需流式传输。`))
      return
    }

    for (let i = 0; i < totalChunks; i++) {
      const chunk = await this.getChunk(field, i)
      if (!chunk) {
        console.error(`错误：文件 ${field} 的块 ${i} 未找到！流式传输中止。`)
        await onError?.(new Error(`文件 ${field} 的块 ${i} 未找到！流式传输中止。`))
        return
      }
      await callback(chunk as T)
    }

    autoClear && this.deleteFile(field)
  }

  /**
   * 清除所有存储的文件数据和元数据。
   * 警告：此操作不可逆。
   * @returns {Promise<void>}
   */
  async clearAllStoredData(): Promise<void> {
    const metadata = await this._getMetadata()
    const fileIds = Object.keys(metadata)

    for (const fileId of fileIds) {
      const fileMeta = metadata[fileId] // 从已获取的 metadata 中读取
      if (fileMeta) {
        for (let i = 0; i < fileMeta.totalChunks; i++) {
          const chunkKey = this._getChunkStorageKey(fileId, i)
          await this.localForageInstance.removeItem(chunkKey)
        }
      }
    }
    // 最后删除元数据本身
    await this.localForageInstance.removeItem(FILE_METADATA_KEY)
    console.log('所有存储的文件数据和元数据已清除。')
  }
}


/**
 * @description 单个文件的元数据结构
 */
interface FileMeta {
  /** 文件总块数 */
  totalChunks: number
  /** 文件创建时间戳 */
  createdAt: number
  /** 可选：原始文件名或其他你希望存储的元信息 */
  originalFileName?: string
}

/**
 * @description 存储所有文件元数据的对象结构
 */
interface AllFilesMetadata {
  [fileId: string]: FileMeta
}
