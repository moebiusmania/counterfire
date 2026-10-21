// Shared simulation types. The sim works on a 2D plane in tile units:
// +x is east, +y is north, and a heading of 0 faces north, turning counter clockwise.

export type Team = 'P1' | 'P2' | 'CPU' | 'NEUTRAL';
export type PlayerId = 'P1' | 'P2';
export type VehicleType = 'tank' | 'asv' | 'heli' | 'jeep';

/** One tick of player input, sampled once per fixed step. */
export interface InputFrame {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  /** Tank: turret left. Helicopter: bank left. */
  auxLeft: boolean;
  /** Tank: turret right. Helicopter: bank right. */
  auxRight: boolean;
  fireGround: boolean;
  fireAir: boolean;
  switch: boolean;
}

export const EMPTY_INPUT: Readonly<InputFrame> = Object.freeze({
  forward: false,
  back: false,
  left: false,
  right: false,
  auxLeft: false,
  auxRight: false,
  fireGround: false,
  fireAir: false,
  switch: false,
});

export function input(partial: Partial<InputFrame> = {}): InputFrame {
  return { ...EMPTY_INPUT, ...partial };
}

export interface Vec {
  x: number;
  y: number;
}

/** Unit vector a heading faces. */
export function headingVec(heading: number): Vec {
  return { x: -Math.sin(heading), y: Math.cos(heading) };
}

/** Wrap an angle to -PI..PI. */
export function wrapAngle(a: number): number {
  a %= Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}
