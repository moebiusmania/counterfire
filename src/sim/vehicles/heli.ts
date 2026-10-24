import { HELI, SHOTS } from '../tuning';
import { type InputFrame, wrapAngle } from '../types';
import type { World } from '../world';
import { burnFuel, fireFrom, weaponReady } from './drive';
import type { Vehicle } from './vehicle';

/** Ticks to climb from the pad to flight height. */
const CLIMB_TICKS = 45;
/** How far ahead of the helicopter its shots leave. */
const MUZZLE = 0.6;

/**
 * Where the selected weapon's shots come down, if nothing is hit on the way: air shots fly their
 * full range straight ahead from the muzzle and land there, whatever the helicopter does meanwhile.
 */
export function heliAimPoint(heli: Vehicle): { x: number; y: number } {
  const reach = MUZZLE + SHOTS[heli.weapon === 'gun' ? 'heliGun' : 'heliRocket'].range;
  return { x: heli.x - Math.sin(heli.heading) * reach, y: heli.y + Math.cos(heli.heading) * reach };
}

/**
 * Helicopter (SPEC §6.3): flies over everything, banks with Q/E to strafe, and switches
 * between the gun and rockets. Only rockets destroy mines and bridges. It refuels and
 * rearms only by landing at its own bunker; out of fuel in the air, it crashes.
 */
export function updateHeli(heli: Vehicle, input: InputFrame, pressed: InputFrame, world: World): void {
  const t = heli.tuning;
  heli.altitude = Math.min(1, heli.altitude + 1 / CLIMB_TICKS);
  const flying = heli.altitude >= 1;

  if (flying) {
    if (input.forward && !input.back) heli.speed = Math.min(heli.speed + t.accel, t.maxSpeed);
    else if (input.back && !input.forward) heli.speed = Math.max(heli.speed - t.accel, -t.maxReverse);
    else heli.speed = Math.sign(heli.speed) * Math.max(Math.abs(heli.speed) - t.drag, 0);
    if (input.left) heli.heading = wrapAngle(heli.heading + t.turnRate);
    if (input.right) heli.heading = wrapAngle(heli.heading - t.turnRate);
    heli.move(world);

    // bank: slide sideways, right of the heading is (cos h, sin h)
    const strafe = (input.auxRight ? 1 : 0) - (input.auxLeft ? 1 : 0);
    if (strafe) {
      heli.moveBy(
        world,
        Math.cos(heli.heading) * strafe * HELI.strafeSpeed,
        Math.sin(heli.heading) * strafe * HELI.strafeSpeed,
      );
    }
  }

  burnFuel(heli, world);
  if (heli.fuel === 0) {
    world.emit({ type: 'heliCrash', vehicle: heli.id, x: heli.x, y: heli.y });
    world.destroyVehicle(heli);
    return;
  }

  if (pressed.switch) {
    heli.weapon = heli.weapon === 'gun' ? 'rockets' : 'gun';
    world.emit({ type: 'weaponSwitched', vehicle: heli.id, weapon: heli.weapon });
  }

  if (!weaponReady(heli) || !input.fireGround || !flying) return;
  if (heli.weapon === 'gun') {
    heli.cooldown = t.fireCooldown;
    if (heli.ammo > 0) {
      heli.ammo--;
      fireFrom(heli, world, 'heliGun', SHOTS.heliGun, heli.heading, MUZZLE, heli.ammo % 2 ? 0.15 : -0.15);
    } else world.emit({ type: 'dryFire', vehicle: heli.id });
  } else {
    heli.cooldown = HELI.rocketCooldown;
    if (heli.rockets > 0) {
      heli.rockets--;
      fireFrom(
        heli,
        world,
        'heliRocket',
        SHOTS.heliRocket,
        heli.heading,
        MUZZLE,
        heli.rockets % 2 ? 0.3 : -0.3,
      );
    } else world.emit({ type: 'dryFire', vehicle: heli.id });
  }
}
