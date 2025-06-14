import { ref } from 'vue'

/**
 * 模态框状态管理Hook
 */
export function useModalStates() {
  /** 各种模态框状态 */
  const showQrCodeModal = ref(false)
  const showKeyManagementModal = ref(false)
  const showAcceptFile = ref(false)
  const showAcceptText = ref(false)
  const showTextInput = ref(false)
  const showUserSelector = ref(false)

  /** 加载状态 */
  const loading = ref(false)
  const loadingMessage = ref('')

  /** 文本相关状态 */
  const text = ref('')
  const acceptText = ref('')

  /** 预览相关状态 */
  const previewSrc = ref('')

  /** 加载超时定时器 */
  let loadingTimeout: NodeJS.Timeout | null = null

  /**
   * 关闭所有模态框
   */
  function closeAllModals() {
    showQrCodeModal.value = false
    showKeyManagementModal.value = false
    showAcceptFile.value = false
    showAcceptText.value = false
    showTextInput.value = false
    showUserSelector.value = false
    previewSrc.value = ''
  }

  /**
   * 设置加载状态
   */
  function setLoading(state: boolean, message = '') {
    loading.value = state
    loadingMessage.value = message

    /** 清除之前的超时定时器 */
    if (loadingTimeout) {
      clearTimeout(loadingTimeout)
      loadingTimeout = null
    }

    if (state === false) {
      /** 加载结束时只关闭二维码模态框，保持连接码管理弹窗打开 */
      showQrCodeModal.value = false
      /** 注意：不再自动关闭 showKeyManagementModal，让用户手动控制 */
    }
    else if (state === true) {
      /** 设置30秒超时 */
      loadingTimeout = setTimeout(() => {
        loading.value = false
        loadingMessage.value = ''
        console.warn('操作超时，自动关闭loading状态')
      }, 30000)
    }
  }

  /**
   * 强制关闭加载状态（用于错误处理）
   */
  function forceCloseLoading() {
    if (loadingTimeout) {
      clearTimeout(loadingTimeout)
      loadingTimeout = null
    }
    loading.value = false
    loadingMessage.value = ''
  }

  /**
   * 显示文本接收模态框
   */
  function showTextReceiveModal(textContent: string) {
    acceptText.value = textContent
    showAcceptText.value = true
  }

  /**
   * 显示文本发送模态框
   */
  function showTextSendModal() {
    showTextInput.value = true
    text.value = ''
  }

  /**
   * 关闭文本发送模态框
   */
  function closeTextSendModal() {
    showTextInput.value = false
    text.value = ''
  }

  /**
   * 关闭文本接收模态框
   */
  function closeTextReceiveModal() {
    showAcceptText.value = false
    acceptText.value = ''
  }

  return {
    /** 状态 */
    showQrCodeModal,
    showKeyManagementModal,
    showAcceptFile,
    showAcceptText,
    showTextInput,
    showUserSelector,
    loading,
    loadingMessage,
    text,
    acceptText,
    previewSrc,

    /** 方法 */
    closeAllModals,
    setLoading,
    forceCloseLoading,
    showTextReceiveModal,
    showTextSendModal,
    closeTextSendModal,
    closeTextReceiveModal,
  }
}
