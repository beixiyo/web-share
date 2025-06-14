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

export type RoomCodeInfo = {
  roomCode: string
  roomId: string
  peerInfo: UserInfo
}

export type JoinRoomCodeInfo = {
  roomCode: string
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