// Two-player maps are point-symmetric (SPEC §10.4a): the north half is the south half turned half a
// turn about the map centre: tile (c, r) becomes (w-1-c, h-1-r), P1 entities become P2's facing the
// other way, neutral entities are copied as they are, and P1's flag candidates are mirrored for P2.

import type { Level, LevelEntity } from './schema';

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
