// Level file format (SPEC §10.3b) and its validator (SPEC §10.3a step 3).

import { isTileChar, type Mobility, passable, Terrain } from '../sim/terrain';
import type { PlayerId, Team, VehicleType } from '../sim/types';

export type EntityType =
  | 'bunker'
  | 'flagTower'
  | 'building'
  | 'turret'
  | 'fuelDepot'
  | 'ammoTent'
  | 'droneSpawn';

export interface LevelEntity {
  id?: string;
  type: EntityType;
  team?: Team;
  x: number;
  y: number;
  rot?: number;
  variant?: string;
}

export type Stock = Record<VehicleType, number>;

export interface Level {
  id: string;
  name: string;
  mode: 'training' | 'tournament';
  players: 1 | 2 | 'both';
  tier?: number;
  theme: 'temperate' | 'desert' | 'winter' | 'novelty';
  /** Terrain rows, north first; one character per tile (see sim/terrain.ts). */
  tiles: string[];
  entities: LevelEntity[];
  stock: Partial<Record<PlayerId, Stock>>;
  /** flagTower ids the flag may be hidden in, per side. */
  flagCandidates: Partial<Record<Team, string[]>>;
  /** Playable area; leaving it surfaces the submarine. */
  bounds: { x: number; y: number; w: number; h: number };
}

const ENTITY_TYPES = new Set<EntityType>([
  'bunker',
  'flagTower',
  'building',
  'turret',
  'fuelDepot',
  'ammoTent',
  'droneSpawn',
]);

/** Returns a list of problems; empty means the level is valid. */
export function validateLevel(level: Level): string[] {
  const errors: string[] = [];
  const h = level.tiles.length;
  const w = level.tiles[0]?.length ?? 0;
  if (!level.id) errors.push('missing id');
  if (!h || !w) errors.push('tiles are empty');
  level.tiles.forEach((row, i) => {
    if (row.length !== w) errors.push(`row ${i} has length ${row.length}, expected ${w}`);
    for (const c of row) if (!isTileChar(c)) errors.push(`row ${i} has unknown tile '${c}'`);
  });
  if (errors.length) return errors;

  const terrain = new Terrain(level.tiles);
  const ids = new Map<string, LevelEntity>();
  for (const e of level.entities) {
    if (!ENTITY_TYPES.has(e.type)) errors.push(`unknown entity type '${e.type}'`);
    if (!terrain.inside(Math.floor(e.x), Math.floor(e.y)))
      errors.push(`${e.id ?? e.type} is outside the map`);
    if (e.id) {
      if (ids.has(e.id)) errors.push(`duplicate entity id '${e.id}'`);
      ids.set(e.id, e);
    }
  }

  const players: PlayerId[] = level.players === 1 ? ['P1'] : ['P1', 'P2'];
  for (const p of players) {
    const bunker = level.entities.find((e) => e.type === 'bunker' && e.team === p);
    if (!bunker) {
      errors.push(`${p} has no bunker`);
      continue;
    }
    if (!level.stock[p]) errors.push(`${p} has no vehicle stock`);
    else if (level.stock[p].jeep < 1) errors.push(`${p} has no jeep, so it can never capture a flag`);

    // every enemy flag candidate must be reachable by jeep from this bunker (SPEC §10.3 rule 8)
    const enemy: Team = level.players === 1 ? 'CPU' : p === 'P1' ? 'P2' : 'P1';
    for (const id of level.flagCandidates[enemy] ?? []) {
      const tower = ids.get(id);
      if (!tower) continue;
      if (!reachable(terrain, bunker, tower, 'amphibious'))
        errors.push(`${p}'s jeep cannot reach flag tower '${id}'`);
    }
  }

  const sides: Team[] = level.players === 1 ? ['CPU'] : ['P1', 'P2'];
  for (const side of sides) {
    const list = level.flagCandidates[side] ?? [];
    if (!list.length) errors.push(`${side} has no flag candidates`);
    for (const id of list) {
      const e = ids.get(id);
      if (!e) errors.push(`flag candidate '${id}' does not exist`);
      else if (e.type !== 'flagTower') errors.push(`flag candidate '${id}' is a ${e.type}, not a flagTower`);
    }
  }

  const b = level.bounds;
  if (b.w <= 0 || b.h <= 0 || b.x < 0 || b.y < 0 || b.x + b.w > w || b.y + b.h > h)
    errors.push('bounds must be a non-empty area inside the map');
  return errors;
}

/** Breadth-first search over tiles; structures stand on passable tiles and the start/goal tiles always count. */
export function reachable(
  terrain: Terrain,
  from: { x: number; y: number },
  to: { x: number; y: number },
  mobility: Mobility,
): boolean {
  const sx = Math.floor(from.x);
  const sy = Math.floor(from.y);
  const gx = Math.floor(to.x);
  const gy = Math.floor(to.y);
  const seen = new Uint8Array(terrain.w * terrain.h);
  const queue: number[] = [sx + sy * terrain.w];
  seen[sx + sy * terrain.w] = 1;
  while (queue.length) {
    const i = queue.shift() as number;
    const x = i % terrain.w;
    const y = (i - x) / terrain.w;
    // the goal is a structure tile; standing next to it is enough
    if (Math.abs(x - gx) + Math.abs(y - gy) <= 1) return true;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!terrain.inside(nx, ny)) continue;
      const n = nx + ny * terrain.w;
      if (seen[n] || !passable(terrain.get(nx, ny), mobility)) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return false;
}
