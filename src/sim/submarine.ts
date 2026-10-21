// The submarine that guards the map edge (SPEC §8.4). It cannot be destroyed. When a vehicle
// leaves the playable bounds it surfaces offshore, fires one heat-seeking missile and dives.

import { SHOTS, SUBMARINE } from './tuning';
import { headingTo } from './turrets';
import type { Vehicle } from './vehicles/vehicle';
import type { World } from './world';

export type SubState = 'hidden' | 'surfacing' | 'aiming' | 'diving';

export class Submarine {
  state: SubState = 'hidden';
  x = 0;
  y = 0;
  heading = 0;
  timer = 0;
  /** The vehicle that brought it up. */
  culprit = 0;
  /** 0 under water, 1 surfaced; for the renderer. */
  surfaced = 0;
}

/** Is a point outside the playable area? */
export function outOfBounds(world: World, x: number, y: number): boolean {
  const b = world.level.bounds;
  return x < b.x || y < b.y || x > b.x + b.w || y > b.y + b.h;
}

export function updateSubmarine(sub: Submarine, world: World): void {
  const rate = 1 / SUBMARINE.surfaceTicks;
  switch (sub.state) {
    case 'hidden': {
      // one heat-seeker at a time: while it flies, the sub stays down
      if (world.shots.some((s) => s.kind === 'subMissile')) return;
      const deserter = world.vehicles.find((v) => v.controllable && outOfBounds(world, v.x, v.y));
      if (deserter) surface(sub, world, deserter);
      return;
    }
    case 'surfacing':
      sub.surfaced = Math.min(1, sub.surfaced + rate);
      if (sub.surfaced >= 1) {
        sub.state = 'aiming';
        sub.timer = SUBMARINE.aimTicks;
      }
      return;
    case 'aiming': {
      const culprit = world.vehicles.find((v) => v.id === sub.culprit && v.alive);
      if (culprit) sub.heading = headingTo(sub.x, sub.y, culprit.x, culprit.y);
      if (--sub.timer > 0) return;
      const shot = world.spawnShot(
        'subMissile',
        -1,
        sub.x - Math.sin(sub.heading),
        sub.y + Math.cos(sub.heading),
        sub.heading,
        SHOTS.subMissile,
      );
      shot.target = sub.culprit;
      world.emit({ type: 'subFired', x: sub.x, y: sub.y });
      sub.state = 'diving';
      sub.timer = SUBMARINE.diveTicks;
      return;
    }
    case 'diving':
      if (--sub.timer > 0) return;
      sub.surfaced = Math.max(0, sub.surfaced - rate);
      if (sub.surfaced <= 0) sub.state = 'hidden';
      return;
  }
}

/** Come up past the boundary, further out along the line from the map centre to the deserter. */
function surface(sub: Submarine, world: World, v: Vehicle): void {
  const b = world.level.bounds;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const d = Math.hypot(v.x - cx, v.y - cy) || 1;
  sub.x = v.x + ((v.x - cx) / d) * SUBMARINE.standoff;
  sub.y = v.y + ((v.y - cy) / d) * SUBMARINE.standoff;
  sub.heading = headingTo(sub.x, sub.y, v.x, v.y);
  sub.culprit = v.id;
  sub.state = 'surfacing';
  world.emit({ type: 'subSurfacing', x: sub.x, y: sub.y, vehicle: v.id });
}
