// Driving shared by the land vehicles: throttle, steering, fuel and the out-of-fuel bail out.

import type { ShotKind, ShotTuning } from '../tuning';
import { type InputFrame, wrapAngle } from '../types';
import type { World } from '../world';
import type { Vehicle } from './vehicle';

/**
 * Throttle, steer, move and burn fuel. With no fuel the engine is dead: the vehicle coasts
 * to a stop and the driver flees on foot (SPEC §6).
 */
export function driveGround(v: Vehicle, input: InputFrame, world: World, maxSpeed = v.tuning.maxSpeed): void {
  const t = v.tuning;
  const hasFuel = v.fuel > 0;
  if (hasFuel && input.forward && !input.back) v.speed = Math.min(v.speed + t.accel, maxSpeed);
  else if (hasFuel && input.back && !input.forward) v.speed = Math.max(v.speed - t.accel, -t.maxReverse);
  else v.speed = Math.sign(v.speed) * Math.max(Math.abs(v.speed) - t.drag, 0);
  // over the cap after a terrain change (inflated tyres on land): slow down to it
  if (v.speed > maxSpeed) v.speed = Math.max(maxSpeed, v.speed - t.drag);

  // tracks and wheels both turn on the spot here; [VERIFY] whether the jeep needs to roll to steer
  if (hasFuel) {
    if (input.left) v.heading = wrapAngle(v.heading + t.turnRate);
    if (input.right) v.heading = wrapAngle(v.heading - t.turnRate);
  }

  if (v.move(world)) v.speed *= 0.5;
  burnFuel(v, world);
}

export function burnFuel(v: Vehicle, world: World): void {
  const t = v.tuning;
  if (v.fuel > 0) {
    v.fuel = Math.max(0, v.fuel - t.fuelIdle - Math.abs(v.speed) * t.fuelPerSpeed);
    if (v.fuel === 0) world.emit({ type: 'outOfFuel', vehicle: v.id });
  } else if (v.speed === 0 && v.type !== 'heli') {
    world.abandonVehicle(v);
  }
}

/** Fire a shot from `distance` ahead of the vehicle along `angle`. */
export function fireFrom(
  v: Vehicle,
  world: World,
  kind: ShotKind,
  tuning: ShotTuning,
  angle: number,
  distance: number,
  side = 0,
): void {
  const fx = -Math.sin(angle);
  const fy = Math.cos(angle);
  // `side` offsets to the right of the firing direction, for paired launchers
  world.spawnShot(
    kind,
    v.id,
    v.x + fx * distance + fy * side,
    v.y + fy * distance - fx * side,
    angle,
    tuning,
  );
}

/** Count down the weapon cooldown; true when the weapon may fire this tick. */
export function weaponReady(v: Vehicle): boolean {
  if (v.cooldown > 0) v.cooldown--;
  return v.cooldown === 0;
}

/** Spend one round of `ammo`, or report a dry fire. Returns whether the shot goes off. */
export function useAmmo(v: Vehicle, world: World, cooldown: number): boolean {
  v.cooldown = cooldown;
  if (v.ammo <= 0) {
    world.emit({ type: 'dryFire', vehicle: v.id });
    return false;
  }
  v.ammo--;
  return true;
}
