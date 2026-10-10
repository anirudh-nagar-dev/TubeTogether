const ID = /^[\w-]{11}$/;

/** Accepts a bare ID or any common YouTube URL; returns the 11-char video ID or null. */
export function parseVideoId(input: string): string | null {
  const s = input.trim();
  if (ID.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname === 'youtu.be') return ID.test(u.pathname.slice(1)) ? u.pathname.slice(1) : null;
    if (u.hostname.endsWith('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v && ID.test(v)) return v;
      const m = u.pathname.match(/^\/(embed|shorts|live)\/([\w-]{11})/);
      if (m) return m[2];
    }
  } catch { /* not a URL */ }
  return null;
}

/** "1:30" or "90" -> seconds; null if invalid. */
export function parseTime(input: string): number | null {
  const parts = input.trim().split(':').map(Number);
  if (!parts.length || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}
