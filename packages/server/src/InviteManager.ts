import type { JoinInviteInfo, RoomInviteInfo } from 'web-share-common'
import { InviteInvalidatedReason, InviteStatus } from 'web-share-common'

/** 默认房间的固定 roomId，仅在使用 defaultRoomCode 时存在 */
export const DEFAULT_ROOM_ID = 'default'

export type InviteManagerOpts = {
  inviteTTL: number
  roomEmptyGraceMs: number
  /** 默认房间码；设置后该码始终可加入房间 default，且不校验房间是否有人 */
  defaultRoomCode?: string
}

export type ResolveInviteByCodeResult
  = | { invite: RoomInviteInfo }
    | { reason: InviteInvalidatedReason.NotFound | InviteInvalidatedReason.Expired | InviteInvalidatedReason.RoomUnavailable }

export type ResolveInviteByJoinPayloadResult
  = | { invite: RoomInviteInfo }
    | { reason: InviteInvalidatedReason.NotFound | InviteInvalidatedReason.Expired | InviteInvalidatedReason.RoomUnavailable }

/**
 * 邀请管理：创建/解析/失效邀请，空房后延迟清理
 * 单一职责：邀请生命周期与房间码映射，不关心 WebSocket 与房间成员细节
 */
export class InviteManager {
  private inviteMap = new Map<string, RoomInviteInfo>()
  private roomCodeMap = new Map<string, string>()
  private roomInviteMap = new Map<string, string>()
  private pendingEmptyRoomCleanups = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private opts: InviteManagerOpts,
    /** 判断房间是否仍有在线成员，会话恢复宽限不计入在线状态 */
    private hasActiveRoom: (roomId: string) => boolean,
  ) {}

  cancelEmptyRoomCleanup(roomId: string) {
    const timeout = this.pendingEmptyRoomCleanups.get(roomId)
    if (!timeout)
      return
    clearTimeout(timeout)
    this.pendingEmptyRoomCleanups.delete(roomId)
    console.log(`取消空房邀请清理任务: ${roomId}`)
  }

  scheduleEmptyRoomCleanup(roomId: string) {
    const { roomEmptyGraceMs } = this.opts
    this.cancelEmptyRoomCleanup(roomId)

    if (roomEmptyGraceMs <= 0) {
      this.cleanupInviteForRoom(roomId)
      return
    }

    const timeout = setTimeout(() => {
      this.pendingEmptyRoomCleanups.delete(roomId)
      if (this.hasActiveRoom(roomId)) {
        console.log(`房间 ${roomId} 已重新活跃，跳过邀请清理`)
        return
      }
      console.log(`房间 ${roomId} 空房宽限期结束，清理对应邀请`)
      this.cleanupInviteForRoom(roomId)
    }, roomEmptyGraceMs)

    this.pendingEmptyRoomCleanups.set(roomId, timeout)
    console.log(`房间 ${roomId} 已进入空房宽限期: ${roomEmptyGraceMs}ms`)
  }

  isPendingEmptyRoomCleanup(roomId: string): boolean {
    return this.pendingEmptyRoomCleanups.has(roomId)
  }

  getInviteForRoom(roomId: string): RoomInviteInfo | null {
    const inviteId = this.roomInviteMap.get(roomId)
    if (!inviteId)
      return null
    return this.inviteMap.get(inviteId) ?? null
  }

  getActiveInviteForRoom(roomId: string): RoomInviteInfo | null {
    const invite = this.getInviteForRoom(roomId)
    if (!invite)
      return null
    if (this.isInviteExpired(invite)) {
      this.invalidateInvite(invite, InviteInvalidatedReason.Expired)
      return null
    }
    if (!this.hasActiveRoom(invite.roomId)) {
      if (this.pendingEmptyRoomCleanups.has(invite.roomId))
        return invite
      this.invalidateInvite(invite, InviteInvalidatedReason.RoomUnavailable)
      return null
    }
    return invite
  }

  createInvite(roomId: string): RoomInviteInfo {
    const roomCode = this.generateRoomCode()
    const ttl = this.opts.inviteTTL
    const expiresAt = ttl > 0
      ? Date.now() + ttl
      : ttl
    const invite: RoomInviteInfo = {
      inviteId: crypto.randomUUID(),
      roomId,
      roomCode,
      joinToken: crypto.randomUUID(),
      expiresAt,
      status: InviteStatus.Active,
    }
    this.inviteMap.set(invite.inviteId, invite)
    this.roomInviteMap.set(roomId, invite.inviteId)
    this.roomCodeMap.set(roomCode, invite.inviteId)
    return invite
  }

  getOrCreateInvite(roomId: string): RoomInviteInfo {
    const existing = this.getActiveInviteForRoom(roomId)
    if (existing)
      return existing
    return this.createInvite(roomId)
  }

  refreshInvite(roomId: string): RoomInviteInfo {
    const existing = this.getInviteForRoom(roomId)
    if (existing)
      this.invalidateInvite(existing, InviteInvalidatedReason.Revoked)
    return this.createInvite(roomId)
  }

  resolveInviteByCode(roomCode: string): ResolveInviteByCodeResult {
    roomCode = roomCode.trim()
    if (this.opts.defaultRoomCode && roomCode.trim() === this.opts.defaultRoomCode)
      return { invite: this.getDefaultRoomInvite() }

    const inviteId = this.roomCodeMap.get(roomCode)
    if (!inviteId)
      return { reason: InviteInvalidatedReason.NotFound }
    const invite = this.inviteMap.get(inviteId)
    if (!invite) {
      this.roomCodeMap.delete(roomCode)
      return { reason: InviteInvalidatedReason.NotFound }
    }
    if (this.isInviteExpired(invite)) {
      this.invalidateInvite(invite, InviteInvalidatedReason.Expired)
      return { reason: InviteInvalidatedReason.Expired }
    }
    if (!this.hasActiveRoom(invite.roomId)) {
      if (this.pendingEmptyRoomCleanups.has(invite.roomId))
        return { reason: InviteInvalidatedReason.RoomUnavailable }
      this.invalidateInvite(invite, InviteInvalidatedReason.RoomUnavailable)
      return { reason: InviteInvalidatedReason.RoomUnavailable }
    }
    return { invite }
  }

  resolveInviteByJoinPayload(data: JoinInviteInfo): ResolveInviteByJoinPayloadResult {
    const invite = this.inviteMap.get(data.inviteId)
    if (!invite || invite.joinToken !== data.joinToken)
      return { reason: InviteInvalidatedReason.NotFound }
    if (this.isInviteExpired(invite)) {
      this.invalidateInvite(invite, InviteInvalidatedReason.Expired)
      return { reason: InviteInvalidatedReason.Expired }
    }
    if (!this.hasActiveRoom(invite.roomId)) {
      if (this.pendingEmptyRoomCleanups.has(invite.roomId))
        return { reason: InviteInvalidatedReason.RoomUnavailable }
      this.invalidateInvite(invite, InviteInvalidatedReason.RoomUnavailable)
      return { reason: InviteInvalidatedReason.RoomUnavailable }
    }
    return { invite }
  }

  invalidateInvite(
    invite: RoomInviteInfo,
    reason: InviteInvalidatedReason.Expired | InviteInvalidatedReason.RoomUnavailable | InviteInvalidatedReason.Revoked,
  ) {
    if (!this.inviteMap.has(invite.inviteId))
      return
    this.cleanupInviteById(invite.inviteId)
    console.log(`邀请失效: ${invite.roomCode}, 原因: ${reason}`)
  }

  private isInviteExpired(invite: RoomInviteInfo): boolean {
    if (invite.expiresAt <= 0)
      return false
    return invite.expiresAt < Date.now()
  }

  private cleanupInviteById(inviteId: string) {
    const invite = this.inviteMap.get(inviteId)
    if (!invite)
      return
    this.cancelEmptyRoomCleanup(invite.roomId)
    this.inviteMap.delete(inviteId)
    this.roomInviteMap.delete(invite.roomId)
    this.roomCodeMap.delete(invite.roomCode)
    console.log(`清理房间邀请映射: ${invite.roomCode} -> ${invite.roomId}`)
  }

  private cleanupInviteForRoom(roomId: string) {
    const inviteId = this.roomInviteMap.get(roomId)
    if (!inviteId)
      return
    this.cleanupInviteById(inviteId)
  }

  private generateRoomCode(): string {
    let code: string
    do {
      code = Math.floor(100000 + Math.random() * 900000).toString()
    }
    while (this.roomCodeMap.has(code) || code === this.opts.defaultRoomCode)

    return code
  }

  /** 定期清理过期邀请 */
  cleanupExpiredInvites() {
    for (const [inviteId, invite] of this.inviteMap) {
      if (this.isInviteExpired(invite)) {
        this.cleanupInviteById(inviteId)
      }
    }
  }

  /** 释放空房清理任务及全部内存映射；重复调用无副作用 */
  close() {
    for (const timeout of this.pendingEmptyRoomCleanups.values()) clearTimeout(timeout)
    this.pendingEmptyRoomCleanups.clear()
    this.inviteMap.clear()
    this.roomCodeMap.clear()
    this.roomInviteMap.clear()
  }

  /** 默认房间的虚拟邀请，不写入 inviteMap，永不过期且不校验房间是否有人 */
  private getDefaultRoomInvite(): RoomInviteInfo {
    const code = this.opts.defaultRoomCode!
    return {
      inviteId: `default-${code}`,
      roomId: DEFAULT_ROOM_ID,
      roomCode: code,
      joinToken: `default-${code}`,
      expiresAt: -1,
      status: InviteStatus.Active,
    }
  }
}
