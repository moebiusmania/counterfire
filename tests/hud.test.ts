import { expect, test } from 'bun:test';
import { World } from '../src/sim/world';
import { vehicleControls } from '../src/ui/hud';
import { openField } from './helpers';

const labels = (world: World, type: Parameters<World['spawnVehicle']>[1]) =>
  vehicleControls(world, world.spawnVehicle('P1', type)).map((c) => c.label);

test('the legend lists each vehicle its own controls, never the driving ones', () => {
  const world = new World(openField(), 1);
  expect(labels(world, 'tank')).toEqual(['FIRE', 'TURRET', 'CENTRE TURRET', 'SELF-DESTRUCT']);
  expect(labels(world, 'heli')).toEqual(['FIRE GUN', 'STRAFE', 'SWITCH WEAPON', 'SELF-DESTRUCT']);
  expect(labels(world, 'jeep')).toEqual(['GRENADE', 'TYRES UP', 'SELF-DESTRUCT']);
  const moves = ['forward', 'back', 'left', 'right'];
  for (const type of ['tank', 'asv', 'heli', 'jeep'] as const)
    for (const c of vehicleControls(world, world.spawnVehicle('P1', type)))
      expect(c.actions.some((a) => moves.includes(a))).toBe(false);
});
