// Gamepads for both players (SPEC §13.2): left stick or d-pad drives, shoulders turn the turret or
// bank, A is Ground Fire, B is Air Fire, X is Switch. Gamepad 0 is P1's, gamepad 1 is P2's. In the
// menus either pad moves with the stick or d-pad, chooses with A or Start and goes back with B.

import { gamepadConnected, gamepadDpad, gamepadIsDown, gamepadStick } from 'littlejsengine';
import type { InputFrame } from '../sim/types';

/** Standard-mapping button numbers. */
export const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, start: 9 } as const;

/** How far a stick must lean before it counts. */
export const DEAD_ZONE = 0.35;

export interface PadState {
  /** Left stick, +y forward. */
  stick: { x: number; y: number };
  dpad: { x: number; y: number };
  isDown(button: number): boolean;
}

/** Turn one gamepad's state into an input frame. */
export function padToInput(pad: PadState): InputFrame {
  const x = Math.abs(pad.stick.x) > DEAD_ZONE ? pad.stick.x : pad.dpad.x;
  const y = Math.abs(pad.stick.y) > DEAD_ZONE ? pad.stick.y : pad.dpad.y;
  return {
    forward: y > DEAD_ZONE,
    back: y < -DEAD_ZONE,
    left: x < -DEAD_ZONE,
    right: x > DEAD_ZONE,
    auxLeft: pad.isDown(PAD.lb) || pad.isDown(PAD.lt),
    auxRight: pad.isDown(PAD.rb) || pad.isDown(PAD.rt),
    fireGround: pad.isDown(PAD.a),
    fireAir: pad.isDown(PAD.b),
    switch: pad.isDown(PAD.x),
  };
}

function padState(index: number): PadState {
  return {
    stick: gamepadStick(0, index),
    dpad: gamepadDpad(index),
    isDown: (b) => gamepadIsDown(b, index),
  };
}

/** Read a connected gamepad, or undefined when there is none at that index. */
export function readGamepad(index: number): InputFrame | undefined {
  return gamepadConnected(index) ? padToInput(padState(index)) : undefined;
}

export type PadMenuAction = 'up' | 'down' | 'left' | 'right' | 'select' | 'back';

/** Held controls as menu controls: move with the directions, choose with Ground Fire, go back with Air Fire. */
export function inputToMenu(i: InputFrame): Set<PadMenuAction> {
  const held = new Set<PadMenuAction>();
  if (i.forward) held.add('up');
  if (i.back) held.add('down');
  if (i.left) held.add('left');
  if (i.right) held.add('right');
  if (i.fireGround) held.add('select');
  if (i.fireAir) held.add('back');
  return held;
}

/** What a pad holds, as menu controls, Start choosing too; the menu acts on a control the moment it goes down. */
export function padToMenu(pad: PadState): Set<PadMenuAction> {
  const held = inputToMenu(padToInput(pad));
  if (pad.isDown(PAD.start)) held.add('select');
  return held;
}

/** The menu controls a connected gamepad holds, or none when there is no pad at that index. */
export function readGamepadMenu(index: number): Set<PadMenuAction> {
  return gamepadConnected(index) ? padToMenu(padState(index)) : new Set();
}

/** Either source pressing a control presses it. */
export function mergeInputs(a: InputFrame, b: InputFrame | undefined): InputFrame {
  if (!b) return a;
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof InputFrame)[]) out[k] = a[k] || b[k];
  return out;
}
