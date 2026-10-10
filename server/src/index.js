import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { RoomManager } from './RoomManager.js';
import { SocketHandler } from './SocketHandler.js';

const PORT = process.env.PORT || 4000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, '../../client/dist');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_ORIGIN || '*' } });
const rooms = new RoomManager(io);
new SocketHandler(io, rooms).register();

app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.rooms.size }));
app.use(express.static(dist));
app.use((_req, res) => res.sendFile(path.join(dist, 'index.html'))); // SPA fallback

server.listen(PORT, () => console.log(`TubeTogether listening on :${PORT}`));
