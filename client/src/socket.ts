import { io } from 'socket.io-client';

// Same-origin by default (production + Vite proxy). Set VITE_SERVER_URL if the backend is hosted separately.
export const socket = io(import.meta.env.VITE_SERVER_URL || undefined, { autoConnect: false });
