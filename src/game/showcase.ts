// `?showcase`: a still line-up of every vehicle, each skin behind it, and every structure, soldier, flag,
// drone and the submarine beside the P1 bunker, to check the models up close.

import type { Level } from '../levels/schema';
import { Drone } from '../sim/drones';
import { VEHICLE_ORDER, VEHICLE_SKINS, type World } from '../sim/world';

/** Extra structures to stand in the line-up, added before the world is built. */
export function addShowcaseStructures(level: Level): void {
  const b = level.entities.find((e) => e.type === 'bunker' && e.team === 'P1');
  const y = (b?.y ?? 0) + 4;
  const x = (b?.x ?? 0) - 2.4;
  level.entities.push(
    { id: 'sc-house', type: 'building', team: 'NEUTRAL', variant: 'house', x, y },
    { id: 'sc-barracks', type: 'building', team: 'CPU', variant: 'barracks', x: x + 1.6, y },
    { id: 'sc-gun', type: 'turret', team: 'P1', variant: 'gun', x: x + 3.2, y, rot: 0.6 },
    { id: 'sc-missile', type: 'turret', team: 'P1', variant: 'missile', x: x + 4.8, y, rot: -0.6 },
    { id: 'sc-rubble', type: 'building', team: 'NEUTRAL', x: x + 6.4, y },
  );
}

/** Everything else, placed in the built world. */
export function parkShowcase(world: World): void {
  const bunker = world.player('P1').bunker;
  VEHICLE_ORDER.forEach((type, i) => {
    const v = world.spawnVehicle('P1', type);
    v.x = bunker.x - 2.4 + i * 1.6;
    v.y = bunker.y + 2;
    v.heading = 0.5;
    v.turret = type === 'tank' ? -0.9 : 0;
    if (type === 'jeep') v.tyresInflated = true;
    if (type === 'heli') v.altitude = 0.3;
  });
  // the other skins in a row behind, each under its standard model
  VEHICLE_ORDER.forEach((type, i) => {
    VEHICLE_SKINS[type].forEach((_, skin) => {
      if (!skin) return;
      const v = world.spawnVehicle('P1', type);
      v.skin = skin;
      v.x = bunker.x - 2.4 + i * 1.6;
      v.y = bunker.y + 2 + skin * 1.6;
      v.heading = 0.5;
      if (type === 'heli') v.altitude = 0.3;
    });
  });
  const p = world.player('P1');
  p.vehicle = undefined;
  p.mode = 'field';
  p.lostTimer = Number.POSITIVE_INFINITY;
  const rubble = world.structures.find((s) => s.entity.id === 'sc-rubble');
  if (rubble) world.damageStructure(rubble, rubble.hp);
  world.soldiers.splice(0); // the rubble's occupants; the line-up below replaces them
  Object.assign(world.submarine, {
    state: 'aiming',
    surfaced: 1,
    x: bunker.x + 3.4,
    y: bunker.y + 0.6,
    heading: 1.2,
  });
  for (let i = 0; i < 4; i++) {
    const s = world.spawnSoldier(i % 2 ? 'CPU' : 'NEUTRAL', bunker.x - 1.5 + i * 0.5, bunker.y + 0.9);
    s.state = i === 3 ? 'dead' : i % 2 ? 'waving' : 'running';
  }
  const flag = world.flags[0];
  if (flag) Object.assign(flag, { state: 'exposed', x: bunker.x + 1.2, y: bunker.y + 0.9 });
  const drone = new Drone(0, 'CPU', 'showcase', bunker.x - 2.6, bunker.y + 0.6);
  drone.heading = -0.4;
  world.drones.push(drone);
}
