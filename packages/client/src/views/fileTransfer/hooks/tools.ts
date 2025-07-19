import type { ProgressData } from 'web-share-common'
import { HelpCircle, Laptop, Smartphone } from 'lucide-vue-next'
import { Message } from '@/utils'

/**
 * 根据设备类型获取图标
 */
export function getDeviceIcon(deviceType: string | undefined) {
  if (!deviceType)
    return HelpCircle
  if (deviceType.toLowerCase().includes('window'))
    return Laptop
  if (deviceType.toLowerCase().includes('mobile'))
    return Smartphone
  return HelpCircle
}

/**
 * 获取初始进度数据
 */
export function getInitProgress(): ProgressData {
  return {
    progress: -1,
    total: -1,
    curIndex: -1,
    filename: '--',
  }
}

export function handleExpired() {
  Message.warning('用户已过期，请稍后再试')
  sessionStorage.clear()

  setTimeout(() => {
    location.reload()
  }, 200)
}
