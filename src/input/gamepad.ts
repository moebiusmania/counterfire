// Gamepads for both players (SPEC §13.2): left stick or d-pad drives, shoulders turn the turret or
// bank, A is Ground Fire, B is Air Fire, X is Switch. Gamepad 0 is P1's, gamepad 1 is P2's.

import { gamepadConnected, gamepadDpad, gamepadIsDown, gamepadStick } from 'littlejsengine';
import type { InputFrame } from '../sim/types';

/** Standard-mapping button numbers. */
export const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7 } as const;

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

/** Read a connected gamepad, or undefined when there is none at that index. */
export function readGamepad(index: number): InputFrame | undefined {
  if (!gamepadConnected(index)) return undefined;
  return padToInput({
    stick: gamepadStick(0, index),
    dpad: gamepadDpad(index),
    isDown: (b) => gamepadIsDown(b, index),
  });
}

/** Either source pressing a control presses it. */
export function mergeInputs(a: InputFrame, b: InputFrame | undefined): InputFrame {
  if (!b) return a;
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof InputFrame)[]) out[k] = a[k] || b[k];
  return out;
}
