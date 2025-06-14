import { ref } from 'vue'

/**
 * 模态框状态管理Hook
 */
export function useModalStates() {
  // 各种模态框状态
  const showQrCodeModal = ref(false)
  const showKeyManagementModal = ref(false)
  const showAcceptFile = ref(false)
  const showAcceptText = ref(false)
  const showTextInput = ref(false)

  // 加载状态
  const loading = ref(false)

  // 文本相关状态
  const text = ref('')
  const acceptText = ref('')

  // 预览相关状态
  const previewSrc = ref('')

  /**
   * 关闭所有模态框
   */
  function closeAllModals() {
    showQrCodeModal.value = false
    showKeyManagementModal.value = false
    showAcceptFile.value = false
    showAcceptText.value = false
    showTextInput.value = false
    previewSrc.value = ''
  }

  /**
   * 设置加载状态
   */
  function setLoading(state: boolean) {
    loading.value = state
    if (state === false) {
      // 加载结束时关闭相关模态框
      showQrCodeModal.value = false
      showKeyManagementModal.value = false
    }
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
    // 状态
    showQrCodeModal,
    showKeyManagementModal,
    showAcceptFile,
    showAcceptText,
    showTextInput,
    loading,
    text,
    acceptText,
    previewSrc,

    // 方法
    closeAllModals,
    setLoading,
    showTextReceiveModal,
    showTextSendModal,
    closeTextSendModal,
    closeTextReceiveModal
  }
}
