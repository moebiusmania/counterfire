import { describe, expect, test } from 'bun:test';
import { track } from '../src/levels';
import { connected, generateDuel, generateLevel, tierCounts, tierStock } from '../src/levels/generate';
import { validateLevel } from '../src/levels/schema';
import { World } from '../src/sim/world';

const spec = (tier: number, seed: number) => ({
  id: `t${tier}`,
  name: 'T',
  mode: 'tournament' as const,
  theme: 'temperate' as const,
  seed,
  tier,
});

describe('generator', () => {
  test('is deterministic', () => {
    expect(generateLevel(spec(4, 9))).toEqual(generateLevel(spec(4, 9)));
    expect(generateLevel(spec(4, 9))).not.toEqual(generateLevel(spec(4, 10)));
  });

  test('makes valid maps at every tier and in every layout', () => {
    for (let tier = 1; tier <= 9; tier++) {
      for (const layout of [undefined, 'chessboard', 'atoll'] as const) {
        const level = generateLevel({ ...spec(tier, tier * 31), layout });
        expect(validateLevel(level)).toEqual([]);
        // and the sim can run it
        new World(level, 1).step();
      }
    }
  });

  test('the bunker is clear of turrets at the start', () => {
    for (let tier = 1; tier <= 9; tier++) {
      const level = generateLevel(spec(tier, 77));
      const bunker = level.entities.find((e) => e.type === 'bunker');
      if (!bunker) throw new Error('no bunker');
      for (const t of level.entities.filter((e) => e.type === 'turret'))
        expect(Math.hypot(t.x - bunker.x, t.y - bunker.y)).toBeGreaterThanOrEqual(10);
    }
  });

  test('gets harder with each tier: more defences, fewer vehicles and depots', () => {
    for (let tier = 2; tier <= 9; tier++) {
      const a = tierCounts(tier - 1);
      const b = tierCounts(tier);
      expect(b.turrets).toBeGreaterThanOrEqual(a.turrets);
      expect(b.towers).toBeGreaterThanOrEqual(a.towers);
      expect(b.drones).toBeGreaterThanOrEqual(a.drones);
      expect(b.depots).toBeLessThanOrEqual(a.depots);
      const sa = tierStock(tier - 1);
      const sb = tierStock(tier);
      expect(sb.tank + sb.asv + sb.heli + sb.jeep).toBeLessThanOrEqual(sa.tank + sa.asv + sa.heli + sa.jeep);
    }
  });

  test('two-player maps are valid and symmetric', () => {
    for (let i = 0; i < 6; i++) {
      const level = generateDuel({ ...spec(3, 400 + i), layout: i % 3 === 2 ? 'chessboard' : undefined });
      expect(validateLevel(level)).toEqual([]);
      const h = level.tiles.length;
      level.tiles.forEach((row, r) =>
        expect([...(level.tiles[h - 1 - r] ?? '')].reverse().join('')).toBe(row),
      );
    }
  });
});

describe('shipped set (SPEC §10.2)', () => {
  test('6 training maps, 54 tournament maps in 9 tiers of 6, 12 two-player maps', () => {
    expect(track('training').length).toBe(6);
    const tournament = track('tournament');
    expect(tournament.length).toBe(54);
    for (let tier = 1; tier <= 9; tier++) expect(tournament.filter((l) => l.tier === tier).length).toBe(6);
    expect(track('duel').length).toBe(12);
  });

  test('every map has a unique name and themes vary', () => {
    const all = [...track('training'), ...track('tournament'), ...track('duel')];
    expect(new Set(all.map((l) => l.name)).size).toBe(all.length);
    expect(new Set(all.map((l) => l.theme))).toEqual(new Set(['temperate', 'desert', 'winter', 'novelty']));
  });

  test('a land vehicle can reach the compound on maps that have bridges', () => {
    for (const level of track('tournament').filter((l) => l.tier && l.tier <= 3 && l.theme !== 'novelty')) {
      const bunker = level.entities.find((e) => e.type === 'bunker');
      const tower = level.entities.find((e) => e.type === 'flagTower');
      if (!bunker || !tower) throw new Error(level.id);
      expect(connected(level, bunker, tower, 'ground')).toBe(true);
    }
  });
});
