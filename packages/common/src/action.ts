export enum Action {
  Close = 'Close',
  Ping = 'Ping',

  NotifyUserInfo = 'NotifyUserInfo',
  JoinRoom = 'JoinRoom',
  LeaveRoom = 'LeaveRoom',

  CreateQRCodeRoom = 'CreateQRCodeRoom',
  JoinDirectRoom = 'JoinDirectRoom',
  DirectRoomCreated = 'DirectRoomCreated',

  CreateRoomWithCode = 'CreateRoomWithCode',
  RoomCodeCreated = 'RoomCodeCreated',
  JoinRoomWithCode = 'JoinRoomWithCode',
  RoomCodeExpired = 'RoomCodeExpired',

  UserReconnected = 'UserReconnected',

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
