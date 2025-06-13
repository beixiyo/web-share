/**
 * 插入样式，并自动移除样式
 * @param styleStrOrUrl 样式字符串
 */
export function useInsertStyle(styleStrOrUrl: string) {
  try {
    new URL(styleStrOrUrl)
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = styleStrOrUrl

    onMounted(() => {
      document.head.appendChild(link)
    })

    onBeforeUnmount(() => {
      document.head.removeChild(link)
    })
  }
  catch (error) {
    /** 是字符串 */
  }

  const styleEl = document.createElement('style')
  styleEl.setAttribute('type', 'text/css')
  styleEl.innerHTML = styleStrOrUrl

  onMounted(() => {
    document.head.appendChild(styleEl)
  })

  onBeforeUnmount(() => {
    document.head.removeChild(styleEl)
  })
}