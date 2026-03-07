import type { Action } from './action'

/**
 * Base Type
 */
export type SendData<D = any, T = Action> = {
  type: T
  data: D
}

export type UserInfo = {
  peerId: string
  roomId: string
  name: Name
}

export type RoomInfo = {
  roomId: string
  peerInfo: UserInfo
}

export type JoinRoomInfo = {
  roomId: string
  peerId: string
}

/**
 * 通过统一邀请加入房间
 */
export type JoinInviteInfo = {
  inviteId: string
  joinToken: string
}

export type RoomCodeInfo = {
  roomCode: string
  roomId: string
  peerInfo: UserInfo
}

export type JoinRoomCodeInfo = {
  roomCode: string
}

export type RoomCodeExpiredInfo = {
  roomCode: string
  message: string
}

/**
 * 当前房间的邀请码信息
 *
 * `status` 在服务端返回时通常为 `active`。
 */
export type RoomInviteInfo = {
  inviteId: string
  roomId: string
  roomCode: string
  joinToken: string
  expiresAt: number
  status: InviteStatus
}

/**
 * 邀请失效原因
 */
export type InviteInvalidatedReason =
  | 'expired'
  | 'not_found'
  | 'room_unavailable'
  | 'restarted'
  | 'revoked'
  | 'no_active_invite'

/**
 * 邀请失效通知
 */
export type InviteInvalidatedInfo = {
  inviteId?: string
  roomCode?: string
  reason: InviteInvalidatedReason
  message: string
}

export type UserReconnectedInfo = {
  oldPeerId: string
  newPeerId: string
  userInfo: UserInfo
}

export type SendUserInfo = SendData<UserInfo>

export type To = {
  toId: string
  fromId: string
}

export type Name = {
  model: string
  os: string
  browser: string
  type: string
  deviceName: string
  displayName: string
}

export type ProgressData = {
  progress: number
  total: number
  curIndex: number
  filename: string
}

export type RTCErrorInfo = {
  errorMessage: string
  errorType: string
  fromPeerId: string
  timestamp: number
}

/**
 * 邀请状态
 *
 * @default 'active'
 */
export type InviteStatus = 'active' | 'expired' | 'invalid'