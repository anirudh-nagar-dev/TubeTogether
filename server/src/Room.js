import { randomUUID } from 'node:crypto';
import { ROLES } from './Participant.js';

export const VIDEO_ID = /^[\w-]{11}$/;
export const PLAYBACK_ACTIONS = ['play', 'pause', 'seek', 'change_video'];
const DEFAULT_VIDEO = 'M7lc1UVf-VE'; // YouTube IFrame API demo video

/** A watch room: participants, authoritative playback state, approval requests, chat. */
export class Room {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.participants = new Map();
    this.requests = new Map();
    this.chat = [];
    this.state = { videoId: DEFAULT_VIDEO, playState: 'paused', currentTime: 0, updatedAt: Date.now() };
  }

  get size() { return this.participants.size; }
  list() { return [...this.participants.values()].map((p) => p.toJSON()); }
  broadcast(event, payload) { this.io.to(this.code).emit(event, payload); }

  /** Playback position now; extrapolates while playing so late joiners land correctly. */
  liveTime() {
    const s = this.state;
    return s.playState === 'playing' ? s.currentTime + (Date.now() - s.updatedAt) / 1000 : s.currentTime;
  }

  snapshot() {
    return { videoId: this.state.videoId, playState: this.state.playState, currentTime: this.liveTime() };
  }

  // ---- membership -------------------------------------------------------
  add(participant) {
    if (this.size === 0) participant.role = ROLES.HOST; // first in = creator = host
    this.participants.set(participant.id, participant);
    participant.socket.join(this.code);
    return participant;
  }

  /** Removes a user; promotes a new host if the host left. Returns the new host, if any. */
  remove(id) {
    const p = this.participants.get(id);
    if (!p) return null;
    this.participants.delete(id);
    p.socket.leave(this.code);
    for (const [rid, r] of this.requests) if (r.userId === id) this.requests.delete(rid);
    if (!p.isHost || this.size === 0) return null;
    const next = [...this.participants.values()].find((x) => x.role === ROLES.MODERATOR)
      ?? this.participants.values().next().value;
    next.role = ROLES.HOST;
    return next;
  }

  // ---- playback ---------------------------------------------------------
  /** Applies an already-authorised playback action and broadcasts sync_state. */
  applyPlayback(action, payload = {}) {
    const s = this.state;
    const t = Number(payload.time);
    const hasTime = payload.time != null && Number.isFinite(t) && t >= 0;
    if (action === 'play') { s.currentTime = hasTime ? t : this.liveTime(); s.playState = 'playing'; }
    else if (action === 'pause') { s.currentTime = hasTime ? t : this.liveTime(); s.playState = 'paused'; }
    else if (action === 'seek') { if (!hasTime) throw new Error('Invalid seek time'); s.currentTime = t; }
    else if (action === 'change_video') {
      if (!VIDEO_ID.test(payload.videoId ?? '')) throw new Error('Invalid YouTube video');
      s.videoId = payload.videoId; s.currentTime = 0; s.playState = 'playing';
    } else throw new Error('Unknown action');
    s.updatedAt = Date.now();
    this.broadcast('sync_state', this.snapshot());
  }

  // ---- approval requests --------------------------------------------------
  addRequest(user, action, payload) {
    const mine = [...this.requests.values()].filter((r) => r.userId === user.id).length;
    if (mine >= 5) throw new Error('You already have 5 pending requests');
    const req = { id: randomUUID(), userId: user.id, username: user.username, action, payload: payload ?? {}, ts: Date.now() };
    this.requests.set(req.id, req);
    return req;
  }

  /** Only Host/Moderators receive the queue; everyone else gets an empty list. */
  emitRequests() {
    const queue = [...this.requests.values()];
    for (const p of this.participants.values()) p.socket.emit('requests_updated', p.canControl ? queue : []);
  }

  addChat(user, text) {
    const msg = { id: randomUUID(), userId: user.id, username: user.username, text, ts: Date.now() };
    this.chat.push(msg);
    if (this.chat.length > 100) this.chat.shift();
    return msg;
  }
}
