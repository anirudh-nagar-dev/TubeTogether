import { Room } from './Room.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no look-alike characters

export class RoomManager {
  constructor(io) { this.io = io; this.rooms = new Map(); }

  create() {
    let code;
    do { code = Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join(''); }
    while (this.rooms.has(code));
    const room = new Room(code, this.io);
    this.rooms.set(code, room);
    return room;
  }

  get(code) { return this.rooms.get(String(code ?? '').trim().toUpperCase()); }
  deleteIfEmpty(room) { if (room.size === 0) this.rooms.delete(room.code); }
}
