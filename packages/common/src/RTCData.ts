import type { Action } from './action'

export type Sdp = {
  sdp: RTCSessionDescription
  type: Action.Answer | Action.Offer
}

export type Candidate = {
  candidate: RTCIceCandidate
  type: Action.Candidate
}

export type RTCBaseData<T> = {
  type: Action
  data: T
}

export type RTCTextData = RTCBaseData<string>

export type FileMeta = {
  fromId: string
  name: string
  size: number
  type: string
  base64?: string
  totalChunkSize: number
}
export type RTCFileMeta = RTCBaseData<FileMeta[]>