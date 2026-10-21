import { Tile } from '../terrain';
import { JEEP, SHOTS } from '../tuning';
import type { InputFrame } from '../types';
import type { World } from '../world';
import { driveGround, fireFrom, useAmmo, weaponReady } from './drive';
import type { Vehicle } from './vehicle';

/**
 * Jeep (SPEC §6.4): fastest, unarmoured, throws grenades. Air Fire inflates or deflates the
 * tyres; inflated it can cross deep water. Carrying the flag arrives in milestone 4.
 */
export function updateJeep(jeep: Vehicle, input: InputFrame, pressed: InputFrame, world: World): void {
  const inWater = world.terrain.at(jeep.x, jeep.y) === Tile.Deep;

  // [VERIFY] the original's rule; here the tyres can not be let down while afloat
  if (pressed.fireAir && jeep.tyreChange >= 1 && !(inWater && jeep.tyresInflated)) {
    jeep.tyresInflated = !jeep.tyresInflated;
    jeep.tyreChange = 0;
    world.emit({ type: 'tyres', vehicle: jeep.id, inflated: jeep.tyresInflated });
  }
  jeep.tyreChange = Math.min(1, jeep.tyreChange + 1 / JEEP.inflateTicks);

  const maxSpeed = inWater
    ? JEEP.waterSpeed
    : jeep.tyresInflated
      ? JEEP.inflatedLandSpeed
      : jeep.tuning.maxSpeed;
  driveGround(jeep, input, world, maxSpeed);

  // grenades are lobbed over the bonnet and land a few tiles ahead
  if (weaponReady(jeep) && input.fireGround && useAmmo(jeep, world, jeep.tuning.fireCooldown))
    fireFrom(jeep, world, 'grenade', SHOTS.grenade, jeep.heading, 0.4);
}
