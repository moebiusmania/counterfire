// Sound effects (SPEC §11.1), generated with ZzFX so there are no asset files yet.
// Music is out of scope for v1 (SPEC §11.2).

import { render3D, Sound, type Vector3 } from 'littlejsengine';

const SOUNDS = {
  cannon: new Sound([1.6, 0.05, 90, 0.01, 0.06, 0.35, 4, 2.4, -4, , , , , 1.6, , 0.4, , 0.5, 0.08]),
  explosion: new Sound([1.4, 0.1, 60, 0.01, 0.12, 0.5, 4, 2.5, , , , , , 1.4, , 0.5, 0.1, 0.4, 0.1]),
  bigExplosion: new Sound([2, 0.1, 45, 0.02, 0.25, 0.9, 4, 3, , , , , , 1.8, , 0.7, 0.15, 0.3, 0.2]),
  click: new Sound([0.4, 0, 1800, , 0.01, 0.01, 1, , , , , , , , , , , 0.5]),
};

export type SfxName = keyof typeof SOUNDS;

/** Play a sound, placed and panned in the 3D scene when given a position. */
export function playSfx(name: SfxName, pos?: Vector3): void {
  const sound = SOUNDS[name];
  if (pos) render3D.playSound(sound, pos);
  else sound.play();
}
