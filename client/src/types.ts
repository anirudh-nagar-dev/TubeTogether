export type Role = 'host' | 'moderator' | 'participant';
export interface User { id: string; username: string; role: Role }
export interface SyncState { videoId: string; playState: 'playing' | 'paused'; currentTime: number }
export interface ChatMsg { id: string; userId: string; username: string; text: string; ts: number }
export interface PlayRequest { id: string; userId: string; username: string; action: Action; payload: { time?: number; videoId?: string }; ts: number }
export type Action = 'play' | 'pause' | 'seek' | 'change_video';
export interface Session { roomId: string; you: User; participants: User[]; state: SyncState; chat: ChatMsg[] }
