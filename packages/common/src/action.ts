export enum Action {
  Close = 'Close',
  Ping = 'Ping',

  NotifyUserInfo = 'NotifyUserInfo',
  JoinRoom = 'JoinRoom',
  LeaveRoom = 'LeaveRoom',

  CreateDirectRoom = 'CreateDirectRoom',
  JoinDirectRoom = 'JoinDirectRoom',
  DirectRoomCreated = 'DirectRoomCreated',

  CreateRoomWithCode = 'CreateRoomWithCode',
  RoomCodeCreated = 'RoomCodeCreated',
  JoinRoomWithCode = 'JoinRoomWithCode',

  UserReconnected = 'UserReconnected',

  Relay = 'Relay',
  Offer = 'Offer',
  Answer = 'Answer',
  Candidate = 'Candidate',

  Text = 'Text',
  FileMetas = 'FileMetas',
  AcceptFile = 'AcceptFile',
  DenyFile = 'DenyFile',

  FileBufferIndex = 'FileBufferIndex',
  NewFile = 'NewFile',
  FileDone = 'FileDone',
  Progress = 'Progress',

  Error = 'Error',

  RTCError = 'RTCError',
  RTCErrorBroadcast = 'RTCErrorBroadcast',
}