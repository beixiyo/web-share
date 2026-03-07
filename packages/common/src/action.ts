export enum Action {
  Close = 'Close',
  Ping = 'Ping',

  NotifyUserInfo = 'NotifyUserInfo',
  JoinRoom = 'JoinRoom',
  LeaveRoom = 'LeaveRoom',

  JoinRoomByQRCode = 'JoinRoomByQRCode',
  JoinRoomByInvite = 'JoinRoomByInvite',

  JoinRoomByCode = 'JoinRoomByCode',
  RoomCodeExpired = 'RoomCodeExpired',

  UserReconnected = 'UserReconnected',

  GetOrCreateInvite = 'GetOrCreateInvite',
  GetCurrentInvite = 'GetCurrentInvite',
  InviteCreated = 'InviteCreated',
  InviteInvalidated = 'InviteInvalidated',
  RefreshInvite = 'RefreshInvite',

  Relay = 'Relay',
  Offer = 'Offer',
  Answer = 'Answer',
  Candidate = 'Candidate',

  Text = 'Text',
  FileMetas = 'FileMetas',
  DenyFile = 'DenyFile',

  FileBufferIndex = 'FileBufferIndex',
  NewFile = 'NewFile',
  FileDone = 'FileDone',
  Progress = 'Progress',

  Error = 'Error',

  RTCError = 'RTCError',
  RTCErrorBroadcast = 'RTCErrorBroadcast',

  ResumeInfo = 'ResumeInfo',
}
