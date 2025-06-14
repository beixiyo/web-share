import type { UserInfo } from 'web-share-common'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Message } from '@/utils'

/**
 * 拖拽状态接口
 */
interface DragDropState {
  /** 是否正在拖拽 */
  isDragging: boolean
  /** 拖拽计数器，用于处理嵌套元素的拖拽事件 */
  dragCounter: number
  /** 是否拖拽的是文件 */
  isDragFile: boolean
  /** 拖拽区域是否激活 */
  isDropZoneActive: boolean
}

/**
 * 拖拽配置选项
 */
interface DragDropOptions {
  /** 目标元素，默认为 document.body */
  target?: HTMLElement | null
  /** 是否启用拖拽功能 */
  enabled?: boolean
  /** 拖拽进入时的回调 */
  onDragEnter?: (event: DragEvent) => void
  /** 拖拽离开时的回调 */
  onDragLeave?: (event: DragEvent) => void
  /** 拖拽悬停时的回调 */
  onDragOver?: (event: DragEvent) => void
  /** 文件放置时的回调 */
  onDrop?: (files: File[], event: DragEvent) => void
}

/**
 * 拖拽文件上传Hook
 *
 * @description 提供拖拽文件到浏览器窗口的功能，支持多文件拖拽和视觉反馈
 * @example
 * ```typescript
 * const {
 *   isDragging,
 *   isDropZoneActive,
 *   setupDragDrop,
 *   handleDraggedFiles
 * } = useDragDrop()
 *
 * // 设置拖拽处理
 * setupDragDrop({
 *   onDrop: (files) => handleDraggedFiles(files, onlineUsers, sendFilesToPeer)
 * })
 * ```
 */
