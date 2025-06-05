import { AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-vue-next'
import type { ModalVariant } from './types'
import type { FunctionalComponent } from 'vue'

export const variantStyles: Record<ModalVariant, {
  accent: string
  bg: string
  border: string
  icon: FunctionalComponent
  iconBg: string
}> = {
  default: {
    accent: 'text-slate-500', // 稍微柔和的灰色调
    bg: 'from-white to-slate-50', // 浅色背景，增加层次感
    border: 'border-slate-300', // 更柔和的边框
    icon: Info,
    iconBg: 'bg-slate-100', // 图标背景更融入
  },
  success: {
    accent: 'text-green-600', // 更鲜明且专业的绿色
    bg: 'from-green-50 to-green-100/60', // 清新的渐变背景
    border: 'border-green-400/50', // 适当强度的边框
    icon: CheckCircle,
    iconBg: 'bg-green-100', // 协调的图标背景
  },
  warning: {
    accent: 'text-yellow-600', // 更清晰的黄色警告
    bg: 'from-yellow-50 to-yellow-100/60', // 温暖的渐变背景
    border: 'border-yellow-400/50', // 适当强度的边框
    icon: AlertTriangle,
    iconBg: 'bg-yellow-100', // 协调的图标背景
  },
  error: {
    accent: 'text-red-600', // 更醒目的红色错误提示
    bg: 'from-red-50 to-red-100/60', // 警示性的渐变背景
    border: 'border-red-400/50', // 适当强度的边框
    icon: AlertCircle,
    iconBg: 'bg-red-100', // 协调的图标背景
  },
  info: {
    accent: 'text-blue-600', // 专业且友好的蓝色
    bg: 'from-blue-50 to-blue-100/60', // 清爽的渐变背景
    border: 'border-blue-400/50', // 适当强度的边框
    icon: Info,
    iconBg: 'bg-blue-100', // 协调的图标背景
  },
} as const
