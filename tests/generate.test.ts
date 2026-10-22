import { describe, expect, test } from 'bun:test';
import { track } from '../src/levels';
import { connected, generateDuel, generateLevel, tierCounts, tierStock } from '../src/levels/generate';
import { validateLevel } from '../src/levels/schema';
import { Tile } from '../src/sim/terrain';
import { FLAGS, VEHICLES } from '../src/sim/tuning';
import type { PlayerId } from '../src/sim/types';
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
      level.tiles.forEach((row, r) => {
        expect([...(level.tiles[h - 1 - r] ?? '')].reverse().join('')).toBe(row);
      });
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

  test('every map has a fuel depot within reach of the P1 bunker', () => {
    for (const level of [...track('training'), ...track('tournament'), ...track('duel')]) {
      const bunker = level.entities.find((e) => e.type === 'bunker');
      const fuel = level.entities.filter((e) => e.type === 'fuelDepot' && e.team === bunker?.team);
      if (!bunker) throw new Error(level.id);
      expect(fuel.length).toBeGreaterThan(0);
      expect(Math.min(...fuel.map((f) => Math.hypot(f.x - bunker.x, f.y - bunker.y)))).toBeLessThan(9);
    }
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

/** Where a vehicle of this radius can drive from its bunker, sampled every STEP tiles from the tile corners. */
function driveArea(world: World, player: PlayerId, radius: number) {
  const STEP = 0.25;
  const w = Math.ceil(world.terrain.w / STEP);
  const h = Math.ceil(world.terrain.h / STEP);
  const seen = new Uint8Array(w * h);
  const b = world.player(player).bunker;
  const start = Math.round(b.x / STEP) + Math.round(b.y / STEP) * w;
  seen[start] = 1;
  const queue = [start];
  for (let i = queue.pop(); i !== undefined; i = queue.pop()) {
    const x = i % w;
    const y = (i - x) / w;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      const k = nx + ny * w;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[k]) continue;
      if (!world.fits(nx * STEP, ny * STEP, radius, 'ground')) continue;
      seen[k] = 1;
      queue.push(k);
    }
  }
  /** Does the area come within `d` tiles of (px, py)? */
  return (px: number, py: number, d: number) => {
    for (let y = Math.max(0, Math.floor((py - d) / STEP)); y <= Math.min(h - 1, (py + d) / STEP); y++)
      for (let x = Math.max(0, Math.floor((px - d) / STEP)); x <= Math.min(w - 1, (px + d) / STEP); x++)
        if (seen[x + y * w] && Math.hypot(x * STEP - px, y * STEP - py) <= d) return true;
    return false;
  };
}

describe('on every shipped map with bridges, land vehicles get across', () => {
  // vehicles are circles: leave them room to steer, not just a line to thread
  const STEER = { jeep: 0.15, asv: 0.15 };
  const maps = [...track('training'), ...track('tournament'), ...track('duel')].filter((l) =>
    l.tiles.some((row) => row.includes(Tile.Bridge)),
  );
  for (const level of maps) {
    test(level.id, () => {
      const world = new World(structuredClone(level), 1);
      for (const p of world.players.keys()) {
        const towers = world.structures.filter((s) => s.type === 'flagTower' && s.team !== p);
        // the ASV, the widest, gets across to within range of the enemy's towers
        const asv = driveArea(world, p, VEHICLES.asv.radius + STEER.asv);
        expect(towers.some((t) => asv(t.x, t.y, 4))).toBe(true);
        // and once they are rubble, the jeep drives up to every flag
        for (const t of towers) t.destroyed = true;
        const jeep = driveArea(world, p, VEHICLES.jeep.radius + STEER.jeep);
        for (const t of towers) expect(jeep(t.x, t.y, FLAGS.pickupRadius)).toBe(true);
        for (const t of towers) t.destroyed = false;
      }
    });
  }
});
