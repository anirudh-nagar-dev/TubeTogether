# TubeTogether: YouTube Watch Party

Watch YouTube together in real time. Create a room, share the code or link, and everyone sees the same video, position and play state. Playback is controlled by the Host and Moderators; Participants can *request* changes.

**Live URL:** `https://<your-app>.onrender.com` (add after deploying)

## Features
- Create/join rooms by 6-character code or invite link
- Real-time sync of play, pause, seek and change-video (Socket.IO / WebSockets)
- Roles: **Host** (creator), **Moderator**, **Participant**; the server enforces them
- Host can assign roles, remove participants, and transfer host
- Participants request play/pause/seek/change-video; Host/Moderators approve or decline
- Participant list with roles, live chat, late joiners start at the current position
- If the host leaves, the next Moderator (else the longest-present user) becomes host

## Stack
React + TypeScript + Vite (client), Node.js + Express + Socket.IO (server), YouTube IFrame API. Room state is in memory (see trade-offs).

## Run locally
Requires Node 18+.
```bash
npm run install:all
npm run dev:server        # terminal 1, http://localhost:4000
npm run dev:client        # terminal 2, http://localhost:5173 (proxies /socket.io to :4000)
```
Open two browser windows (one normal, one incognito) to test roles.

Production-style single process:
```bash
npm run build && npm start   # http://localhost:4000
```

## Deploy on Render (one Web Service, WebSockets supported)
1. Push this repo to GitHub.
2. Render > New > Web Service > pick the repo (or use the included `render.yaml`).
3. Build command `npm run build`, start command `npm start`, health check `/health`.
4. Optional env: `NODE_VERSION=20`. `CLIENT_ORIGIN` only if the client is hosted elsewhere (then also set `VITE_SERVER_URL` at build time).
5. Put the resulting URL at the top of this README.

The Express server serves the built client and the Socket.IO endpoint from the same origin, so no CORS setup is needed. On Render's free plan the service sleeps when idle (first load is slow) and in-memory rooms are lost on restart.

## Architecture
```
Browser (React) <-- WebSocket (Socket.IO) --> Node server
  YouTube IFrame player                         SocketHandler  validates role, then calls
  emits events (play, seek, ...)                Room           authoritative state + broadcast
  applies sync_state                            RoomManager    creates/finds rooms
                                                Participant    id, username, role, canControl
```
1. A client connects and emits `join_room`. The server adds it to a Socket.IO room named after the code. The first user becomes Host; others are Participants. The ack returns roles, chat and the current state.
2. Host/Moderator actions (`play`, `pause`, `seek`, `change_video`) go to the server, which checks `participant.canControl`. A rejected event gets an `error_message` and changes nothing.
3. The server updates the single source of truth in `Room.state` and broadcasts `sync_state {videoId, playState, currentTime}`. Every client (including the sender) applies it to its YouTube player.
4. While playing, the server extrapolates `currentTime` from the last update, so late joiners and resyncs land at the right moment.
5. Participants' players are covered by a click-blocking overlay and drift-corrected (>2s off) back to the room position. They use `request_action`; the request is queued, sent only to Host/Moderators (`requests_updated`), and `resolve_request` applies it on approval.
6. Role changes, kicks and host transfer are broadcast (`role_assigned`, `participant_removed`, `host_transferred`) so every UI updates and disables controls.

### Events
| Event | Direction | Payload | Who may send |
|---|---|---|---|
| `join_room` | C>S | `{roomId, username, create?}` | anyone |
| `leave_room` | C>S | `{}` | anyone |
| `play` / `pause` | C>S | `{time?}` | Host, Moderator |
| `seek` | C>S | `{time}` | Host, Moderator |
| `change_video` | C>S | `{videoId}` | Host, Moderator |
| `request_action` | C>S | `{action, payload}` | anyone (queued unless Host/Mod) |
| `resolve_request` | C>S | `{requestId, approve}` | Host, Moderator |
| `assign_role` | C>S | `{userId, role}` | Host |
| `remove_participant` | C>S | `{userId}` | Host |
| `transfer_host` | C>S | `{userId}` | Host |
| `chat_message` | C>S | `{text}` | anyone |
| `sync_state` | S>C | `{videoId, playState, currentTime}` | n/a |
| `user_joined` / `user_left` | S>C | `{username, userId, role?, participants}` | n/a |
| `role_assigned` | S>C | `{userId, username, role, participants}` | n/a |
| `participant_removed` | S>C | `{userId, participants}` | n/a |
| `host_transferred`, `requests_updated`, `request_resolved`, `chat_message`, `removed`, `error_message` | S>C | see code | n/a |

## Code map
- `server/src/Participant.js`: roles and `canControl`
- `server/src/Room.js`: state, playback logic, requests, chat
- `server/src/RoomManager.js`: room codes and lifecycle
- `server/src/SocketHandler.js`: event handlers with role guards (`needControl`, `needHost`)
- `client/src/Player.tsx`: YouTube IFrame wrapper (apply remote state, detect local actions)
- `client/src/RoomView.tsx`: room UI, participants, requests, chat

## Trade-offs and known limits
- **In-memory rooms**: simple and fast, but lost on restart and tied to one server instance. To scale horizontally: Socket.IO Redis adapter + sticky sessions at the load balancer, and rooms (state, roles) moved to Redis/Postgres.
- **Identity** is the socket id, so a reconnect re-joins as a new participant (role resets to Participant). Persistent user IDs/auth would fix this.
- **Seek detection**: the IFrame API has no seek event, so Host/Moderator scrubs are detected by polling the player time (every 700ms, >2s jump).
- **Autoplay**: browsers can block unmuted autoplay until the user has interacted with the page; a click on Join/Create normally counts.
- Latency is not compensated beyond server time extrapolation; expect sub-second drift.
- Some videos disable embedding and will not play in the IFrame API.
