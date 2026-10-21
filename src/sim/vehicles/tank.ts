import { SHOTS } from '../tuning';
import { type InputFrame, wrapAngle } from '../types';
import type { World } from '../world';
import { driveGround, fireFrom, useAmmo, weaponReady } from './drive';
import type { Vehicle } from './vehicle';

/** Distance from the hull centre to the muzzle, in tiles. */
const MUZZLE = 0.75;

/**
 * Tank: hull and turret turn independently (SPEC §6.1).
 * Q/E turn the turret, Switch re-centres it, Ground Fire shoots the main gun.
 */
export function updateTank(tank: Vehicle, input: InputFrame, world: World): void {
  const t = tank.tuning;
  driveGround(tank, input, world);

  if (input.auxLeft) tank.turret = wrapAngle(tank.turret + t.turretTurnRate);
  if (input.auxRight) tank.turret = wrapAngle(tank.turret - t.turretTurnRate);
  if (input.switch && !input.auxLeft && !input.auxRight) {
    const step = Math.min(Math.abs(tank.turret), t.turretTurnRate);
    tank.turret -= Math.sign(tank.turret) * step;
  }

  if (weaponReady(tank) && input.fireGround && useAmmo(tank, world, t.fireCooldown))
    fireFrom(tank, world, 'tankShell', SHOTS.tankShell, tank.heading + tank.turret, MUZZLE);
}
