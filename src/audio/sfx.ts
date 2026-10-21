// Sound effects (SPEC §11.1), generated with ZzFX so there are no asset files yet.
// Music is out of scope for v1 (SPEC §11.2).
// ZzFX parameters: volume, randomness, frequency, attack, sustain, release, shape, shapeCurve,
// slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay,
// sustainVolume, decay, tremolo, filter.

import { render3D, Sound, type Vector3 } from 'littlejsengine';
import type { ShotKind } from '../sim/tuning';

const SOUNDS = {
  // weapons, one per shot kind
  tankShell: new Sound([1.6, 0.05, 90, 0.01, 0.06, 0.35, 4, 2.4, -4, , , , , 1.6, , 0.4, , 0.5, 0.08]),
  asvRocket: new Sound([1.2, 0.1, 160, 0.03, 0.2, 0.4, 4, 1.5, 3, , , , , 1.2, , 0.2, , 0.6, 0.1]),
  heliGun: new Sound([0.6, 0.1, 300, , 0.02, 0.05, 4, 2, -10, , , , , 1, , 0.3, , 0.5]),
  heliRocket: new Sound([1, 0.1, 200, 0.02, 0.15, 0.3, 4, 1.5, 4, , , , , 1, , 0.2, , 0.6, 0.08]),
  grenade: new Sound([0.6, 0.1, 400, , 0.03, 0.08, 1, 1, -30]),
  turretShell: new Sound([1.2, 0.05, 110, 0.01, 0.05, 0.3, 4, 2.2, -4, , , , , 1.4, , 0.4, , 0.5, 0.06]),
  turretMissile: new Sound([0.9, 0.1, 240, 0.04, 0.25, 0.3, 4, 1.4, 5, , , , , 1, , 0.2, , 0.6, 0.1]),
  subMissile: new Sound([1.3, 0.05, 180, 0.08, 0.4, 0.5, 4, 1.2, 6, , , , , 1.2, , 0.2, , 0.7, 0.2]),
  // impacts
  explosion: new Sound([1.4, 0.1, 60, 0.01, 0.12, 0.5, 4, 2.5, , , , , , 1.4, , 0.5, 0.1, 0.4, 0.1]),
  bigExplosion: new Sound([2, 0.1, 45, 0.02, 0.25, 0.9, 4, 3, , , , , , 1.8, , 0.7, 0.15, 0.3, 0.2]),
  splash: new Sound([1, 0.2, 200, 0.02, 0.2, 0.5, 4, 0, -2, , , , , 2, , , 0.05, 0.4]),
  scream: new Sound([0.5, 0.2, 700, 0.02, 0.15, 0.2, 2, 1.5, -8, , , , , 0.2, 6]),
  collapse: new Sound([1.6, 0.1, 50, 0.03, 0.4, 0.8, 4, 2.5, -1, , , , , 2, , 0.4, 0.1, 0.4, 0.2]),
  // the submarine surfacing: a klaxon
  klaxon: new Sound([0.9, 0, 330, 0.02, 0.3, 0.05, 1, 1, , , 110, 0.15, 0.32, , , , , 0.7]),
  // vehicles and the base
  bell: new Sound([0.8, 0, 1200, , 0.05, 0.6, , 0.5, , , , , 0.12, , , , , 0.4]),
  ping: new Sound([0.6, 0, 880, , 0.04, 0.2, , 1, , , 440, 0.06]),
  elevator: new Sound([0.6, 0, 70, 0.1, 0.6, 0.3, 2, 0.5, 0.5, , , , , 0.4, 3]),
  tyres: new Sound([0.5, 0.1, 800, 0.05, 0.3, 0.2, 4, 0, , , , , , 3]),
  // interface
  select: new Sound([0.4, 0, 660, , 0.02, 0.05, 1]),
  click: new Sound([0.4, 0, 1800, , 0.01, 0.01, 1, , , , , , , , , , , 0.5]),
} satisfies Record<ShotKind, Sound> & Record<string, Sound>;

export type SfxName = keyof typeof SOUNDS;

/** Play a sound, placed and panned in the 3D scene when given a position. */
export function playSfx(name: SfxName, pos?: Vector3): void {
  const sound = SOUNDS[name];
  if (pos) render3D.playSound(sound, pos);
  else sound.play();
}
