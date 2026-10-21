import { describe, expect, test } from 'bun:test';
import { Tile } from '../src/sim/terrain';
import { DEPOT, HELI, JEEP, MINES, SHOTS, VEHICLES } from '../src/sim/tuning';
import { type InputFrame, input, type PlayerId } from '../src/sim/types';
import { World } from '../src/sim/world';
import { openField, testLevel, twoPlayerLevel } from './helpers';

function run(world: World, ticks: number, frame = input(), player: PlayerId = 'P1') {
  for (let i = 0; i < ticks; i++) world.step({ [player]: frame });
}

function press(world: World, frame: InputFrame, player: PlayerId = 'P1') {
  world.step({ [player]: frame });
  world.step({ [player]: input() });
}

/** Run until an event of `type` shows up, or fail after `limit` ticks. */
function until(world: World, type: string, limit = 300, frame = input()) {
  for (let i = 0; i < limit; i++) {
    world.step({ P1: frame });
    if (world.events.some((e) => e.type === type)) return;
  }
  throw new Error(`no ${type} event within ${limit} ticks`);
}

describe('ASV', () => {
  test('is the slowest and toughest land vehicle', () => {
    expect(VEHICLES.asv.maxSpeed).toBeLessThan(VEHICLES.tank.maxSpeed);
    expect(VEHICLES.asv.hp).toBeGreaterThan(VEHICLES.tank.hp);
  });

  test('rockets fly straight ahead and clear forest', () => {
    const world = new World(testLevel(['..T..', '.....', '.....', '..B..']), 1);
    const asv = world.spawnVehicle('P1', 'asv');
    world.step({ P1: input({ fireGround: true }) });
    expect(asv.ammo).toBe(VEHICLES.asv.ammo - 1);
    until(world, 'treeDestroyed');
    expect(world.terrain.get(2, 3)).toBe(Tile.Grass);
  });

  test('cannot lay mines in a one-player game', () => {
    const world = new World(openField(), 1);
    world.spawnVehicle('P1', 'asv');
    press(world, input({ fireAir: true }));
    expect(world.mines.length).toBe(0);
  });

  test('a mine destroys any land vehicle that drives onto it', () => {
    const world = new World(twoPlayerLevel(['.......', '...C...', '.......', '.......', '...B...']), 1);
    const asv = world.spawnVehicle('P1', 'asv');
    asv.heading = Math.PI; // facing south, so the mine drops to the north
    press(world, input({ fireAir: true }));
    expect(world.mines.length).toBe(1);
    expect(asv.mines).toBe(MINES.count - 1);
    // move the ASV aside and drive a P2 tank south over the mine
    asv.x = 5.5;
    const tank = world.spawnVehicle('P2', 'tank');
    tank.heading = Math.PI; // facing south
    run(world, 200, input({ forward: true }), 'P2');
    expect(tank.state).toBe('destroyed');
    expect(world.mines.length).toBe(0);
  });
});

describe('helicopter', () => {
  test('flies over deep water and forest', () => {
    const world = new World(testLevel(['.....', '~~T~~', '~~T~~', '..B..']), 1);
    const heli = world.spawnVehicle('P1', 'heli');
    run(world, 120, input({ forward: true }));
    expect(heli.y).toBeGreaterThan(3.5);
    expect(heli.state).toBe('active');
  });

  test('banking strafes sideways without turning', () => {
    const world = new World(openField(), 1);
    const heli = world.spawnVehicle('P1', 'heli');
    const x0 = heli.x;
    run(world, 30, input({ auxRight: true }));
    expect(heli.x).toBeCloseTo(x0 + 30 * HELI.strafeSpeed, 6);
    expect(heli.heading).toBe(0);
  });

  test('Switch toggles gun and rockets, and rockets destroy bridges', () => {
    const world = new World(testLevel(['~~H~~', '.....', '.....', '.....', '..B..']), 1);
    const heli = world.spawnVehicle('P1', 'heli');
    press(world, input({ switch: true }));
    expect(heli.weapon).toBe('rockets');
    // fly south a little so the bridge sits at the end of rocket range
    heli.y = 4.5 - SHOTS.heliRocket.range - 0.6 + 0.2;
    world.step({ P1: input({ fireGround: true }) });
    expect(heli.rockets).toBe(HELI.rockets - 1);
    until(world, 'bridgeDestroyed');
    expect(world.terrain.get(2, 4)).toBe(Tile.Deep);
  });

  test('the gun leaves bridges alone', () => {
    const world = new World(testLevel(['~~H~~', '.....', '.....', '..B..']), 1);
    const heli = world.spawnVehicle('P1', 'heli');
    heli.y = 4.5 - SHOTS.heliGun.range - 0.6 + 0.2;
    run(world, 40, input({ fireGround: true }));
    expect(world.terrain.get(2, 3)).toBe(Tile.Bridge);
  });

  test('rockets destroy mines', () => {
    const world = new World(
      twoPlayerLevel(['.........', '.........', '.........', '....B...C', '.........']),
      1,
    );
    const heli = world.spawnVehicle('P1', 'heli');
    heli.weapon = 'rockets';
    world.mines.push({ id: 999, team: 'P2', x: heli.x, y: heli.y + 0.6 + SHOTS.heliRocket.range });
    world.step({ P1: input({ fireGround: true }) });
    until(world, 'mineExploded');
    expect(world.mines.length).toBe(0);
  });

  test('cannot rearm at a depot', () => {
    const level = openField();
    level.entities.push({ type: 'ammoTent', team: 'P1', x: 10.5, y: 11.5 });
    const world = new World(level, 1);
    const heli = world.spawnVehicle('P1', 'heli');
    heli.ammo = 0;
    run(world, 120);
    expect(heli.ammo).toBe(0);
  });

  test('crashes when the fuel runs out in the air', () => {
    const world = new World(openField(), 1);
    const heli = world.spawnVehicle('P1', 'heli');
    heli.fuel = 0.01;
    run(world, 5);
    expect(heli.state).toBe('destroyed');
  });
});

