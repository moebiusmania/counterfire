// Campaign progress (SPEC §5.2): which maps are won, and which are open to play. Training and
// two-player maps are always open; the tournament opens one map at a time, in order.

import { track } from '../levels';

export type Track = 'training' | 'tournament' | 'duel';

export interface Progress {
  /** Ids of maps the player has won. */
  won: string[];
}

const KEY = 'counterfire.progress';

export function emptyProgress(): Progress {
  return { won: [] };
}

/** Saved progress; storage may be missing or blocked, and then the campaign starts fresh. */
export function loadProgress(): Progress {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const p = JSON.parse(saved) as Partial<Progress>;
      return { won: Array.isArray(p.won) ? p.won.filter((x) => typeof x === 'string') : [] };
    }
  } catch {
    // fall through
  }
  return emptyProgress();
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // not saved; the session still remembers
  }
}

export function trackIds(t: Track): string[] {
  return track(t).map((l) => l.id);
}

export function isUnlocked(p: Progress, t: Track, id: string): boolean {
  if (t !== 'tournament') return true;
  const ids = trackIds(t);
  const i = ids.indexOf(id);
  if (i <= 0) return i === 0;
  return p.won.includes(ids[i - 1] as string);
}

/** Record a win; returns the new progress. */
export function recordWin(p: Progress, id: string): Progress {
  return p.won.includes(id) ? p : { won: [...p.won, id] };
}

/** The map after this one in its track, if any. */
export function nextLevel(t: Track, id: string): string | undefined {
  const ids = trackIds(t);
  const i = ids.indexOf(id);
  return i >= 0 ? ids[i + 1] : undefined;
}

/** Which track a level belongs to. */
export function trackOf(id: string): Track {
  if (trackIds('training').includes(id)) return 'training';
  if (trackIds('duel').includes(id)) return 'duel';
  return 'tournament';
}
