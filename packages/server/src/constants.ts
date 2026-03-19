import type { ResolvedWSServerOpts } from './types'

export const defaultOpts: ResolvedWSServerOpts = {
  /**
   * 心跳超时阈值与离线巡检间隔
   * 只用于判断 peer 是否失联，不代表 invite 的有效期。
   * 当前实现里如果房主因失联被清理，且房间被清空，会进一步触发 invite 清理。
   * 设置为 5min 是为了兼容移动端切后台、选择文件时的长时间挂起。
   */
  clearTime: Number(process.env.CLEAR_TIME) || 5 * 60 * 1000,
  /**
   * WebSocket 关闭后的断连宽限期（毫秒）。
   * 1) 断连：WS 关闭后延迟此时间再执行 removePeer 并广播 LeaveRoom，给用户重连时间。
   * 2) 重连判定：同一设备（IP+设备名+浏览器）在此窗口内再次连接视为重连（踢旧连、广播 UserReconnected）。
   * 两者共用此配置，避免先广播 Leave 再广播 UserReconnected 的错序；仅需配置 DISCONNECT_DELAY。
   * @default 300000 (5 分钟)
   */
  disconnectDelay: Number(process.env.DISCONNECT_DELAY) || 5 * 60 * 1000,
  /**
   * 房间清空后的邀请保留期
   * 只控制空房多久后才真正删除 invite，用于彻底解耦连接超时与邀请生命周期语义。
   */
  roomEmptyGraceMs: Number(process.env.ROOM_EMPTY_GRACE_MS) || 5 * 60 * 1000,
  /**
   * 房间邀请有效期
   * @default -1
   */
  inviteTTL: process.env.ROOM_INVITE_TTL_MS != null && process.env.ROOM_INVITE_TTL_MS !== ''
    ? Number(process.env.ROOM_INVITE_TTL_MS)
    : -1,
  /**
   * 默认房间码，仅当未配置任何房间码时生效；设置后输入该码即可加入同一固定房间。
   * 环境变量：DEFAULT_ROOM_CODE
   */
  defaultRoomCode: (process.env.DEFAULT_ROOM_CODE ?? '').trim() || '442385',
}
