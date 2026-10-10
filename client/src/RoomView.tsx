import { useEffect, useRef, useState } from 'react';
import { socket } from './socket';
import Player from './Player';
import { parseTime, parseVideoId } from './youtube';
import type { Action, ChatMsg, PlayRequest, Role, Session, SyncState, User } from './types';

const LABEL: Record<Action, string> = { play: 'play', pause: 'pause', seek: 'seek', change_video: 'change the video' };

export default function RoomView({ session, username, onExit }: { session: Session; username: string; onExit: () => void }) {
  const [me, setMe] = useState<User>(session.you);
  const [people, setPeople] = useState<User[]>(session.participants);
  const [state, setState] = useState<SyncState>(session.state);
  const [chat, setChat] = useState<ChatMsg[]>(session.chat);
  const [requests, setRequests] = useState<PlayRequest[]>([]);
  const [notice, setNotice] = useState('');
  const [offline, setOffline] = useState(false);
  const [url, setUrl] = useState('');
  const [seekTo, setSeekTo] = useState('');
  const [text, setText] = useState('');
  const myId = useRef(session.you.id);
  const logRef = useRef<HTMLDivElement>(null);

  const canControl = me.role === 'host' || me.role === 'moderator';
  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 4000); };

  // Keep "me" in sync with whatever role the server says I have.
  const syncPeople = (list: User[]) => {
    setPeople(list);
    const mine = list.find((p) => p.id === myId.current);
    if (mine) setMe(mine);
  };

  useEffect(() => {
    const h: Record<string, (d: any) => void> = {
      sync_state: setState,
      user_joined: (d) => { syncPeople(d.participants); flash(`${d.username} joined`); },
      user_left: (d) => { syncPeople(d.participants); flash(`${d.username} left`); },
      role_assigned: (d) => { syncPeople(d.participants); flash(`${d.username} is now ${d.role}`); },
      host_transferred: (d) => { syncPeople(d.participants); flash(`${d.username} is now the host`); },
      participant_removed: (d) => syncPeople(d.participants),
      requests_updated: setRequests,
      request_resolved: (d) => { if (d.userId === myId.current) flash(`${d.by} ${d.approved ? 'approved' : 'declined'} your request to ${LABEL[d.action as Action]}`); },
      chat_message: (d) => setChat((c) => [...c.slice(-99), d]),
      error_message: flash,
      removed: () => { alert('The host removed you from this room.'); onExit(); },
      disconnect: () => setOffline(true),
    };
    // After a network drop the server has forgotten us, so rejoin the same room.
    const reconnect = () => {
      if (!offline) return;
      socket.emit('join_room', { roomId: session.roomId, username }, (res: any) => {
        if (!res.ok) { alert(res.error); return onExit(); }
        myId.current = res.you.id; setMe(res.you); setPeople(res.participants); setState(res.state); setChat(res.chat); setOffline(false);
      });
    };
    Object.entries(h).forEach(([e, fn]) => socket.on(e, fn));
    socket.on('connect', reconnect);
    return () => { Object.entries(h).forEach(([e, fn]) => socket.off(e, fn)); socket.off('connect', reconnect); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline]);

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [chat]);

  // Host/Moderator send events directly; Participants send a request that needs approval.
  const act = (action: Action, payload: object = {}) => {
    socket.emit(canControl ? action : 'request_action', canControl ? payload : { action, payload }, (res: any) => {
      if (res.ok && !canControl) flash('Request sent. Waiting for the host or a moderator.');
    });
  };

  const submitVideo = () => {
    const id = parseVideoId(url);
    if (!id) return flash('That does not look like a YouTube link.');
    act('change_video', { videoId: id }); setUrl('');
  };
  const submitSeek = () => {
    const t = parseTime(seekTo);
    if (t === null) return flash('Use seconds (90) or minutes:seconds (1:30).');
    act('seek', { time: t }); setSeekTo('');
  };
  const send = () => { if (text.trim()) { socket.emit('chat_message', { text }); setText(''); } };
  const link = `${location.origin}/?room=${session.roomId}`;

  return (
    <div className="room">
      <header>
        <div className="brand">TubeTogether</div>
        <button className="ticket" onClick={() => { navigator.clipboard?.writeText(link); flash('Invite link copied'); }} title="Copy invite link">
          Room <b>{session.roomId}</b> · copy link
        </button>
        <span className={`badge ${me.role}`}>You: {me.role}</span>
        <button onClick={onExit}>Leave</button>
      </header>
      {offline && <div className="banner">Connection lost. Reconnecting…</div>}
      {notice && <div className="toast" role="status">{notice}</div>}

      <section className="stage">
        <Player key={canControl ? 'control' : 'watch'} state={state} canControl={canControl}
          onPlay={(t) => socket.emit('play', { time: t })}
          onPause={(t) => socket.emit('pause', { time: t })}
          onSeek={(t) => socket.emit('seek', { time: t })} />

        <div className="controls">
          <div className="row">
            <button onClick={() => act('play')}>{canControl ? 'Play' : 'Request play'}</button>
            <button onClick={() => act('pause')}>{canControl ? 'Pause' : 'Request pause'}</button>
            <input value={seekTo} onChange={(e) => setSeekTo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitSeek()} placeholder="Seek to 1:30" />
            <button onClick={submitSeek}>{canControl ? 'Seek' : 'Request seek'}</button>
          </div>
          <div className="row">
            <input className="grow" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitVideo()} placeholder="Paste a YouTube link" />
            <button className="primary" onClick={submitVideo}>{canControl ? 'Change video' : 'Request change'}</button>
          </div>
          {!canControl && <p className="hint">You're watching. Controls send a request that the host or a moderator can approve.</p>}
        </div>

        {canControl && requests.length > 0 && (
          <div className="panel">
            <h2>Requests ({requests.length})</h2>
            {requests.map((r) => (
              <div className="request" key={r.id}>
                <span><b>{r.username}</b> wants to {LABEL[r.action]}{r.action === 'seek' ? ` to ${Math.round(r.payload.time ?? 0)}s` : ''}{r.action === 'change_video' ? ` (${r.payload.videoId})` : ''}</span>
                <span className="row">
                  <button className="primary" onClick={() => socket.emit('resolve_request', { requestId: r.id, approve: true })}>Approve</button>
                  <button onClick={() => socket.emit('resolve_request', { requestId: r.id, approve: false })}>Decline</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <aside>
        <div className="panel">
          <h2>In the room ({people.length})</h2>
          {people.map((p) => (
            <div className="person" key={p.id}>
              <span>{p.username}{p.id === me.id && ' (you)'}</span>
              <span className={`badge ${p.role}`}>{p.role}</span>
              {me.role === 'host' && p.id !== me.id && (
                <span className="row">
                  <select value={p.role} onChange={(e) => socket.emit('assign_role', { userId: p.id, role: e.target.value as Role })} aria-label={`Role for ${p.username}`}>
                    <option value="participant">participant</option>
                    <option value="moderator">moderator</option>
                  </select>
                  <button onClick={() => confirm(`Make ${p.username} the host? You will become a moderator.`) && socket.emit('transfer_host', { userId: p.id })}>Make host</button>
                  <button className="danger" onClick={() => confirm(`Remove ${p.username}?`) && socket.emit('remove_participant', { userId: p.id })}>Remove</button>
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="panel chat">
          <h2>Chat</h2>
          <div className="log" ref={logRef}>
            {chat.length === 0 && <p className="hint">No messages yet. Say hi.</p>}
            {chat.map((m) => <p key={m.id}><b>{m.username}</b> {m.text}</p>)}
          </div>
          <div className="row">
            <input className="grow" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Message the room" />
            <button onClick={send}>Send</button>
          </div>
        </div>
      </aside>
    </div>
  );
}
