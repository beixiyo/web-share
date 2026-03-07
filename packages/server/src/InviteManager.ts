import type { JoinInviteInfo, RoomInviteInfo } from 'web-share-common'

export type InviteManagerOpts = {
  inviteTTL: number
  roomEmptyGraceMs: number
}

export type ResolveInviteByCodeResult =
  | { invite: RoomInviteInfo }
  | { reason: 'not_found' | 'expired' | 'room_unavailable' }

export type ResolveInviteByJoinPayloadResult =
  | { invite: RoomInviteInfo }
  | { reason: 'not_found' | 'expired' | 'room_unavailable' }

/**
 * 邀请管理：创建/解析/失效邀请，空房后延迟清理。
 * 单一职责：邀请生命周期与房间码映射，不关心 WebSocket 与房间成员细节。
 */
export class InviteManager {
  private inviteMap = new Map<string, RoomInviteInfo>()
  private roomCodeMap = new Map<string, string>()
  private roomInviteMap = new Map<string, string>()
  private pendingEmptyRoomCleanups = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private opts: InviteManagerOpts,
    /** 判断房间是否仍有活跃成员（未空房或未在宽限期内） */
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
      this.invalidateInvite(invite, 'expired')
      return null
    }
    if (!this.hasActiveRoom(invite.roomId)) {
      if (this.pendingEmptyRoomCleanups.has(invite.roomId))
        return invite
      this.invalidateInvite(invite, 'room_unavailable')
      return null
    }
    return invite
  }

  createInvite(roomId: string): RoomInviteInfo {
    const roomCode = this.generateRoomCode()
    const ttl = this.opts.inviteTTL
    const expiresAt = ttl > 0 ? Date.now() + ttl : ttl
    const invite: RoomInviteInfo = {
      inviteId: crypto.randomUUID(),
      roomId,
      roomCode,
      joinToken: crypto.randomUUID(),
      expiresAt,
      status: 'active',
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
      this.invalidateInvite(existing, 'revoked')
    return this.createInvite(roomId)
  }

  resolveInviteByCode(roomCode: string): ResolveInviteByCodeResult {
    const inviteId = this.roomCodeMap.get(roomCode)
    if (!inviteId)
      return { reason: 'not_found' }
    const invite = this.inviteMap.get(inviteId)
    if (!invite) {
      this.roomCodeMap.delete(roomCode)
      return { reason: 'not_found' }
    }
    if (this.isInviteExpired(invite)) {
      this.invalidateInvite(invite, 'expired')
      return { reason: 'expired' }
    }
    if (!this.hasActiveRoom(invite.roomId)) {
      if (this.pendingEmptyRoomCleanups.has(invite.roomId))
        return { reason: 'room_unavailable' }
      this.invalidateInvite(invite, 'room_unavailable')
      return { reason: 'room_unavailable' }
    }
    return { invite }
  }

  resolveInviteByJoinPayload(data: JoinInviteInfo): ResolveInviteByJoinPayloadResult {
    const invite = this.inviteMap.get(data.inviteId)
    if (!invite || invite.joinToken !== data.joinToken)
      return { reason: 'not_found' }
    if (this.isInviteExpired(invite)) {
      this.invalidateInvite(invite, 'expired')
      return { reason: 'expired' }
    }
    if (!this.hasActiveRoom(invite.roomId)) {
      if (this.pendingEmptyRoomCleanups.has(invite.roomId))
        return { reason: 'room_unavailable' }
      this.invalidateInvite(invite, 'room_unavailable')
      return { reason: 'room_unavailable' }
    }
    return { invite }
  }

  invalidateInvite(invite: RoomInviteInfo, reason: 'expired' | 'room_unavailable' | 'revoked') {
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
    } while (this.roomCodeMap.has(code))
    return code
  }
}
