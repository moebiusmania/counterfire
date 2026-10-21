import { expect, test } from 'bun:test';
import training01 from '../assets/levels/training-01.json';
import type { Level } from '../src/levels/schema';
import { type InputFrame, input } from '../src/sim/types';
import { World } from '../src/sim/world';

/** A scripted drive: forward, turn, shoot, reverse, turret sweep. */
function script(tick: number): InputFrame {
  const phase = Math.floor(tick / 60) % 5;
  return input({
    forward: phase === 0 || phase === 1,
    left: phase === 1,
    fireGround: tick % 45 === 0,
    back: phase === 3,
    auxRight: phase === 4,
  });
}

function play(seed: number, ticks: number): string {
  const world = new World(training01 as Level, seed);
  world.spawnVehicle('P1', 'tank');
  for (let t = 0; t < ticks; t++) world.step({ P1: script(t) });
  return world.hash();
}

test('same seed and inputs reproduce the same world state', () => {
  expect(play(42, 900)).toBe(play(42, 900));
});

test('the hash notices a different input stream', () => {
  const world = new World(training01 as Level, 42);
  world.spawnVehicle('P1', 'tank');
  for (let t = 0; t < 900; t++) world.step({ P1: script(t + 1) });
  expect(world.hash()).not.toBe(play(42, 900));
});

/** Bunker loop: pick a slot, drive and shoot, self-destruct, repeat with the next slot. */
function bunkerScript(tick: number): InputFrame {
  const t = tick % 600;
  return input({
    right: t === 10,
    fireGround: t === 30 || (t > 120 && t % 40 === 0),
    forward: t > 100 && t < 400,
    left: t > 250 && t < 300,
    fireAir: t === 200 || t === 500,
    switch: t === 220 || t === 500,
    auxLeft: t > 300 && t < 340,
  });
}

function playBunker(seed: number, ticks: number): string {
  const world = new World(training01 as Level, seed);
  for (let t = 0; t < ticks; t++) world.step({ P1: bunkerScript(t) });
  return world.hash();
}

test('the bunker loop with every vehicle replays exactly', () => {
  expect(playBunker(7, 2400)).toBe(playBunker(7, 2400));
});
