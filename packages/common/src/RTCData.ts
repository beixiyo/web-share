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
  /** 文件唯一标识，基于文件名和大小生成 */
  fileHash?: string
}

/** 断点续传响应数据 */
export type ResumeInfo = {
  /** 文件唯一标识 */
  fileHash: string
  /** 起始偏移量（已下载的字节数） */
  startOffset: number
  /** 是否有缓存 */
  hasCache: boolean
  /** 响应方ID */
  fromId: string
}
