// Build a fair two-player level from its southern half (SPEC §10.2: symmetric 2P maps).
//
//   bun tools/mirror-level.ts assets/levels/src/duel-01.half.json assets/levels/duel-01.json
//
// The half file holds the full level's fields, but `tiles` are only the southern rows and
// `entities` only P1's and neutral ones. The north half is the south turned half a turn about the
// map centre: tile (c, r) becomes (w-1-c, h-1-r), P1 entities become P2's facing the other way,
// and neutral entities are copied as they are. P1's flag candidates are mirrored for P2.

import { type Level, type LevelEntity, validateLevel } from '../src/levels/schema';

export type HalfLevel = Omit<Level, 'players'> & { players?: 2 };

export function mirrorLevel(half: HalfLevel): Level {
  const south = half.tiles;
  const w = south[0]?.length ?? 0;
  const north = [...south].reverse().map((row) => [...row].reverse().join(''));
  const tiles = [...north, ...south];
  const h = tiles.length;
  for (const row of south) if (row.length !== w) throw new Error('ragged half map');

  const entities: LevelEntity[] = [];
  for (const e of half.entities) {
    entities.push(e);
    const twin: LevelEntity = { ...e, x: w - e.x, y: h - e.y };
    if (e.team === 'P1') {
      twin.team = 'P2';
      if (e.id) twin.id = e.id.replace(/^p1/, 'p2');
    } else if (e.id) {
      twin.id = `${e.id}-north`;
    }
    if (e.rot !== undefined) twin.rot = e.rot + Math.PI;
    entities.push(twin);
  }

  const p1 = half.flagCandidates.P1 ?? [];
  return {
    ...half,
    players: 2,
    tiles,
    entities,
    stock: { P1: half.stock.P1, P2: half.stock.P1 },
    flagCandidates: { P1: p1, P2: p1.map((id) => id.replace(/^p1/, 'p2')) },
    bounds: { x: 0, y: 0, w, h },
  } as Level;
}

if (import.meta.main) {
  const [from, to] = process.argv.slice(2);
  if (!from || !to) throw new Error('usage: bun tools/mirror-level.ts <half.json> <out.json>');
  const level = mirrorLevel((await Bun.file(from).json()) as HalfLevel);
  const errors = validateLevel(level);
  if (errors.length) throw new Error(`${to} is not valid:\n  ${errors.join('\n  ')}`);
  await Bun.write(to, `${JSON.stringify(level, null, 2)}\n`);
  console.log(`${to}: ${level.tiles[0]?.length}x${level.tiles.length}, ${level.entities.length} entities`);
}
