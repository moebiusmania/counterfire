// The level editor's document (SPEC §10.5): a level being edited, with the operations the editor
// page offers. No DOM here, so the editing rules are testable.

import type { EntityType, Level, LevelEntity } from '../levels/schema';
import { isTileChar, type TileChar } from '../sim/terrain';
import type { Team } from '../sim/types';

export const BLANK: Level = {
  id: 'custom',
  name: 'Untitled',
  mode: 'tournament',
  players: 1,
  theme: 'temperate',
  tiles: [],
  entities: [],
  stock: { P1: { tank: 3, asv: 2, heli: 2, jeep: 3 } },
  flagCandidates: {},
  bounds: { x: 0, y: 0, w: 0, h: 0 },
};

export class EditorModel {
  level: Level;

  constructor(level?: Level) {
    this.level = level ? structuredClone(level) : EditorModel.blank(40, 32);
  }

  static blank(w: number, h: number): Level {
    const tiles = Array.from({ length: h }, (_, r) =>
      Array.from({ length: w }, (_, c) => (r < 2 || c < 2 || r >= h - 2 || c >= w - 2 ? '~' : '.')).join(''),
    );
    return { ...structuredClone(BLANK), tiles, bounds: { x: 0, y: 0, w, h } };
  }

  get w(): number {
    return this.level.tiles[0]?.length ?? 0;
  }

  get h(): number {
    return this.level.tiles.length;
  }

  tile(c: number, r: number): TileChar | undefined {
    const t = this.level.tiles[r]?.[c];
    return t && isTileChar(t) ? t : undefined;
  }

  /** Row r is the north-first row of the file; entities use world y, with y = h - 1 - r + 0.5. */
  entityAt(c: number, r: number): LevelEntity | undefined {
    return this.level.entities.find((e) => Math.floor(e.x) === c && Math.floor(e.y) === this.h - 1 - r);
  }

  paint(c: number, r: number, t: TileChar): boolean {
    const row = this.level.tiles[r];
    if (!row || c < 0 || c >= row.length || row[c] === t) return false;
    this.level.tiles[r] = row.slice(0, c) + t + row.slice(c + 1);
    return true;
  }

  /** Put an entity on a cell, replacing whatever stood there. Ids are made unique per type and team. */
  place(c: number, r: number, type: EntityType, team: Team, variant?: string): LevelEntity | undefined {
    if (!this.tile(c, r)) return undefined;
    this.erase(c, r);
    // one bunker per side: placing it again moves it
    if (type === 'bunker')
      this.level.entities = this.level.entities.filter((e) => !(e.type === 'bunker' && e.team === team));
    const e: LevelEntity = { id: this.freshId(type, team), type, team, x: c + 0.5, y: this.h - 1 - r + 0.5 };
    if (variant) e.variant = variant;
    if (type === 'bunker') e.rot = team === 'P2' ? Math.PI : 0;
    this.level.entities.push(e);
    return e;
  }

  erase(c: number, r: number): boolean {
    const e = this.entityAt(c, r);
    if (!e) return false;
    this.level.entities = this.level.entities.filter((x) => x !== e);
    return true;
  }

  private freshId(type: EntityType, team: Team): string {
    const base = `${team.toLowerCase()}-${type}`;
    for (let i = 1; ; i++) {
      const id = `${base}-${i}`;
      if (!this.level.entities.some((e) => e.id === id)) return id;
    }
  }

  /** Grow or shrink the map, keeping the top-left corner; new ground is open sea. */
  resize(w: number, h: number): void {
    const old = this.level.tiles;
    const oldH = old.length;
    this.level.tiles = Array.from({ length: h }, (_, r) => {
      const row = old[r] ?? '';
      return (row + '~'.repeat(w)).slice(0, w);
    });
    // entities keep their row from the top, so their world y shifts with the height
    this.level.entities = this.level.entities
      .map((e) => ({ ...e, y: e.y + (h - oldH) }))
      .filter((e) => e.x < w && e.y > 0 && e.y < h);
    this.level.bounds = { x: 0, y: 0, w, h };
  }

  /** The level as saved: flag candidates are every flag tower of each side, and the bounds clipped. */
  toLevel(boundsInset = 0): Level {
    const level = structuredClone(this.level);
    const sides: Team[] = level.players === 1 ? ['CPU'] : ['P1', 'P2'];
    level.flagCandidates = {};
    for (const side of sides) {
      level.flagCandidates[side] = level.entities
        .filter((e) => e.type === 'flagTower' && e.team === side && e.id)
        .map((e) => e.id as string);
    }
    const p1 = level.stock.P1 ?? { tank: 3, asv: 2, heli: 2, jeep: 3 };
    level.stock = level.players === 1 ? { P1: p1 } : { P1: p1, P2: level.stock.P2 ?? p1 };
    level.bounds = {
      x: boundsInset,
      y: boundsInset,
      w: this.w - 2 * boundsInset,
      h: this.h - 2 * boundsInset,
    };
    if (level.mode !== 'tournament' || level.players === 2) delete level.tier;
    return level;
  }
}
