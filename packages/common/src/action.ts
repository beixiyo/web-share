export enum Action {
  Close = 'Close',
  Ping = 'Ping',

  NotifyUserInfo = 'NotifyUserInfo',
  JoinPublicRoom = 'JoinPublicRoom',
  LeavePublicRoom = 'LeavePublicRoom',
  
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
}