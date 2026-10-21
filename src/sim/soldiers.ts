// Soldiers (SPEC §8.2): they run out of destroyed buildings, and a driver whose vehicle ran
// dry flees on foot. They run from vehicles, wander and wave, and die to shots and wheels.
// [VERIFY] the original's exact behaviour and animation.

import { SOLDIERS } from './tuning';
import { headingTo } from './turrets';
import type { Team } from './types';
import type { World } from './world';

export type SoldierState = 'running' | 'waving' | 'dead';

export class Soldier {
  state: SoldierState = 'running';
  heading: number;
  /** Ticks until the next change of mind, or until a corpse is cleared. */
  timer: number;
  /** Where a fleeing driver is heading: home to the bunker. */
  home?: { x: number; y: number };

  constructor(
    readonly id: number,
    readonly team: Team,
    public x: number,
    public y: number,
    heading: number,
    timer: number,
  ) {
    this.heading = heading;
    this.timer = timer;
  }
}

export function updateSoldier(s: Soldier, world: World): void {
  if (s.state === 'dead') {
    s.timer--;
    return;
  }

  // run from the nearest vehicle that comes close
  let threat: { x: number; y: number } | undefined;
  let threatD = SOLDIERS.fearRadius;
  for (const v of world.vehicles) {
    if (!v.controllable) continue;
    const d = Math.hypot(v.x - s.x, v.y - s.y);
    if (d < threatD) {
      threatD = d;
      threat = v;
    }
  }

  if (threat) {
    s.state = 'running';
    s.heading = headingTo(threat.x, threat.y, s.x, s.y) + world.rng.range(-0.3, 0.3);
  } else if (s.home) {
    s.state = 'running';
    s.heading = headingTo(s.x, s.y, s.home.x, s.home.y);
    if (Math.hypot(s.home.x - s.x, s.home.y - s.y) < 0.5) {
      // made it back: the driver goes down into the bunker
      world.removeSoldier(s);
      return;
    }
  } else if (--s.timer <= 0) {
    s.state = world.rng.next() < 0.4 ? 'waving' : 'running';
    s.heading = world.rng.range(-Math.PI, Math.PI);
    s.timer = 60 + world.rng.int(120);
  }

  if (s.state === 'running') {
    const dx = -Math.sin(s.heading) * SOLDIERS.runSpeed;
    const dy = Math.cos(s.heading) * SOLDIERS.runSpeed;
    if (world.fits(s.x + dx, s.y, SOLDIERS.radius, 'ground')) s.x += dx;
    if (world.fits(s.x, s.y + dy, SOLDIERS.radius, 'ground')) s.y += dy;
  }
}
