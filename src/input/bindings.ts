// Keyboard bindings from the original manual (SPEC §13.1). Keys are KeyboardEvent.code values.

import { keyIsDown, keyWasPressed } from 'littlejsengine';
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

/** Every action, in the order the controls screen lists them, with its name there. */
export const ACTIONS: { action: Action; label: string }[] = [
  { action: 'forward', label: 'FORWARD' },
  { action: 'back', label: 'BACK' },
  { action: 'left', label: 'TURN LEFT' },
  { action: 'right', label: 'TURN RIGHT' },
  { action: 'auxLeft', label: 'TURRET / BANK LEFT' },
  { action: 'auxRight', label: 'TURRET / BANK RIGHT' },
  { action: 'fireGround', label: 'GROUND FIRE' },
  { action: 'fireAir', label: 'AIR FIRE' },
  { action: 'switch', label: 'SWITCH' },
];

/** Keys the game keeps for itself: quit, pause, and the Alt of Alt+Enter. */
export const RESERVED_KEYS = new Set(['Escape', 'F3', 'AltLeft', 'AltRight']);

/**
 * Bind one key to a player's action. Whatever already used that key, for either player, takes the
 * action's old key in exchange, so no action is ever left without a key.
 */
export function rebind(
  bindings: Record<PlayerId, Bindings>,
  player: PlayerId,
  action: Action,
  code: string,
): Record<PlayerId, Bindings> {
  if (RESERVED_KEYS.has(code)) return bindings;
  const old = bindings[player][action][0];
  const out = structuredClone(bindings);
  for (const p of Object.keys(out) as PlayerId[])
    for (const a of Object.keys(out[p]) as Action[])
      out[p][a] = out[p][a].map((c) => (c === code && old ? old : c)).filter((c) => c !== code);
  out[player][action] = [code];
  return out;
}

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

/**
 * Sample one player's keys into an input frame. A key pressed since the last update counts as
 * down even if it was already let go, so a quick tap between two updates is not lost.
 */
export function readInput(bindings: Bindings): InputFrame {
  const down = (action: Action) => bindings[action].some((code) => keyIsDown(code) || keyWasPressed(code));
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
