// CPU drones (SPEC §8.3): small hovering gunships that patrol around their spawn point, chase
// any enemy vehicle they see and shoot at it. They fly over terrain but hover low enough for
// every weapon to hit them, and they count as heat for the submarine's missile.
// [VERIFY] whether the original's drones fly or drive, and how many there are.

import { DRONES, SHOTS } from './tuning';
import { headingTo } from './turrets';
import { type Team, wrapAngle } from './types';
import type { Vehicle } from './vehicles/vehicle';
import type { World } from './world';

export class Drone {
  hp = DRONES.hp;
  heading = 0;
  cooldown = 0;
  /** Patrol waypoint. */
  goalX: number;
  goalY: number;
  prevX: number;
  prevY: number;

  constructor(
    readonly id: number,
    readonly team: Team,
    /** The level entity id of the spawn it belongs to. */
    readonly spawn: string,
    public x: number,
    public y: number,
  ) {
    this.goalX = x;
    this.goalY = y;
    this.prevX = x;
    this.prevY = y;
  }
}

export function updateDrone(d: Drone, world: World, homeX: number, homeY: number): void {
  d.prevX = d.x;
  d.prevY = d.y;
  if (d.cooldown > 0) d.cooldown--;

  const target = nearestEnemy(d, world);
  let goalX = d.goalX;
  let goalY = d.goalY;
  if (target) {
    // close in to firing range and hold there
    goalX = target.x;
    goalY = target.y;
  } else if (Math.hypot(d.goalX - d.x, d.goalY - d.y) < 0.5) {
    const a = world.rng.range(-Math.PI, Math.PI);
    const r = world.rng.range(1, DRONES.patrolRadius);
    d.goalX = homeX + Math.cos(a) * r;
    d.goalY = homeY + Math.sin(a) * r;
    return;
  }

  const want = headingTo(d.x, d.y, goalX, goalY);
  d.heading = wrapAngle(
    d.heading + Math.max(-DRONES.turnRate, Math.min(DRONES.turnRate, wrapAngle(want - d.heading))),
  );
  const dist = Math.hypot(goalX - d.x, goalY - d.y);
  const hold = target ? DRONES.fireRange * 0.6 : 0;
  if (dist > hold) {
    d.x += -Math.sin(d.heading) * DRONES.speed;
    d.y += Math.cos(d.heading) * DRONES.speed;
  }

  if (target && d.cooldown === 0 && dist < DRONES.fireRange && Math.abs(wrapAngle(want - d.heading)) < 0.2) {
    d.cooldown = DRONES.cooldown;
    const shot = world.spawnShot(
      'droneGun',
      d.id,
      d.x - Math.sin(d.heading) * 0.4,
      d.y + Math.cos(d.heading) * 0.4,
      d.heading,
      SHOTS.droneGun,
    );
    shot.target = target.id;
  }
}

function nearestEnemy(d: Drone, world: World): Vehicle | undefined {
  let best: Vehicle | undefined;
  let bestD = DRONES.sightRange;
  for (const v of world.vehicles) {
    if (!v.controllable || !world.areEnemies(d.team, v.team)) continue;
    const dist = Math.hypot(v.x - d.x, v.y - d.y);
    if (dist < bestD) {
      bestD = dist;
      best = v;
    }
  }
  return best;
}