describe('jeep', () => {
  test('is the fastest vehicle and dies to one hit', () => {
    for (const t of ['tank', 'asv', 'heli'] as const)
      expect(VEHICLES.jeep.maxSpeed).toBeGreaterThan(VEHICLES[t].maxSpeed);
    const world = new World(openField(), 1);
    const jeep = world.spawnVehicle('P1', 'jeep');
    world.damageVehicle(jeep, 1);
    expect(jeep.state).toBe('destroyed');
  });

  test('needs inflated tyres to cross deep water', () => {
    const rows = ['.....', '.....', '~~~~~', '~~~~~', '.....', '..B..'];
    const flat = new World(testLevel(rows), 1);
    const j1 = flat.spawnVehicle('P1', 'jeep');
    run(flat, 200, input({ forward: true }));
    expect(j1.y).toBeLessThan(2);
    expect(j1.state).toBe('active');

    const world = new World(testLevel(rows), 1);
    const jeep = world.spawnVehicle('P1', 'jeep');
    press(world, input({ fireAir: true }));
    expect(jeep.tyresInflated).toBe(true);
    run(world, JEEP.inflateTicks);
    run(world, 200, input({ forward: true }));
    expect(jeep.y).toBeGreaterThan(4);
    expect(jeep.state).toBe('active');
  });

  test('grenades land a few tiles ahead and clear brush', () => {
    const world = new World(testLevel(['.....', '..T..', '.....', '.....', '..B..']), 1);
    world.spawnVehicle('P1', 'jeep');
    world.step({ P1: input({ fireGround: true }) });
    until(world, 'treeDestroyed');
    expect(world.terrain.get(2, 3)).toBe(Tile.Grass);
  });
});

describe('depots and terrain', () => {
  test('a parked tank refuels at its own fuel depot', () => {
    const level = openField();
    level.entities.push({ type: 'fuelDepot', team: 'P1', x: 10.5, y: 11.5 });
    const world = new World(level, 1);
    const tank = world.spawnVehicle('P1', 'tank');
    tank.fuel = 10;
    world.step();
    expect(world.events).toContainEqual({ type: 'resupply', vehicle: tank.id, depot: 'fuelDepot' });
    run(world, 60);
    expect(tank.fuel).toBeGreaterThan(10 + 60 * DEPOT.fuelPerTick * 0.9);
  });

  test("the enemy's depot does not serve you", () => {
    const level = twoPlayerLevel(['.....', '..C..', '.....', '..B..', '.....']);
    level.entities.push({ type: 'ammoTent', team: 'P2', x: 2.5, y: 2.5 });
    const world = new World(level, 1);
    const tank = world.spawnVehicle('P1', 'tank');
    tank.ammo = 0;
    run(world, 120);
    expect(tank.ammo).toBe(0);
  });

  test('a tank on a bridge sinks when the bridge goes', () => {
    const world = new World(testLevel(['~~~~~', '~~B~~', '~~~~~']), 1);
    world.terrain.set(2, 1, Tile.Bridge);
    const tank = world.spawnVehicle('P1', 'tank');
    world.step();
    expect(tank.state).toBe('active');
    world.terrain.set(2, 1, Tile.Deep);
    world.step();
    expect(tank.state).toBe('destroyed');
    expect(world.events.some((e) => e.type === 'sank')).toBe(true);
  });

  test('land vehicles push each other apart instead of overlapping', () => {
    const world = new World(openField(), 1);
    const a = world.spawnVehicle('P1', 'tank');
    const b = world.spawnVehicle('P1', 'tank');
    world.step();
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(2 * VEHICLES.tank.radius - 1e-9);
  });
});
