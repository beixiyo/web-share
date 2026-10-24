/** 前端与 TS 后端共用的协议、常量和浏览器传输类型入口 */
import type * as Protocol from './generated/protocol'

export * from './config'
export * from './generated/protocol'
export * from './RTCData'

/** 保留原有的默认泛型参数 */
export type SendData<D = any, T extends string = Protocol.Action> = Protocol.SendData<D, T>
