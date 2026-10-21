import { SHOTS } from '../tuning';
import { type InputFrame, wrapAngle } from '../types';
import type { World } from '../world';
import type { Vehicle } from './vehicle';

/** Distance from the hull centre to the muzzle, in tiles. */
const MUZZLE = 0.75;

/**
 * Tank: hull and turret turn independently (SPEC §6.1).
 * Q/E turn the turret, Switch re-centres it, Ground Fire shoots the main gun.
 */
export function updateTank(tank: Vehicle, input: InputFrame, world: World): void {
  const t = tank.tuning;

  // throttle; with no fuel the engine is dead and the tank coasts to a stop
  const hasFuel = tank.fuel > 0;
  if (hasFuel && input.forward && !input.back) tank.speed = Math.min(tank.speed + t.accel, t.maxSpeed);
  else if (hasFuel && input.back && !input.forward)
    tank.speed = Math.max(tank.speed - t.accel, -t.maxReverse);
  else tank.speed = Math.sign(tank.speed) * Math.max(Math.abs(tank.speed) - t.drag, 0);

  // tracks pivot in place, so turning works at any speed
  if (hasFuel) {
    if (input.left) tank.heading = wrapAngle(tank.heading + t.turnRate);
    if (input.right) tank.heading = wrapAngle(tank.heading - t.turnRate);
  }

  if (input.auxLeft) tank.turret = wrapAngle(tank.turret + t.turretTurnRate);
  if (input.auxRight) tank.turret = wrapAngle(tank.turret - t.turretTurnRate);
  if (input.switch && !input.auxLeft && !input.auxRight) {
    const step = Math.min(Math.abs(tank.turret), t.turretTurnRate);
    tank.turret -= Math.sign(tank.turret) * step;
  }

  if (tank.move(world.terrain)) tank.speed *= 0.5;

  if (hasFuel) {
    tank.fuel = Math.max(0, tank.fuel - t.fuelIdle - Math.abs(tank.speed) * t.fuelPerSpeed);
    if (tank.fuel === 0) world.emit({ type: 'outOfFuel', vehicle: tank.id });
  } else if (tank.speed === 0) {
    // SPEC §6: out of fuel, the vehicle stops and the driver flees on foot
    tank.state = 'abandoned';
    world.emit({ type: 'driverBailed', vehicle: tank.id, x: tank.x, y: tank.y });
  }

  if (tank.cooldown > 0) tank.cooldown--;
  if (input.fireGround && tank.cooldown === 0) {
    if (tank.ammo > 0) {
      const aim = tank.heading + tank.turret;
      world.spawnShot(
        'tankShell',
        tank.id,
        tank.x - Math.sin(aim) * MUZZLE,
        tank.y + Math.cos(aim) * MUZZLE,
        aim,
        SHOTS.tankShell,
      );
      tank.ammo--;
      tank.cooldown = t.fireCooldown;
    } else {
      world.emit({ type: 'dryFire', vehicle: tank.id });
      tank.cooldown = t.fireCooldown;
    }
  }
}
