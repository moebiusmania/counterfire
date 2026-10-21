// Where a sound is heard in split-screen (SPEC §11.1): each player owns one side of the speakers,
// so a sound plays on the side of the player nearest it, quieter with distance.

export interface Listener {
  x: number;
  y: number;
  z: number;
  /** Stereo position of this listener's half of the screen, -1 left to 1 right. */
  pan: number;
}

export interface Mix {
  volume: number;
  pan: number;
}

/** Volume and pan for a sound at `pos`, or undefined when it is out of everyone's range. */
export function splitMix(
  pos: { x: number; y: number; z: number },
  listeners: readonly Listener[],
  range: number,
): Mix | undefined {
  let nearest: Listener | undefined;
  let best = Number.POSITIVE_INFINITY;
  for (const l of listeners) {
    const d = Math.hypot(pos.x - l.x, pos.y - l.y, pos.z - l.z);
    if (d < best) {
      best = d;
      nearest = l;
    }
  }
  if (!nearest || best >= range) return undefined;
  // full volume up close, fading to silence at the edge of range
  const taper = range * 0.5;
  const volume = best <= taper ? 1 : 1 - (best - taper) / (range - taper);
  return { volume, pan: nearest.pan };
}
