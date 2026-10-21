// Keyboard bindings from the original manual (SPEC §13.1). Keys are KeyboardEvent.code values.

import { keyIsDown } from 'littlejsengine';
import type { InputFrame, PlayerId } from '../sim/types';

export type Action = keyof InputFrame;

export type Bindings = Record<Action, string[]>;

export const DEFAULT_BINDINGS: Record<PlayerId, Bindings> = {
  P1: {
    forward: ['KeyW'],
    back: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    auxLeft: ['KeyQ'],
    auxRight: ['KeyE'],
    fireGround: ['KeyH'],
    fireAir: ['KeyJ'],
    switch: ['KeyK'],
  },
  P2: {
    forward: ['Numpad8'],
    back: ['Numpad5'],
    left: ['Numpad4'],
    right: ['Numpad6'],
    auxLeft: ['Numpad7'],
    auxRight: ['Numpad9'],
    fireGround: ['NumpadSubtract'],
    fireAir: ['NumpadAdd'],
    switch: ['NumpadEnter'],
  },
};

const STORAGE_KEY = 'counterfire.bindings';

/** Saved bindings, falling back to the defaults; storage can be unavailable (private windows). */
export function loadBindings(): Record<PlayerId, Bindings> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...DEFAULT_BINDINGS, ...(JSON.parse(saved) as Partial<Record<PlayerId, Bindings>>) };
  } catch {
    // fall through to the defaults
  }
  return DEFAULT_BINDINGS;
}

export function saveBindings(bindings: Record<PlayerId, Bindings>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    // not persisted; the game still runs with them this session
  }
}

/** Sample one player's keys into an input frame. */
export function readInput(bindings: Bindings): InputFrame {
  const down = (action: Action) => bindings[action].some((code) => keyIsDown(code));
  return {
    forward: down('forward'),
    back: down('back'),
    left: down('left'),
    right: down('right'),
    auxLeft: down('auxLeft'),
    auxRight: down('auxRight'),
    fireGround: down('fireGround'),
    fireAir: down('fireAir'),
    switch: down('switch'),
  };
}
