import type { Level } from '../src/levels/schema';

/** A small one-player level from tile rows; the P1 bunker sits on the tile marked 'B' (grass underneath). */
export function testLevel(rows: string[], extra: Partial<Level> = {}): Level {
  const h = rows.length;
  let bunker = { x: 1.5, y: 1.5 };
  const tiles = rows.map((row, r) => {
    const c = row.indexOf('B');
    if (c >= 0) bunker = { x: c + 0.5, y: h - 1 - r + 0.5 };
    return row.replace('B', '.');
  });
  return {
    id: 'test',
    name: 'Test',
    mode: 'training',
    players: 1,
    theme: 'temperate',
    tiles,
    entities: [
      { id: 'b', type: 'bunker', team: 'P1', ...bunker, rot: 0 },
      { id: 't', type: 'flagTower', team: 'CPU', x: 0.5, y: 0.5 },
    ],
    stock: { P1: { tank: 1, asv: 1, heli: 1, jeep: 1 } },
    flagCandidates: { CPU: ['t'] },
    bounds: { x: 0, y: 0, w: tiles[0]?.length ?? 0, h },
    ...extra,
  };
}

/** An open grass field with the bunker in the middle. */
export function openField(size = 21): Level {
  const rows: string[] = [];
  for (let r = 0; r < size; r++) rows.push('.'.repeat(size));
  const mid = Math.floor(size / 2);
  const row = rows[mid] as string;
  rows[mid] = `${row.slice(0, mid)}B${row.slice(mid + 1)}`;
  return testLevel(rows);
}
