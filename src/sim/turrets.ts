// Turret AI (SPEC §8.2): turn toward the nearest enemy in range and fire when lined up.

import type { Structure } from './structures';
import { SHOTS } from './tuning';
import { wrapAngle } from './types';
import type { Vehicle } from './vehicles/vehicle';
import type { World } from './world';

/** Heading from (x, y) toward (tx, ty), same convention as vehicles: 0 north, counter clockwise. */
export function headingTo(x: number, y: number, tx: number, ty: number): number {
  return Math.atan2(-(tx - x), ty - y);
}

/** How far off the gun can be and still fire. */
const AIM_TOLERANCE = 0.08;

export function updateTurret(t: Structure, world: World): void {
  const spec = t.turret;
  if (t.cooldown > 0) t.cooldown--;
  const target = findTarget(t, world, spec.range, spec.hitsAir);
  if (!target) return;
  const want = headingTo(t.x, t.y, target.x, target.y);
  const diff = wrapAngle(want - t.aim);
  t.aim = wrapAngle(t.aim + Math.max(-spec.turnRate, Math.min(spec.turnRate, diff)));
  if (Math.abs(diff) > AIM_TOLERANCE || t.cooldown > 0) return;
  t.cooldown = spec.cooldown;
  const muzzle = 0.6;
  const shot = world.spawnShot(
    spec.shot,
    t.id,
    t.x - Math.sin(t.aim) * muzzle,
    t.y + Math.cos(t.aim) * muzzle,
    t.aim,
    SHOTS[spec.shot],
  );
  shot.target = target.id;
}

/** Nearest enemy vehicle in range that is out in the field. */
function findTarget(t: Structure, world: World, range: number, hitsAir: boolean): Vehicle | undefined {
  let best: Vehicle | undefined;
  let bestD = range;
  for (const v of world.vehicles) {
    if (!v.controllable || !world.areEnemies(t.team, v.team)) continue;
    if (v.mobility === 'air' && !hitsAir) continue;
    const d = Math.hypot(v.x - t.x, v.y - t.y);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}
