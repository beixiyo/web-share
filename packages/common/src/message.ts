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
  name: Name
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