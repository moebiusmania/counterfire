import { describe, expect, test } from 'bun:test';
import type { LevelEntity } from '../src/levels/schema';
import { Tile } from '../src/sim/terrain';
import { SHOTS, STRUCTURES, SUBMARINE, TURRETS } from '../src/sim/tuning';
import { input, type PlayerId, wrapAngle } from '../src/sim/types';
import { World } from '../src/sim/world';
import { openField, testLevel } from './helpers';

function run(world: World, ticks: number, frame = input(), player: PlayerId = 'P1') {
  for (let i = 0; i < ticks; i++) world.step({ [player]: frame });
}

/** The open field with extra entities placed relative to the bunker at (10.5, 10.5). */
function fieldWith(...entities: LevelEntity[]) {
  const level = openField();
  level.entities.push(...entities);
  return new World(level, 3);
}

describe('structures', () => {
  test('an intact building blocks a tank; once destroyed it is rubble the tank drives over', () => {
    const world = fieldWith({ id: 'h', type: 'building', team: 'NEUTRAL', x: 10.5, y: 13.5 });
    const tank = world.spawnVehicle('P1', 'tank');
    run(world, 120, input({ forward: true }));
    expect(tank.y).toBeLessThan(13.5 - STRUCTURES.footprint / 2);
    const house = world.structures.find((s) => s.entity.id === 'h');
    if (!house) throw new Error('no house');
    world.damageStructure(house, house.hp);
    expect(house.destroyed).toBe(true);
    expect(world.terrain.get(10, 13)).toBe(Tile.Rubble);
    run(world, 120, input({ forward: true }));
    expect(tank.y).toBeGreaterThan(14);
  });

  test('tank shells wear a building down', () => {
    const world = fieldWith({ id: 'h', type: 'building', team: 'NEUTRAL', x: 10.5, y: 14.5 });
    const house = world.structures.find((s) => s.entity.id === 'h');
    world.spawnVehicle('P1', 'tank');
    world.step({ P1: input({ fireGround: true }) });
    run(world, 30);
    expect(house?.hp).toBe(STRUCTURES.hp.building - SHOTS.tankShell.damage);
  });

  test('soldiers run out of a destroyed building', () => {
    const world = fieldWith({ id: 'h', type: 'building', team: 'NEUTRAL', x: 4.5, y: 4.5 });
    const house = world.structures.find((s) => s.entity.id === 'h');
    if (!house) throw new Error('no house');
    world.damageStructure(house, 999);
    const [min, max] = STRUCTURES.soldiers;
    expect(world.soldiers.length).toBeGreaterThanOrEqual(min);
    expect(world.soldiers.length).toBeLessThanOrEqual(max);
  });

  test('a destroyed depot serves nobody', () => {
    const world = fieldWith({ id: 'f', type: 'fuelDepot', team: 'P1', x: 10.5, y: 11.5 });
    const tank = world.spawnVehicle('P1', 'tank');
    tank.fuel = 10;
    const depot = world.structures.find((s) => s.entity.id === 'f');
    if (depot) world.damageStructure(depot, 999);
    run(world, 60);
    expect(tank.fuel).toBeLessThan(10);
  });

  test('the bunker cannot be destroyed', () => {
    const world = new World(openField(), 1);
    const bunker = world.structures.find((s) => s.type === 'bunker');
    if (!bunker) throw new Error('no bunker');
    world.damageStructure(bunker, 1e9);
    expect(bunker.destroyed).toBe(false);
  });
});

describe('soldiers', () => {
  test('run away from a vehicle that comes close', () => {
    const world = new World(openField(), 1);
    world.spawnVehicle('P1', 'tank');
    const s = world.spawnSoldier('NEUTRAL', 10.5, 12.5);
    run(world, 60);
    expect(s.y).toBeGreaterThan(13);
  });

  test('are run over by a moving land vehicle', () => {
    const world = new World(openField(), 1);
    const tank = world.spawnVehicle('P1', 'tank');
    tank.speed = tank.tuning.maxSpeed;
    const s = world.spawnSoldier('NEUTRAL', 10.5, 11.1); // right under the tracks
    world.step({ P1: input({ forward: true }) });
    expect(s.state).toBe('dead');
    expect(world.events).toContainEqual({
      type: 'soldierKilled',
      soldier: s.id,
      x: s.x,
      y: s.y,
      crushed: true,
    });
  });

  test('are killed by a blast', () => {
    const world = fieldWith({ id: 'h', type: 'building', team: 'NEUTRAL', x: 4.5, y: 4.5 });
    const s = world.spawnSoldier('NEUTRAL', 4.5, 5.4);
    const house = world.structures.find((t) => t.entity.id === 'h');
    if (house) world.damageStructure(house, 999); // a big explosion next door
    expect(s.state).toBe('dead');
  });

  test('a driver who runs out of fuel walks home and goes down into the bunker', () => {
    const world = new World(openField(), 1);
    const tank = world.spawnVehicle('P1', 'tank');
    tank.y = 14.5;
    tank.fuel = 0;
    run(world, 2);
    expect(tank.state).toBe('abandoned');
    expect(world.soldiers.length).toBe(1);
    run(world, 600);
    expect(world.soldiers.length).toBe(0);
  });
});

