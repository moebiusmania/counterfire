import { describe, expect, test } from 'bun:test';
import type { Level } from '../src/levels/schema';
import { Tile } from '../src/sim/terrain';
import { DRONES, FLAGS } from '../src/sim/tuning';
import { input, type PlayerId } from '../src/sim/types';
import { World } from '../src/sim/world';
import { openField, twoPlayerLevel } from './helpers';

function run(world: World, ticks: number, frame = input(), player: PlayerId = 'P1') {
  for (let i = 0; i < ticks; i++) world.step({ [player]: frame });
}

/** The open field with two CPU flag towers north of the bunker at (10.5, 10.5). */
function flagField(): Level {
  const level = openField();
  level.entities = level.entities.filter((e) => e.id !== 't');
  level.entities.push(
    { id: 't1', type: 'flagTower', team: 'CPU', x: 6.5, y: 16.5 },
    { id: 't2', type: 'flagTower', team: 'CPU', x: 14.5, y: 16.5 },
  );
  level.flagCandidates = { CPU: ['t1', 't2'] };
  return level;
}

function cpuFlag(world: World) {
  const flag = world.flags.find((f) => f.team === 'CPU');
  if (!flag) throw new Error('no CPU flag');
  return flag;
}

function towerOf(world: World, id: number) {
  const t = world.structures.find((s) => s.id === id);
  if (!t) throw new Error('no tower');
  return t;
}

/** Destroy the tower hiding the CPU flag and put a P1 jeep right on the flag. */
function exposeAndGrab(world: World) {
  const flag = cpuFlag(world);
  world.damageStructure(towerOf(world, flag.tower), 1e6);
  const jeep = world.spawnVehicle('P1', 'jeep');
  jeep.x = flag.x;
  jeep.y = flag.y - 0.3;
  world.step();
  return { flag, jeep };
}

describe('flags', () => {
  test('each side hides its flag in one of its candidate towers, chosen by the seed', () => {
    const towers = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const world = new World(flagField(), seed);
      const flag = cpuFlag(world);
      expect(flag.state).toBe('hidden');
      towers.add(towerOf(world, flag.tower).entity.id ?? '');
    }
    expect([...towers].sort()).toEqual(['t1', 't2']);
    const two = new World(twoPlayerLevel(['.....', '..C..', '.....', '..B..', '.....']), 1);
    expect(two.flags.map((f) => f.team).sort()).toEqual(['P1', 'P2']);
  });

  test('destroying the wrong tower leaves the flag hidden; the right one exposes it', () => {
    const world = new World(flagField(), 4);
    const flag = cpuFlag(world);
    const other = world.structures.find((s) => s.type === 'flagTower' && s.id !== flag.tower);
    if (other) world.damageStructure(other, 1e6);
    expect(flag.state).toBe('hidden');
    world.damageStructure(towerOf(world, flag.tower), 1e6);
    expect(flag.state).toBe('exposed');
    expect(world.events.some((e) => e.type === 'flagExposed')).toBe(true);
  });

  test('only a jeep picks the flag up', () => {
    const world = new World(flagField(), 4);
    const flag = cpuFlag(world);
    world.damageStructure(towerOf(world, flag.tower), 1e6);
    const tank = world.spawnVehicle('P1', 'tank');
    tank.x = flag.x;
    tank.y = flag.y;
    run(world, 5);
    expect(flag.state).toBe('exposed');
    tank.x += 3; // out of the jeep's way
    const { jeep } = exposeAndGrab(world);
    expect(flag.state).toBe('carried');
    expect(flag.carrier).toBe(jeep.id);
  });

  test('bringing the enemy flag home to the bunker wins the game', () => {
    const world = new World(flagField(), 4);
    const { jeep } = exposeAndGrab(world);
    jeep.x = 10.5;
    jeep.y = 10.5;
    world.step();
    expect(world.outcome?.winner).toBe('P1');
    expect(world.outcome?.reason).toBe('flagCaptured');
  });

  test('Switch drops the flag, and nobody can grab it straight back', () => {
    const world = new World(flagField(), 4);
    const { flag } = exposeAndGrab(world);
    world.step({ P1: input({ switch: true }) });
    expect(flag.state).toBe('exposed');
    world.step();
    expect(flag.state).toBe('exposed');
    run(world, FLAGS.pickupDelay);
    expect(flag.state).toBe('carried');
  });

  test('a destroyed jeep drops the flag where it was', () => {
    const world = new World(flagField(), 4);
    const { flag, jeep } = exposeAndGrab(world);
    jeep.y -= 2;
    world.damageVehicle(jeep, 1);
    world.step();
    expect(flag.state).toBe('exposed');
    expect(flag.y).toBeCloseTo(jeep.y, 6);
  });

  test('a flag dropped at sea floats back to shore', () => {
    const rows = ['.....~~~~~', '.....~~~~~', '..B..~~~~~', '.....~~~~~'];
    const level = twoPlayerLevel(rows.map((r, i) => (i === 0 ? `${r.slice(0, 3)}C${r.slice(4)}` : r)));
    const world = new World(level, 1);
    const flag = world.flags[0];
    if (!flag) throw new Error('no flag');
    flag.state = 'floating';
    flag.x = 8.5;
    flag.y = 1.5;
    run(world, 600);
    expect(world.flags[0]?.state).toBe('exposed'); // read back: TS narrowed flag.state above
    expect(world.terrain.at(flag.x, flag.y)).not.toBe(Tile.Deep);
  });

  test('a player who brings their own flag home hides it in a different tower', () => {
    const level = twoPlayerLevel([
      '.........',
      '....C....',
      '.........',
      '.........',
      '....B....',
      '.........',
    ]);
    level.entities = level.entities.filter((e) => e.id !== 't2');
    level.entities.push(
      { id: 'p1a', type: 'flagTower', team: 'P1', x: 1.5, y: 0.5 },
      { id: 'p1b', type: 'flagTower', team: 'P1', x: 7.5, y: 0.5 },
    );
    level.flagCandidates.P1 = ['p1a', 'p1b'];
    const world = new World(level, 2);
    const flag = world.flags.find((f) => f.team === 'P1');
    if (!flag) throw new Error('no P1 flag');
    const before = flag.tower;
    world.damageStructure(towerOf(world, flag.tower), 1e6);
    const jeep = world.spawnVehicle('P1', 'jeep');
    jeep.x = flag.x;
    jeep.y = flag.y + 0.3;
    world.step();
    expect(flag.state).toBe('carried');
    jeep.x = 4.5;
    jeep.y = 1.5; // the P1 bunker
    world.step();
    expect(flag.state).toBe('hidden');
    expect(flag.tower).not.toBe(before);
    expect(world.outcome).toBeUndefined();
  });
});

