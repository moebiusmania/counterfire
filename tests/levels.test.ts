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
