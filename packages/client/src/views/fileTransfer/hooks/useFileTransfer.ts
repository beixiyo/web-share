import { ref, useTemplateRef } from 'vue'
import type { FileMeta, ProgressData, UserInfo } from 'web-share-common'
import type { RTCPeer } from '@/ClientServer'
import { getInitProgress } from './tools'
import { Message } from '@/utils'

/**
 * 文件传输管理Hook
 */
export function useFileTransfer() {
  // 文件输入引用
  const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

  // 进度相关状态
  const progress = ref<ProgressData>(getInitProgress())
  const currentFileMetas = ref<FileMeta[]>([])
  const currentFileSizes = ref<number[]>([])

  // 文件接收Promise
  let acceptPromise: PromiseWithResolvers<void>

  /**
   * 处理文件选择
   */
  async function handleFileSelect(
    event: Event,
    selectedPeer: UserInfo | undefined,
    me: RTCPeer | undefined
  ) {
    if (!selectedPeer) {
      return
    }

    const target = event.target as HTMLInputElement
    if (target.files && target.files.length > 0) {
      const files = Array.from(target.files)
      currentFileSizes.value = files.map(f => f.size)

      me?.sendFileMetas(files)
      me?.sendFiles(files, () => {
        console.log('对方拒绝了你的文件')
        Message.warning('对方拒绝了文件传输')
      })
    }

    // @ts-ignore
    event.target.value = ''
  }

  /**
   * 创建发送文件到用户的函数
   */
  function createSendFilesToPeer(
    me: { value: RTCPeer | undefined },
    setSelectedPeer: (peer: UserInfo) => void,
    setLoading: (state: boolean) => void
  ) {
    return async function sendFilesToPeer(
      targetPeer: UserInfo,
      files: File[]
    ) {
      if (!me.value) {
        throw new Error('未初始化连接')
      }

      // 设置选中的用户
      setSelectedPeer(targetPeer)
      setLoading(true)

      try {
        // 建立连接
        const { promise, resolve } = Promise.withResolvers()
        await me.value.sendOffer(targetPeer.peerId, resolve)
        await promise

        // 更新文件大小数组
        currentFileSizes.value = files.map(f => f.size)

        // 发送文件
        await me.value.sendFileMetas(files)
        await me.value.sendFiles(files, () => {
          console.log('对方拒绝了你的文件')
          Message.warning('对方拒绝了文件传输')
        })
      } finally {
        setLoading(false)
      }
    }
  }

  /**
   * 处理文件元数据接收
   */
  function handleFileMetas(
    fileMetas: FileMeta[],
    acceptCallback: (promiseResolver: PromiseWithResolvers<void>) => void,
    showAcceptFile: { value: boolean },
    previewSrc: { value: string }
  ) {
    acceptPromise = Promise.withResolvers()
    acceptCallback(acceptPromise)
    showAcceptFile.value = true
    currentFileMetas.value = fileMetas
    currentFileSizes.value = fileMetas.map(fm => fm.size)

    for (const item of fileMetas) {
      if (!item.base64) continue
      previewSrc.value = item.base64
    }
  }

  /**
   * 接受文件
   */
  function acceptFile(
    showAcceptFile: { value: boolean },
    previewSrc: { value: string }
  ) {
    showAcceptFile.value = false
    acceptPromise?.resolve()
    previewSrc.value = ''
  }

  /**
   * 拒绝文件
   */
  function denyFile(
    showAcceptFile: { value: boolean },
    previewSrc: { value: string }
  ) {
    showAcceptFile.value = false
    acceptPromise?.reject()
    previewSrc.value = ''
  }

  /**
   * 处理进度更新
   */
  function handleProgress(data: ProgressData) {
    progress.value = data
    if (
      data.total === data.curIndex + 1 &&
      data.progress >= 1
    ) {
      progress.value = getInitProgress()
    }
  }

  /**
   * 重置进度
   */
  function resetProgress() {
    progress.value = getInitProgress()
  }

  return {
    // 状态
    fileInput,
    progress,
    currentFileMetas,
    currentFileSizes,

    // 方法
    handleFileSelect,
    createSendFilesToPeer,
    handleFileMetas,
    acceptFile,
    denyFile,
    handleProgress,
    resetProgress
  }
}