describe('win and loss', () => {
  test('running out of vehicles loses', () => {
    const world = new World(flagField(), 1);
    const p = world.player('P1');
    p.stock = { tank: 0, asv: 0, heli: 0, jeep: 0 };
    world.step();
    expect(world.outcome).toEqual({ winner: 'CPU', reason: 'outOfVehicles', tick: 1 });
  });

  test('alone against the CPU, losing the last jeep loses', () => {
    const world = new World(flagField(), 1);
    world.player('P1').stock.jeep = 0;
    world.step();
    expect(world.outcome?.reason).toBe('outOfJeeps');
  });

  test('two players: the one with vehicles left wins', () => {
    const world = new World(twoPlayerLevel(['.....', '..C..', '.....', '..B..', '.....']), 1);
    world.player('P2').stock = { tank: 0, asv: 0, heli: 0, jeep: 0 };
    world.step();
    expect(world.outcome?.winner).toBe('P1');
  });

  test('the world stops once the game is over', () => {
    const world = new World(flagField(), 1);
    const tank = world.spawnVehicle('P1', 'tank');
    world.endGame('P1', 'flagCaptured');
    run(world, 60, input({ forward: true }));
    expect(tank.speed).toBe(0);
  });
});

describe('drones', () => {
  function droneField() {
    const level = flagField();
    level.entities.push({ id: 'd1', type: 'droneSpawn', team: 'CPU', x: 10.5, y: 17.5 });
    return level;
  }

  test('launch from their spawn and attack a vehicle in sight', () => {
    const world = new World(droneField(), 1);
    world.step();
    expect(world.drones.length).toBe(1);
    const tank = world.spawnVehicle('P1', 'tank');
    run(world, 600);
    expect(tank.hp).toBeLessThan(tank.tuning.hp);
  });

  test('can be shot down, and are replaced after a while', () => {
    const world = new World(droneField(), 1);
    world.step();
    const drone = world.drones[0];
    if (!drone) throw new Error('no drone');
    const tank = world.spawnVehicle('P1', 'tank');
    drone.x = tank.x;
    drone.y = tank.y + 3;
    world.step({ P1: input({ fireGround: true }) });
    for (let i = 0; i < 30 && world.drones.length; i++) world.step();
    expect(world.drones.length).toBe(0);
    run(world, DRONES.respawnTicks + 2);
    expect(world.drones.length).toBe(1);
  });

  test("count as heat for the submarine's missile", () => {
    const world = new World(droneField(), 1);
    world.step();
    const drone = world.drones[0];
    if (!drone) throw new Error('no drone');
    const missile = world.spawnShot('subMissile', -1, drone.x + 1, drone.y, 0, {
      speed: 0.2,
      range: 80,
      damage: 1000,
      air: true,
      hitsAir: true,
      homing: 'heat',
      turnRate: 0.07,
    });
    world.step();
    expect(missile.target).toBe(drone.id);
  });
});

describe('jeep beacon', () => {
  test('green facing the exposed enemy flag, red facing home, off otherwise', async () => {
    const { jeepBeacon } = await import('../src/sim/beacon');
    const world = new World(flagField(), 4);
    const flag = cpuFlag(world);
    const jeep = world.spawnVehicle('P1', 'jeep');
    expect(jeepBeacon(world, jeep)).toBe('off'); // sitting on the bunker pad
    jeep.y = 12.5; // north of the bunker
    jeep.heading = Math.PI; // facing south, toward the bunker
    expect(jeepBeacon(world, jeep)).toBe('red');
    jeep.heading = Math.PI / 2; // west
    expect(jeepBeacon(world, jeep)).toBe('off');
    // a hidden flag does not light it
    jeep.x = flag.x;
    jeep.y = flag.y - 3;
    jeep.heading = 0;
    expect(jeepBeacon(world, jeep)).toBe('off');
    world.damageStructure(towerOf(world, flag.tower), 1e6);
    expect(jeepBeacon(world, jeep)).toBe('green');
  });
});
