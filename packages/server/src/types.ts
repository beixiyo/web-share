/**
 * WebSocket 服务配置
 */
export type WSServerOpts = {
  /**
   * 清理离线连接者的时间间隔（毫秒）。
   * 移动端在选择文件时可能会挂起 JS 执行，导致无法发送心跳。
   * 设置一个较长的值可以防止在此期间被服务器误判为离线。
   * @default 300000
   */
  clearTime?: number

  /**
   * 断连宽限期（毫秒），同时作为设备重连判定窗口。
   * 断连：WS 关闭后延迟此时间再 removePeer 并广播 LeaveRoom。
   * 重连：同设备在此窗口内再次连接视为重连（踢旧连、广播 UserReconnected）。
   * 环境变量：DISCONNECT_DELAY
   * @default 300000
   */
  disconnectDelay?: number

  /**
   * 房间清空后的邀请保留时间（毫秒）。
   * 仅控制“空房多久后回收 invite”，与连接心跳和断连宽限语义分离。
   * 小于等于 0 代表房间一空就立即回收 invite。
   * @default 300000
   */
  roomEmptyGraceMs?: number

  /**
   * 房间邀请有效期（毫秒）。
   * 小于等于 0 代表永不过期。
   * @default -1
   */
  inviteTTL?: number

  /**
   * 默认房间码（仅当未配置任何房间邀请时生效）。
   * 设置后，任何人通过「通过房间码加入」输入该码即可进入同一固定房间，无需先有人建房或生成邀请。
   * 环境变量：DEFAULT_ROOM_CODE。建议 6 位数字，与普通房间码一致。
   * @default 不设置则无默认房间
   */
  defaultRoomCode?: string
}

/** 合并默认值后的配置（defaultRoomCode 仍可选） */
export type ResolvedWSServerOpts = Required<Omit<WSServerOpts, 'defaultRoomCode'>> & {
  defaultRoomCode?: string
}
