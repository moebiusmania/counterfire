import { describe, expect, test } from 'bun:test';
import { Glob } from 'bun';
import { type Level, validateLevel } from '../src/levels/schema';
import { testLevel } from './helpers';

const files = [
  ...new Glob('assets/levels/*.json').scanSync({ cwd: `${import.meta.dir}/..`, absolute: true }),
];

describe('shipped levels', () => {
  test('there is at least one level', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    test(`${file.split('/').pop()} is valid`, async () => {
      const level = (await Bun.file(file).json()) as Level;
      expect(validateLevel(level)).toEqual([]);
    });
  }
});

describe('validator', () => {
  test('rejects ragged rows and unknown tiles', () => {
    const errors = validateLevel(testLevel(['..B', '..', '.?.']));
    expect(errors.some((e) => e.includes('length'))).toBe(true);
  });

  test('rejects a flag tower the jeep cannot reach', () => {
    // a walled-off pocket in the top-left corner
    const level = testLevel(['.#...', '##...', '.....', '..B..']);
    level.entities[1] = { id: 't', type: 'flagTower', team: 'CPU', x: 0.5, y: 3.5 };
    expect(validateLevel(level)).toContain("P1's jeep cannot reach flag tower 't'");
  });

  test('a jeep may cross deep water to reach a tower', () => {
    const level = testLevel(['.~~~.', '.~~~.', '..B..']);
    level.entities[1] = { id: 't', type: 'flagTower', team: 'CPU', x: 2.5, y: 2.5 };
    expect(validateLevel(level)).toEqual([]);
  });
});

describe('level registry', () => {
  test('lists every level file and nothing else', async () => {
    const { LEVELS } = await import('../src/levels');
    const ids = await Promise.all(files.map(async (f) => ((await Bun.file(f).json()) as Level).id));
    expect(Object.keys(LEVELS).sort()).toEqual(ids.sort());
  });

  test('getLevel hands out copies', async () => {
    const { getLevel } = await import('../src/levels');
    const a = getLevel('duel-01');
    const b = getLevel('duel-01');
    if (!a || !b) throw new Error('missing duel-01');
    a.tiles[0] = 'changed';
    expect(b.tiles[0]).not.toBe('changed');
  });

  test('two-player maps built by tools/mirror-level.ts are point-symmetric', async () => {
    const { getLevel } = await import('../src/levels');
    const level = getLevel('duel-01');
    if (!level) throw new Error('missing duel-01');
    const h = level.tiles.length;
    level.tiles.forEach((row, r) => {
      expect([...(level.tiles[h - 1 - r] ?? '')].reverse().join('')).toBe(row);
    });
    const p1 = level.entities.filter((e) => e.team === 'P1').length;
    expect(level.entities.filter((e) => e.team === 'P2').length).toBe(p1);
  });
});
