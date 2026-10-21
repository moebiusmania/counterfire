// Build a fair two-player level from its southern half (SPEC §10.2: symmetric 2P maps).
//
//   bun tools/mirror-level.ts assets/levels/src/duel-01.half.json assets/levels/duel-01.json
//
// The half file holds the full level's fields, but `tiles` are only the southern rows and
// `entities` only P1's and neutral ones. See src/levels/mirror.ts.

import { type HalfLevel, mirrorLevel } from '../src/levels/mirror';
import { validateLevel } from '../src/levels/schema';

export type { HalfLevel };

if (import.meta.main) {
  const [from, to] = process.argv.slice(2);
  if (!from || !to) throw new Error('usage: bun tools/mirror-level.ts <half.json> <out.json>');
  const level = mirrorLevel((await Bun.file(from).json()) as HalfLevel);
  const errors = validateLevel(level);
  if (errors.length) throw new Error(`${to} is not valid:\n  ${errors.join('\n  ')}`);
  await Bun.write(to, `${JSON.stringify(level, null, 2)}\n`);
  console.log(`${to}: ${level.tiles[0]?.length}x${level.tiles.length}, ${level.entities.length} entities`);
}