export function useDragDrop(options: DragDropOptions = {}) {
  /** 拖拽状态 */
  const dragState = ref<DragDropState>({
    isDragging: false,
    dragCounter: 0,
    isDragFile: false,
    isDropZoneActive: false,
  })

  /** 目标元素 */
  const targetElement = ref<HTMLElement | null>(options.target || null)

  /** 是否启用拖拽功能 */
  const enabled = ref(options.enabled ?? true)

  /** 计算属性：是否正在拖拽 */
  const isDragging = computed(() => dragState.value.isDragging)

  /** 计算属性：是否拖拽文件 */
  const isDragFile = computed(() => dragState.value.isDragFile)

  /** 计算属性：拖拽区域是否激活 */
  const isDropZoneActive = computed(() => dragState.value.isDropZoneActive)

  /**
   * 检查拖拽数据是否包含文件
   */
  function hasFiles(dataTransfer: DataTransfer | null): boolean {
    if (!dataTransfer)
      return false

    return Array.from(dataTransfer.types).some(type =>
      type === 'Files' || type === 'application/x-moz-file',
    )
  }

  /**
   * 从拖拽事件中提取文件
   * 优先使用 dataTransfer.files，回退到 dataTransfer.items
   * 确保每个文件只被添加一次，避免重复提取
   */
  function extractFilesFromDragEvent(event: DragEvent): File[] {
    const files: File[] = []

    if (!event.dataTransfer) {
      return files
    }

    /** 方法1：优先使用 dataTransfer.files（直接提供 File 对象数组） */
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      /** 使用 files 属性，这是最直接和可靠的方式 */
      files.push(...Array.from(event.dataTransfer.files))
      return files
    }

    /** 方法2：回退到 dataTransfer.items（用于兼容性或特殊情况） */
    if (event.dataTransfer.items && event.dataTransfer.items.length > 0) {
      for (const item of Array.from(event.dataTransfer.items)) {
        /** 只处理文件类型的项目 */
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) {
            files.push(file)
          }
        }
      }
    }

    return files
  }

  /**
   * 处理拖拽进入事件
   */
  function handleDragEnter(event: DragEvent) {
    if (!enabled.value)
      return

    event.preventDefault()
    event.stopPropagation()

    dragState.value.dragCounter++

    if (dragState.value.dragCounter === 1) {
      dragState.value.isDragging = true
      dragState.value.isDragFile = hasFiles(event.dataTransfer)
      dragState.value.isDropZoneActive = dragState.value.isDragFile
    }

    options.onDragEnter?.(event)
  }

  /**
   * 处理拖拽悬停事件
   */
  function handleDragOver(event: DragEvent) {
    if (!enabled.value)
      return

    event.preventDefault()
    event.stopPropagation()

    /** 设置拖拽效果 */
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = hasFiles(event.dataTransfer)
        ? 'copy'
        : 'none'
    }

    options.onDragOver?.(event)
  }

  /**
   * 处理拖拽离开事件
   */
  function handleDragLeave(event: DragEvent) {
    if (!enabled.value)
      return

    event.preventDefault()
    event.stopPropagation()

    dragState.value.dragCounter--

    if (dragState.value.dragCounter === 0) {
      dragState.value.isDragging = false
      dragState.value.isDragFile = false
      dragState.value.isDropZoneActive = false
    }

    options.onDragLeave?.(event)
  }

  /**
   * 处理文件放置事件
   */
  function handleDrop(event: DragEvent) {
    if (!enabled.value)
      return

    event.preventDefault()
    event.stopPropagation()

    /** 重置拖拽状态 */
    dragState.value.isDragging = false
    dragState.value.dragCounter = 0
    dragState.value.isDragFile = false
    dragState.value.isDropZoneActive = false

    /** 提取文件 */
    const files = extractFilesFromDragEvent(event)

    if (files.length > 0) {
      options.onDrop?.(files, event)
    }
    else {
      Message.warning('拖拽的内容中没有可传输的文件')
    }
  }

  /**
   * 文件去重函数
   * 基于文件名和文件大小的组合进行去重
   */
  function deduplicateFiles(files: File[]): { uniqueFiles: File[], duplicateCount: number } {
    const fileMap = new Map<string, File>()
    let duplicateCount = 0

    for (const file of files) {
      /** 生成基于文件名和大小的唯一键 */
      const fileKey = `${file.name}_${file.size}`

      if (fileMap.has(fileKey)) {
        duplicateCount++
        console.warn(`检测到重复文件: ${file.name} (${file.size} bytes)`)
      }
      else {
        fileMap.set(fileKey, file)
      }
    }

    return {
      uniqueFiles: Array.from(fileMap.values()),
      duplicateCount,
    }
  }

  /**
   * 重置相关DOM元素状态
   */
  function resetDOMState() {
    /** 重置可能存在的文件输入元素 */
    const fileInputs = document.querySelectorAll('input[type="file"]')
    fileInputs.forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.value = ''
      }
    })

    /** 清理可能的拖拽相关样式 */
    document.body.classList.remove('dragging', 'drag-over')

    /** 重置拖拽状态计数器（防止状态异常） */
    dragState.value.dragCounter = 0
  }

  /**
   * 处理拖拽的文件
   * 复用 useClipboard 中的文件处理逻辑，添加文件去重和状态重置
   */
  async function handleDraggedFiles(
    files: File[],
    onlineUsers: UserInfo[],
    sendFilesToPeer: (targetPeer: UserInfo, files: File[]) => Promise<void>,
    showUserSelector?: (contentType: 'files' | 'text', files?: File[], textContent?: string) => void,
  ) {
    try {
      /** 检查是否有在线用户可以发送 */
      if (onlineUsers.length === 0) {
        Message.warning('没有在线用户，无法发送文件')
        return
      }

      /** 验证文件 */
      if (files.length === 0) {
        Message.warning('没有可发送的文件')
        return
      }

      /** 文件去重处理 */
      const { uniqueFiles, duplicateCount } = deduplicateFiles(files)

      if (duplicateCount > 0) {
        Message.warning(`检测到 ${duplicateCount} 个重复文件，已自动去重`)
      }

      if (uniqueFiles.length === 0) {
        Message.warning('去重后没有可发送的文件')
        return
      }

      /** 处理文件发送 */
      if (onlineUsers.length > 1 && showUserSelector) {
        /** 多个用户在线，显示用户选择器 */
        showUserSelector('files', uniqueFiles)
      }
      else {
        /** 只有一个用户在线，直接发送 */
        const targetPeer = onlineUsers[0]
        await sendFilesToPeer(targetPeer, uniqueFiles)

        const fileCountText = duplicateCount > 0
          ? `${uniqueFiles.length} 个文件（已去重 ${duplicateCount} 个）`
          : `${uniqueFiles.length} 个文件`

        Message.success(`已通过拖拽发送 ${fileCountText} 给 ${targetPeer.name.displayName}`)
      }
    }
    catch (error) {
      console.error('处理拖拽文件时出错:', error)
      Message.error('处理拖拽文件时发生错误')
    }
    finally {
      /** 重置DOM状态 */
      resetDOMState()
    }
  }

  /**
   * 设置拖拽功能
   */
  function setupDragDrop(newOptions: DragDropOptions = {}) {
    /** 更新配置 */
    Object.assign(options, newOptions)

    /** 更新目标元素 */
    if (newOptions.target !== undefined) {
      targetElement.value = newOptions.target
    }

    /** 更新启用状态 */
    if (newOptions.enabled !== undefined) {
      enabled.value = newOptions.enabled
    }
  }

  /**
   * 启用拖拽功能
   */
  function enableDragDrop() {
    enabled.value = true
  }

  /**
   * 禁用拖拽功能
   */
  function disableDragDrop() {
    enabled.value = false
    /** 重置状态 */
    dragState.value = {
      isDragging: false,
      dragCounter: 0,
      isDragFile: false,
      isDropZoneActive: false,
    }
  }

  /**
   * 绑定事件监听器
   */
  function bindEventListeners() {
    const target = targetElement.value || document.body

    target.addEventListener('dragenter', handleDragEnter)
    target.addEventListener('dragover', handleDragOver)
    target.addEventListener('dragleave', handleDragLeave)
    target.addEventListener('drop', handleDrop)
  }

  /**
   * 移除事件监听器
   */
  function unbindEventListeners() {
    const target = targetElement.value || document.body

    target.removeEventListener('dragenter', handleDragEnter)
    target.removeEventListener('dragover', handleDragOver)
    target.removeEventListener('dragleave', handleDragLeave)
    target.removeEventListener('drop', handleDrop)
  }

  /** 组件挂载时绑定事件 */
  onMounted(() => {
    bindEventListeners()
  })

  /** 组件卸载时清理事件监听 */
  onUnmounted(() => {
    unbindEventListeners()
  })

  return {
    /** 响应式状态 */
    isDragging,
    isDragFile,
    isDropZoneActive,
    enabled,

    /** 方法 */
    setupDragDrop,
    handleDraggedFiles,
    enableDragDrop,
    disableDragDrop,
    bindEventListeners,
    unbindEventListeners,

    /** 内部状态（用于调试） */
    dragState: readonly(dragState),
  }
}

/**
 * 创建拖拽处理器工厂函数
 * 类似于 useClipboard 中的 createPasteHandler
 */
export function createDragDropHandler(
  getOnlineUsers: () => UserInfo[],
  sendFilesToPeer: (targetPeer: UserInfo, files: File[]) => Promise<void>,
  showUserSelector?: (contentType: 'files' | 'text', files?: File[], textContent?: string) => void,
) {
  return function setupDragDropHandler(options: DragDropOptions = {}) {
    const dragDrop = useDragDrop({
      ...options,
      onDrop: async (files: File[], event: DragEvent) => {
        const currentOnlineUsers = getOnlineUsers()
        await dragDrop.handleDraggedFiles(files, currentOnlineUsers, sendFilesToPeer, showUserSelector)

        /** 调用用户自定义的 onDrop 回调 */
        options.onDrop?.(files, event)
      },
    })

    return dragDrop
  }
}
