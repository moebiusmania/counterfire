// Every shipped level, by id. Levels are data only (SPEC §10.4); add the JSON here to ship it.

import duel01 from '../../assets/levels/duel-01.json';
import training01 from '../../assets/levels/training-01.json';
import type { Level } from './schema';

export const LEVELS: Readonly<Record<string, Level>> = Object.fromEntries(
  [training01, duel01].map((l) => [l.id, l as Level]),
);

/** A level by id, as a fresh copy the game may change. */
export function getLevel(id: string): Level | undefined {
  const level = LEVELS[id];
  return level && structuredClone(level);
}

/** The first level for a player count: the first training map alone, the first duel for two. */
export function defaultLevelId(players: 1 | 2): string {
  return players === 2 ? 'duel-01' : 'training-01';
}
