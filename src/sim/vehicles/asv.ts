import { MINES, SHOTS } from '../tuning';
import type { InputFrame } from '../types';
import type { World } from '../world';
import { driveGround, fireFrom, useAmmo, weaponReady } from './drive';
import type { Vehicle } from './vehicle';

/** Rockets leave the launcher pod alternately left and right of the centre line. */
const POD_OFFSET = 0.18;

/**
 * Armoured Support Vehicle (SPEC §6.2): slowest and toughest. Ground Fire launches rockets
 * straight ahead; Air Fire lays a mine behind it in two-player games.
 */
export function updateAsv(asv: Vehicle, input: InputFrame, pressed: InputFrame, world: World): void {
  driveGround(asv, input, world);

  if (weaponReady(asv) && input.fireGround && useAmmo(asv, world, asv.tuning.fireCooldown)) {
    const side = asv.ammo % 2 ? POD_OFFSET : -POD_OFFSET;
    fireFrom(asv, world, 'asvRocket', SHOTS.asvRocket, asv.heading, 0.8, side);
  }

  if (pressed.fireAir && world.minesAllowed && asv.cooldown === 0) {
    if (asv.mines > 0) {
      asv.mines--;
      asv.cooldown = MINES.layCooldown;
      const back = asv.tuning.radius + MINES.triggerRadius + 0.1;
      world.layMine(asv, asv.x + Math.sin(asv.heading) * back, asv.y - Math.cos(asv.heading) * back);
    } else {
      world.emit({ type: 'dryFire', vehicle: asv.id });
    }
  }
}
