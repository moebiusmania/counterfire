// The jeep's dashboard beacon (SPEC §6.4): green when it faces the enemy's exposed flag,
// bright red when it faces its own bunker.

import { headingTo } from './turrets';
import { wrapAngle } from './types';
import type { Vehicle } from './vehicles/vehicle';
import type { World } from './world';

/** How far off the heading still counts as facing, radians. [VERIFY] */
export const BEACON_TOLERANCE = 0.25;

export type BeaconLight = 'green' | 'red' | 'off';

export function jeepBeacon(world: World, jeep: Vehicle): BeaconLight {
  // standing on top of something is not facing it
  const facing = (x: number, y: number) =>
    Math.hypot(x - jeep.x, y - jeep.y) > 1 &&
    Math.abs(wrapAngle(headingTo(jeep.x, jeep.y, x, y) - jeep.heading)) < BEACON_TOLERANCE;
  const flag = world.flags.find(
    (f) => world.areEnemies(f.team, jeep.team) && (f.state === 'exposed' || f.state === 'floating'),
  );
  if (flag && facing(flag.x, flag.y)) return 'green';
  const home = world.players.get(jeep.team)?.bunker;
  if (home && facing(home.x, home.y)) return 'red';
  return 'off';
}
