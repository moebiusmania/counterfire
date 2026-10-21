import { describe, expect, test } from 'bun:test';
import { Tile } from '../src/sim/terrain';
import { VEHICLES } from '../src/sim/tuning';
import { input } from '../src/sim/types';
import { World } from '../src/sim/world';
import { openField, testLevel } from './helpers';

function run(world: World, ticks: number, frame = input()) {
  for (let i = 0; i < ticks; i++) world.step({ P1: frame });
}

describe('tank', () => {
  test('drives north at heading 0 and tops out at max speed', () => {
    const world = new World(openField(), 1);
    const tank = world.spawnVehicle('P1', 'tank');
    const y0 = tank.y;
    run(world, 60, input({ forward: true }));
    expect(tank.y).toBeGreaterThan(y0);
    expect(tank.x).toBeCloseTo(10.5, 6);
    expect(tank.speed).toBeCloseTo(VEHICLES.tank.maxSpeed, 6);
  });

  test('coasts to a stop with no throttle', () => {
    const world = new World(openField(), 1);
    const tank = world.spawnVehicle('P1', 'tank');
    run(world, 30, input({ forward: true }));
    run(world, 60);
    expect(tank.speed).toBe(0);
  });

  test('turret turns independently of the hull and Switch re-centres it', () => {
    const world = new World(openField(), 1);
    const tank = world.spawnVehicle('P1', 'tank');
    run(world, 10, input({ auxLeft: true }));
    expect(tank.heading).toBe(0);
    expect(tank.turret).toBeCloseTo(10 * VEHICLES.tank.turretTurnRate, 6);
    run(world, 100, input({ switch: true }));
    expect(tank.turret).toBe(0);
  });

  test('cannot drive into deep water', () => {
    const world = new World(testLevel(['~~~~~', '.....', '..B..', '.....']), 1);
    const tank = world.spawnVehicle('P1', 'tank');
    run(world, 200, input({ forward: true }));
    // the water row starts at y = 3; the hull radius keeps the centre short of it
    expect(tank.y).toBeLessThanOrEqual(3 - VEHICLES.tank.radius + 1e-9);
    expect(tank.state).toBe('active');
  });

  test('shell flattens a forest tile and uses one round', () => {
    const world = new World(testLevel(['..T..', '.....', '.....', '..B..']), 1);
    const tank = world.spawnVehicle('P1', 'tank');
    run(world, 1, input({ fireGround: true }));
    expect(tank.ammo).toBe(VEHICLES.tank.ammo - 1);
    let destroyed = false;
    for (let i = 0; i < 60 && !destroyed; i++) {
      world.step();
      destroyed = world.events.some((e) => e.type === 'treeDestroyed');
    }
    expect(destroyed).toBe(true);
    expect(world.terrain.get(2, 3)).toBe(Tile.Grass);
    expect(world.shots.length).toBe(0);
  });

  test('fire rate is limited by the cooldown and ammo runs out', () => {
    const world = new World(openField(), 1);
    const tank = world.spawnVehicle('P1', 'tank');
    run(world, VEHICLES.tank.fireCooldown * 3, input({ fireGround: true }));
    expect(tank.ammo).toBe(VEHICLES.tank.ammo - 3);
    tank.ammo = 0;
    tank.cooldown = 0;
    world.step({ P1: input({ fireGround: true }) });
    expect(world.events.some((e) => e.type === 'dryFire')).toBe(true);
  });

  test('out of fuel: stops, then the driver bails out', () => {
    const world = new World(openField(41), 1);
    const tank = world.spawnVehicle('P1', 'tank');
    tank.fuel = 0.05;
    const events: string[] = [];
    for (let i = 0; i < 200; i++) {
      world.step({ P1: input({ forward: true }) });
      events.push(...world.events.map((e) => e.type));
    }
    expect(events).toContain('outOfFuel');
    expect(events).toContain('driverBailed');
    expect(tank.state).toBe('abandoned');
    expect(tank.speed).toBe(0);
  });

  test('a shell damages another vehicle until it is destroyed', () => {
    const world = new World(openField(), 1);
    const target = world.spawnVehicle('P1', 'tank');
    world.spawnVehicle('P1', 'tank'); // the player now drives the shooter
    target.y += 4;
    target.prevY = target.y;
    const hits = Math.ceil(VEHICLES.tank.hp / 35);
    run(world, VEHICLES.tank.fireCooldown * hits + 30, input({ fireGround: true }));
    expect(target.state).toBe('destroyed');
  });
});
