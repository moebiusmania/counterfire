import { describe, expect, test } from 'bun:test';
import { splitMix } from '../src/audio/mix';
import { mergeInputs, PAD, padToInput } from '../src/input/gamepad';
import { input } from '../src/sim/types';

const pad = (stick = { x: 0, y: 0 }, dpad = { x: 0, y: 0 }, down: number[] = []) => ({
  stick,
  dpad,
  isDown: (b: number) => down.includes(b),
});

describe('gamepad', () => {
  test('the stick drives, with a dead zone', () => {
    expect(padToInput(pad({ x: 0, y: 0.9 }))).toMatchObject({ forward: true, back: false });
    expect(padToInput(pad({ x: -0.8, y: 0 }))).toMatchObject({ left: true, right: false });
    expect(padToInput(pad({ x: 0.2, y: -0.2 }))).toEqual(input());
  });

  test('the d-pad drives when the stick is centred', () => {
    expect(padToInput(pad(undefined, { x: 1, y: -1 }))).toMatchObject({ right: true, back: true });
  });

  test('buttons map to the three fire keys and the shoulders to turret/bank', () => {
    expect(padToInput(pad(undefined, undefined, [PAD.a, PAD.b, PAD.x, PAD.lb]))).toEqual(
      input({ fireGround: true, fireAir: true, switch: true, auxLeft: true }),
    );
    expect(padToInput(pad(undefined, undefined, [PAD.rt])).auxRight).toBe(true);
  });

  test('keyboard and gamepad add up', () => {
    expect(mergeInputs(input({ forward: true }), input({ fireGround: true }))).toEqual(
      input({ forward: true, fireGround: true }),
    );
    expect(mergeInputs(input({ left: true }), undefined)).toEqual(input({ left: true }));
  });
});

describe('split-screen sound', () => {
  const listeners = [
    { x: 0, y: 0, z: 0, pan: -0.7 },
    { x: 50, y: 0, z: 0, pan: 0.7 },
  ];

  test('plays on the side of the nearest player', () => {
    expect(splitMix({ x: 2, y: 0, z: 0 }, listeners, 30)).toEqual({ volume: 1, pan: -0.7 });
    expect(splitMix({ x: 47, y: 0, z: 0 }, listeners, 30)?.pan).toBe(0.7);
  });

  test('fades with distance and is silent out of range', () => {
    const near = splitMix({ x: 0, y: 0, z: 18 }, listeners, 30);
    expect(near?.volume).toBeGreaterThan(0);
    expect(near?.volume).toBeLessThan(1);
    expect(splitMix({ x: 25, y: 0, z: 40 }, listeners, 30)).toBeUndefined();
  });
});