describe('turrets', () => {
  const gun = (team: 'CPU' | 'P1' = 'CPU'): LevelEntity => ({
    id: 'g',
    type: 'turret',
    team,
    variant: 'gun',
    x: 10.5,
    y: 15.5,
  });

  test('turn toward an enemy in range and fire', () => {
    const world = fieldWith(gun());
    world.spawnVehicle('P1', 'tank');
    run(world, 200);
    // the tank is due south of the turret
    const aim = world.structures.find((s) => s.entity.id === 'g')?.aim ?? 0;
    expect(Math.abs(wrapAngle(aim - Math.PI))).toBeLessThan(0.1);
    const shots = [...Array(400)].reduce((n: number) => {
      world.step();
      return n + world.events.filter((e) => e.type === 'shot' && e.kind === 'turretShell').length;
    }, 0);
    expect(shots).toBeGreaterThan(0);
  });

  test('a gun turret wears down a tank', () => {
    const world = fieldWith(gun());
    const tank = world.spawnVehicle('P1', 'tank');
    run(world, 400);
    expect(tank.hp).toBeLessThan(100);
  });

  test('ignore their own side and anything out of range', () => {
    const own = fieldWith(gun('P1'));
    const t1 = own.spawnVehicle('P1', 'tank');
    run(own, 400);
    expect(t1.hp).toBe(100);

    const far = fieldWith({ ...gun(), y: 10.5 + TURRETS.gun.range + 3 });
    const t2 = far.spawnVehicle('P1', 'tank');
    run(far, 400);
    expect(t2.hp).toBe(100);
  });

  test('gun turrets cannot hit the helicopter; missile turrets can', () => {
    const g = fieldWith(gun());
    const h1 = g.spawnVehicle('P1', 'heli');
    run(g, 600);
    expect(h1.hp).toBe(h1.tuning.hp);

    const m = fieldWith({ ...gun(), variant: 'missile' });
    const h2 = m.spawnVehicle('P1', 'heli');
    run(m, 900);
    expect(h2.hp).toBeLessThan(h2.tuning.hp);
  });

  test('a destroyed turret stops firing', () => {
    const world = fieldWith(gun());
    const tank = world.spawnVehicle('P1', 'tank');
    const turret = world.structures.find((s) => s.entity.id === 'g');
    if (turret) world.damageStructure(turret, 999);
    run(world, 400);
    expect(tank.hp).toBe(100);
  });
});

describe('submarine', () => {
  // an island in open sea, bounds hugging the island
  const rows = ['~~~~~~~~~', '~.......~', '~.......~', '~...B...~', '~.......~', '~.......~', '~~~~~~~~~'];
  const islandWorld = () => {
    const level = testLevel(rows);
    level.bounds = { x: 1, y: 1, w: 7, h: 5 };
    return new World(level, 5);
  };

  test('surfaces when a vehicle leaves the bounds, and its heat-seeker finds it', () => {
    const world = islandWorld();
    const heli = world.spawnVehicle('P1', 'heli');
    heli.x = 10; // off the east edge
    let surfaced = false;
    for (let i = 0; i < 600 && heli.alive; i++) {
      world.step();
      surfaced ||= world.events.some((e) => e.type === 'subSurfacing');
    }
    expect(surfaced).toBe(true);
    expect(heli.state).toBe('destroyed');
  });

  test('stays down while everyone keeps inside the bounds', () => {
    const world = islandWorld();
    world.spawnVehicle('P1', 'tank');
    run(world, 300);
    expect(world.submarine.state).toBe('hidden');
  });

  test('the heat-seeker chases whatever is nearest, not just the culprit', () => {
    const world = islandWorld();
    const culprit = world.spawnVehicle('P1', 'heli');
    culprit.x = 14;
    culprit.y = 3.5;
    // a decoy right next to where the missile will come from
    const decoy = world.spawnVehicle('P1', 'tank');
    world.player('P1').vehicle = culprit;
    for (let i = 0; i < 400 && !world.shots.some((s) => s.kind === 'subMissile'); i++) world.step();
    const missile = world.shots.find((s) => s.kind === 'subMissile');
    if (!missile) throw new Error('no missile');
    culprit.x = 40; // flee far away
    decoy.x = missile.x - 1;
    decoy.y = missile.y;
    world.step();
    expect(missile.target).toBe(decoy.id);
  });

  test('cannot be destroyed', () => {
    const world = islandWorld();
    expect('hp' in world.submarine).toBe(false);
    expect(SUBMARINE.standoff).toBeGreaterThan(0);
  });
});
