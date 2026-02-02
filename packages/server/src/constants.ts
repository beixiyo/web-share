import type { WSServerOpts } from './WSServer'

export const defaultOpts: Required<WSServerOpts> = {
  /**
   * 增加清理超时时间，以兼容移动端文件选择时的后台挂起
   * 移动端选择文件时，浏览器可能会暂停 JS 执行，导致心跳停止
   * 设置为 300s 确保用户有足够时间在系统相册/文件管理器中操作
   */
  clearTime: Number(process.env.CLEAR_TIME) || 300 * 1000,
  /**
   * 增加断连延迟，兼容移动端切后台
   * 移动端打开文件选择器可能会导致 WebSocket 立即断开
   * 设置为 300s 宽限期，允许用户选完文件后重连
   */
  disconnectDelay: Number(process.env.DISCONNECT_DELAY) || 300 * 1000,
}
