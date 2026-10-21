import { describe, expect, test } from 'bun:test';
import { BUNKER } from '../src/sim/tuning';
import { type InputFrame, input } from '../src/sim/types';
import { World } from '../src/sim/world';
import { openField } from './helpers';

/** Hold a frame for one tick, then release, so the sim sees a single press. */
function press(world: World, frame: InputFrame) {
  world.step({ P1: frame });
  world.step({ P1: input() });
}

function run(world: World, ticks: number, frame = input()) {
  for (let i = 0; i < ticks; i++) world.step({ P1: frame });
}

function deploy(world: World, slot = 0) {
  for (let i = 0; i < slot; i++) press(world, input({ right: true }));
  press(world, input({ fireGround: true }));
  run(world, BUNKER.elevatorTicks + 1);
}

describe('bunker', () => {
  test('players start in the bunker and pick a slot with left and right', () => {
    const world = new World(openField(), 1);
    const p = world.player('P1');
    expect(p.mode).toBe('bunker');
    press(world, input({ right: true }));
    press(world, input({ right: true }));
    expect(p.selected).toBe(2);
    press(world, input({ left: true }));
    press(world, input({ left: true }));
    press(world, input({ left: true }));
    expect(p.selected).toBe(3); // wraps round
  });

  test('Ground Fire sends the selected vehicle up the elevator and takes it from stock', () => {
    const world = new World(openField(), 1);
    const p = world.player('P1');
    press(world, input({ fireGround: true }));
    const v = p.vehicle;
    expect(p.mode).toBe('field');
    expect(v?.type).toBe('tank');
    expect(p.stock.tank).toBe(0);
    expect(v?.controllable).toBe(false);
    run(world, BUNKER.elevatorTicks);
    expect(v?.controllable).toBe(true);
  });

  test('an empty slot deploys nothing', () => {
    const world = new World(openField(), 1);
    const p = world.player('P1');
    p.stock.tank = 0;
    world.step({ P1: input({ fireGround: true }) });
    expect(world.events.some((e) => e.type === 'stockEmpty')).toBe(true);
    expect(p.mode).toBe('bunker');
  });

  test('driving back onto the bunker lights it; Fire takes the vehicle down, repaired and back in stock', () => {
    const world = new World(openField(), 1);
    const p = world.player('P1');
    deploy(world);
    const v = p.vehicle;
    if (!v) throw new Error('no vehicle');
    run(world, 60, input({ forward: true }));
    expect(v.onBunker).toBe(false);
    v.hp = 10;
    // reverse until over the pad, then let it coast to a stop
    for (let i = 0; i < 600 && v.y - p.bunker.y > 0.3; i++) world.step({ P1: input({ back: true }) });
    run(world, 30);
    expect(Math.hypot(v.x - p.bunker.x, v.y - p.bunker.y)).toBeLessThan(BUNKER.radius);
    expect(v.onBunker).toBe(true);
    press(world, input({ fireGround: true }));
    expect(world.shots.length).toBe(0); // the key went to the bunker, not the gun
    run(world, BUNKER.elevatorTicks + 5);
    expect(p.mode).toBe('bunker');
    expect(p.stock.tank).toBe(1);
    expect(world.vehicles).not.toContain(v);
  });

  test('the bunker light stays off until the vehicle has left the pad', () => {
    const world = new World(openField(), 1);
    deploy(world);
    expect(world.player('P1').vehicle?.onBunker).toBe(false);
  });

  test('self-destruct loses the vehicle and returns the player to the bunker', () => {
    const world = new World(openField(), 1);
    const p = world.player('P1');
    deploy(world);
    const v = p.vehicle;
    world.step({ P1: input({ fireGround: true, fireAir: true, switch: true }) });
    expect(v?.state).toBe('destroyed');
    run(world, BUNKER.lostDelay + 1);
    expect(p.mode).toBe('bunker');
    expect(p.stock.tank).toBe(0);
  });

  test('an abandoned vehicle also sends the player back after the delay', () => {
    const world = new World(openField(), 1);
    const p = world.player('P1');
    deploy(world);
    if (p.vehicle) p.vehicle.fuel = 0.01;
    run(world, 30, input({ forward: true }));
    run(world, 60);
    expect(p.vehicle?.state).toBe('abandoned');
    run(world, BUNKER.lostDelay + 1);
    expect(p.mode).toBe('bunker');
  });
});
