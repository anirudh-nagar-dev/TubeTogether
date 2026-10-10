import { Participant, ROLES } from './Participant.js';
import { PLAYBACK_ACTIONS } from './Room.js';

/** Registers every Socket.IO event. Each handler validates the caller's role BEFORE acting. */
export class SocketHandler {
  constructor(io, rooms) { this.io = io; this.rooms = rooms; }

  register() { this.io.on('connection', (socket) => this.onConnection(socket)); }

  onConnection(socket) {
    const ctx = { room: null };
    const me = () => ctx.room?.participants.get(socket.id);
    const need = () => { const p = me(); if (!p) throw new Error('Join a room first'); return p; };
    const needControl = () => { const p = need(); if (!p.canControl) throw new Error('Only the host or a moderator can do that'); return p; };
    const needHost = () => { const p = need(); if (!p.isHost) throw new Error('Only the host can do that'); return p; };
    const target = (userId) => { const t = ctx.room.participants.get(userId); if (!t) throw new Error('User not in room'); return t; };

    // Wraps a handler so thrown errors become { ok:false, error } acks + an error_message event.
    const on = (event, fn) => socket.on(event, (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try { reply({ ok: true, ...(fn(payload ?? {}) ?? {}) }); }
      catch (e) { socket.emit('error_message', e.message); reply({ ok: false, error: e.message }); }
    });

    on('join_room', ({ roomId, username, create }) => {
      const name = String(username ?? '').trim().slice(0, 24);
      if (!name) throw new Error('Enter a display name');
      this.leave(socket, ctx);
      const room = create ? this.rooms.create() : this.rooms.get(roomId);
      if (!room) throw new Error('Room not found. Check the code and try again.');
      const p = room.add(new Participant(socket, name));
      ctx.room = room;
      socket.to(room.code).emit('user_joined', { username: p.username, userId: p.id, role: p.role, participants: room.list() });
      room.emitRequests();
      return { roomId: room.code, you: p.toJSON(), participants: room.list(), state: room.snapshot(), chat: room.chat };
    });

    on('leave_room', () => this.leave(socket, ctx));
    socket.on('disconnect', () => this.leave(socket, ctx));

    for (const action of PLAYBACK_ACTIONS) {
      on(action, (payload) => { needControl(); ctx.room.applyPlayback(action, payload); });
    }

    // Participants ask; Host/Moderator approve or reject.
    on('request_action', ({ action, payload }) => {
      const p = need();
      if (!PLAYBACK_ACTIONS.includes(action)) throw new Error('Unknown action');
      if (p.canControl) { ctx.room.applyPlayback(action, payload); return; }
      const req = ctx.room.addRequest(p, action, payload);
      ctx.room.emitRequests();
      return { requestId: req.id };
    });

    on('resolve_request', ({ requestId, approve }) => {
      const p = needControl();
      const req = ctx.room.requests.get(requestId);
      if (!req) throw new Error('Request already handled');
      ctx.room.requests.delete(requestId);
      if (approve) ctx.room.applyPlayback(req.action, req.payload);
      ctx.room.broadcast('request_resolved', { requestId, approved: !!approve, username: req.username, userId: req.userId, action: req.action, by: p.username });
      ctx.room.emitRequests();
    });

    on('assign_role', ({ userId, role }) => {
      needHost();
      if (![ROLES.MODERATOR, ROLES.PARTICIPANT].includes(role)) throw new Error('Invalid role');
      const t = target(userId);
      if (t.isHost) throw new Error("The host's role can't be changed");
      t.role = role;
      ctx.room.broadcast('role_assigned', { userId: t.id, username: t.username, role, participants: ctx.room.list() });
      ctx.room.emitRequests();
    });

    on('remove_participant', ({ userId }) => {
      needHost();
      if (userId === socket.id) throw new Error("You can't remove yourself");
      const t = target(userId);
      ctx.room.remove(t.id);
      t.socket.emit('removed');
      ctx.room.broadcast('participant_removed', { userId: t.id, username: t.username, participants: ctx.room.list() });
      ctx.room.emitRequests();
    });

    on('transfer_host', ({ userId }) => {
      const host = needHost();
      const t = target(userId);
      if (t.id === host.id) throw new Error('You are already the host');
      host.role = ROLES.MODERATOR;
      t.role = ROLES.HOST;
      ctx.room.broadcast('host_transferred', { userId: t.id, username: t.username, participants: ctx.room.list() });
      ctx.room.emitRequests();
    });

    on('chat_message', ({ text }) => {
      const p = need();
      const clean = String(text ?? '').trim().slice(0, 300);
      if (!clean) return;
      ctx.room.broadcast('chat_message', ctx.room.addChat(p, clean));
    });
  }

  leave(socket, ctx) {
    const room = ctx.room;
    if (!room) return;
    ctx.room = null;
    const p = room.participants.get(socket.id);
    if (!p) return;
    const newHost = room.remove(socket.id);
    socket.to(room.code).emit('user_left', { username: p.username, userId: p.id, participants: room.list() });
    if (newHost) room.broadcast('host_transferred', { userId: newHost.id, username: newHost.username, participants: room.list() });
    room.emitRequests();
    this.rooms.deleteIfEmpty(room);
  }
}
