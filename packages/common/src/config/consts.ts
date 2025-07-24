// ======================
// * 前端存储
// ======================
export const PEER_ID = '__web-share__peerId'
export const ROOM_ID = '__web-share__rommId'
export const ROOM_CODE_KEY = '__web-share__room-code'

export const DISPLAY_NAME = '__web-share__displayName'
export const USER_INFO = '__web-share__userInfo'
export const SELECTED_PEER_ID = '__web-share__selectedPeerId'

export const HEART_BEAT = '__web-share__heartBeat'
export const HEART_BEAT_TIME = 1000 * 60 * 5

// ======================
// * Env
// ======================

/** WS 服务器地址 */
export const SERVER_URL = 'VITE_SERVER_URL'

// ======================
// * Code
// ======================
export enum ErrorCode {
  QRCodeExpired,
}
