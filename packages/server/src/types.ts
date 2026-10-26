/**
 * WebSocket 服务配置
 */
export type WSServerOpts = {
  /**
   * 清理离线连接者的时间间隔（毫秒）
   * 移动端在选择文件时可能会挂起 JS 执行，导致无法发送心跳
   * 设置一个较长的值可以防止在此期间被服务器误判为离线
   * @default 300000
   */
  clearTime?: number

  /**
   * 断连宽限期（毫秒）。小于等于 0 时立即清理
   * WS 关闭后立即移出在线名单并广播 LeaveRoom，仅恢复身份保留到此时间结束
   * 重连必须携带服务端签发的 resumeToken，宽限期内恢复原 ID 和房间
   * 环境变量：DISCONNECT_DELAY
   * @default 300000
   */
  disconnectDelay?: number

  /**
   * 房间清空后的邀请保留时间（毫秒）
   * 仅控制“空房多久后回收 invite”，与连接心跳和断连宽限语义分离
   * 小于等于 0 代表房间一空就立即回收 invite
   * @default 300000
   */
  roomEmptyGraceMs?: number

  /**
   * 房间邀请有效期（毫秒）
   * 小于等于 0 代表永不过期
   * @default -1
   */
  inviteTTL?: number

  /**
   * 默认固定房间码，独立于可刷新的分享邀请
   * 设置后，任何人通过「通过房间码加入」输入该码即可进入同一固定房间，无需先有人建房或生成邀请
   * 环境变量：DEFAULT_ROOM_CODE。建议 6 位数字，与普通房间码一致
   * @default '442385'
   */
  defaultRoomCode?: string

  /** IPv4 networks whose matching clients share a room. The LAN_CIDRS environment variable accepts comma-separated CIDRs. Omitted uses local non-internal IPv4 interfaces; an empty list disables LAN grouping. @default 自动识别本机 IPv4 前缀 */
  lanCIDRs?: string[]
}

/** 合并默认值后的配置（defaultRoomCode 仍可选） */
export type ResolvedWSServerOpts = Required<Omit<WSServerOpts, 'defaultRoomCode' | 'lanCIDRs'>> & {
  defaultRoomCode?: string
  lanCIDRs?: string[]
}
