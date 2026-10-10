export const ROLES = Object.freeze({
  HOST: 'host',
  MODERATOR: 'moderator',
  PARTICIPANT: 'participant',
});

/** One connected user inside a room. Owns its role and permission checks. */
export class Participant {
  constructor(socket, username, role = ROLES.PARTICIPANT) {
    this.id = socket.id;
    this.socket = socket;
    this.username = username;
    this.role = role;
  }

  get isHost() { return this.role === ROLES.HOST; }

  /** Host and Moderator may control playback and resolve requests. */
  get canControl() { return this.role === ROLES.HOST || this.role === ROLES.MODERATOR; }

  toJSON() { return { id: this.id, username: this.username, role: this.role }; }
}
