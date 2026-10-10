import { useEffect, useRef } from 'react';
import type { SyncState } from './types';

declare global { interface Window { YT: any; onYouTubeIframeAPIReady?: () => void } }

let apiReady: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!apiReady) {
    apiReady = new Promise((resolve) => {
      window.onYouTubeIframeAPIReady = () => resolve();
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
  }
  return apiReady;
}

interface Props {
  state: SyncState;
  canControl: boolean;
  onPlay: (time: number) => void;
  onPause: (time: number) => void;
  onSeek: (time: number) => void;
}

/**
 * Wraps the YouTube IFrame player.
 *  - Server state is applied with apply(); events fired by that are ignored for a short window.
 *  - Host/Moderator interactions (play, pause, scrub) are reported upward; the server rebroadcasts to everyone.
 *  - Participants get a click-blocking overlay and are drift-corrected back to the room's position.
 */
export default function Player({ state, canControl, onPlay, onPause, onSeek }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<any>(null);
  const ready = useRef(false);
  const ignoreUntil = useRef(0);
  const latest = useRef(state);
  const expected = useRef({ time: state.currentTime, at: Date.now(), playing: false });
  const cb = useRef({ onPlay, onPause, onSeek });
  cb.current = { onPlay, onPause, onSeek };

  const apply = (s: SyncState) => {
    const p = player.current;
    if (!p || !ready.current) return;
    ignoreUntil.current = Date.now() + 1500;
    expected.current = { time: s.currentTime, at: Date.now(), playing: s.playState === 'playing' };
    const current = p.getVideoData?.().video_id;
    if (current !== s.videoId) {
      if (s.playState === 'playing') p.loadVideoById({ videoId: s.videoId, startSeconds: s.currentTime });
      else p.cueVideoById({ videoId: s.videoId, startSeconds: s.currentTime });
      return;
    }
    if (Math.abs(p.getCurrentTime() - s.currentTime) > 0.7) p.seekTo(s.currentTime, true);
    if (s.playState === 'playing') p.playVideo(); else p.pauseVideo();
  };

  useEffect(() => {
    let dead = false;
    let timer: number;
    loadYouTubeApi().then(() => {
      if (dead || !box.current) return;
      const mount = document.createElement('div');
      box.current.appendChild(mount);
      player.current = new window.YT.Player(mount, {
        width: '100%', height: '100%', videoId: latest.current.videoId,
        playerVars: { controls: canControl ? 1 : 0, disablekb: 1, rel: 0, playsinline: 1, modestbranding: 1 },
        events: {
          onReady: () => { ready.current = true; apply(latest.current); },
          onStateChange: (e: any) => {
            if (!canControl || Date.now() < ignoreUntil.current) return;
            const t = player.current.getCurrentTime();
            if (e.data === 1) cb.current.onPlay(t);
            else if (e.data === 2) cb.current.onPause(t);
          },
        },
      });
      // Seek detection (the IFrame API has no seek event) and drift correction.
      timer = window.setInterval(() => {
        const p = player.current;
        if (!ready.current || Date.now() < ignoreUntil.current) return;
        const e = expected.current;
        const want = e.playing ? e.time + (Date.now() - e.at) / 1000 : e.time;
        const actual = p.getCurrentTime();
        if (Math.abs(actual - want) > 2) {
          if (canControl) cb.current.onSeek(actual);
          else { ignoreUntil.current = Date.now() + 1500; p.seekTo(want, true); }
        }
      }, 700);
    });
    return () => { dead = true; clearInterval(timer); player.current?.destroy?.(); player.current = null; ready.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canControl]);

  useEffect(() => { latest.current = state; apply(state); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="player">
      <div ref={box} className="player-frame" />
      {!canControl && <div className="blocker" title="Only the host or a moderator can control playback" />}
    </div>
  );
}
