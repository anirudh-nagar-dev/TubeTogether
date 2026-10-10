import { useEffect, useState } from 'react';
import { socket } from './socket';
import RoomView from './RoomView';
import type { Session } from './types';

export default function App() {
  const [username, setUsername] = useState(localStorage.getItem('tt_name') ?? '');
  const [code, setCode] = useState((new URLSearchParams(location.search).get('room') ?? '').toUpperCase());
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { socket.connect(); return () => { socket.disconnect(); }; }, []);

  const join = (create: boolean) => {
    if (!username.trim()) return setError('Enter a display name first.');
    if (!create && !code.trim()) return setError('Enter a room code.');
    setBusy(true); setError('');
    localStorage.setItem('tt_name', username.trim());
    socket.emit('join_room', { roomId: code, username, create }, (res: any) => {
      setBusy(false);
      if (!res.ok) return setError(res.error);
      history.replaceState(null, '', `/?room=${res.roomId}`);
      setSession(res);
    });
  };

  const leave = () => {
    socket.emit('leave_room', {});
    history.replaceState(null, '', '/');
    setSession(null);
  };

  if (session) return <RoomView session={session} username={username.trim()} onExit={leave} />;

  return (
    <main className="landing">
      <h1>TubeTogether</h1>
      <p className="lede">Watch YouTube in sync with friends. One person controls playback, everyone sees the same moment.</p>
      <div className="card">
        <label>Your name
          <input value={username} maxLength={24} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. Aditi" />
        </label>
        <button className="primary" disabled={busy} onClick={() => join(true)}>Create a room</button>
        <div className="or">or join with a code</div>
        <div className="row">
          <input className="code-input" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" />
          <button disabled={busy} onClick={() => join(false)}>Join room</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </main>
  );
}
