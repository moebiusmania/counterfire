// Terrain grid. Row 0 of a level's `tiles` is the north edge, so tile (x, y) sits at
// world x in [x, x+1) and world y in [h-1-row, h-row).

export const Tile = {
  Grass: '.',
  Road: '=',
  Sand: ':',
  Shallow: ',',
  Deep: '~',
  Forest: 'T',
  Wall: '#',
  Bridge: 'H',
  Rubble: 'x',
} as const;
export type TileChar = (typeof Tile)[keyof typeof Tile];

const VALID = new Set<string>(Object.values(Tile));

export type Mobility = 'ground' | 'amphibious' | 'air';

export function isTileChar(c: string): c is TileChar {
  return VALID.has(c);
}

export function passable(tile: TileChar, mobility: Mobility): boolean {
  if (mobility === 'air') return true;
  switch (tile) {
    case Tile.Forest:
    case Tile.Wall:
      return false;
    case Tile.Deep:
      return mobility === 'amphibious';
    default:
      return true;
  }
}

/** Does this tile stop a ground-level projectile? */
export function blocksShots(tile: TileChar): boolean {
  return tile === Tile.Forest || tile === Tile.Wall;
}

/** Anything that can say whether a circle fits at a spot: the terrain alone, or the world with its structures. */
export interface Collider {
  fits(px: number, py: number, radius: number, mobility: Mobility): boolean;
}

export class Terrain implements Collider {
  readonly w: number;
  readonly h: number;
  private readonly cells: TileChar[];
  /** Bumped on every change so renderers know to rebuild. */
  version = 0;

  constructor(rows: readonly string[]) {
    this.h = rows.length;
    this.w = rows[0]?.length ?? 0;
    this.cells = [];
    // store south row first so index = x + y * w with +y north
    for (let y = 0; y < this.h; y++) {
      const row = rows[this.h - 1 - y] ?? '';
      for (let x = 0; x < this.w; x++) {
        const c = row[x] ?? Tile.Deep;
        this.cells.push(isTileChar(c) ? c : Tile.Deep);
      }
    }
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** Tile at integer cell coords; outside the map is open sea. */
  get(x: number, y: number): TileChar {
    if (!this.inside(x, y)) return Tile.Deep;
    return this.cells[x + y * this.w] as TileChar;
  }

  /** Tile under a world position. */
  at(px: number, py: number): TileChar {
    return this.get(Math.floor(px), Math.floor(py));
  }

  set(x: number, y: number, tile: TileChar): void {
    if (!this.inside(x, y) || this.get(x, y) === tile) return;
    this.cells[x + y * this.w] = tile;
    this.version++;
  }

  /** Can a circle of `radius` at (px, py) stand here? */
  fits(px: number, py: number, radius: number, mobility: Mobility): boolean {
    if (mobility === 'air') return true;
    const x0 = Math.floor(px - radius);
    const x1 = Math.floor(px + radius);
    const y0 = Math.floor(py - radius);
    const y1 = Math.floor(py + radius);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (passable(this.get(x, y), mobility)) continue;
        // closest point of the cell to the circle centre
        const cx = Math.max(x, Math.min(px, x + 1));
        const cy = Math.max(y, Math.min(py, y + 1));
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy < radius * radius) return false;
      }
    }
    return true;
  }

  /** Rows as stored in a level file, north first. */
  toRows(): string[] {
    const rows: string[] = [];
    for (let y = this.h - 1; y >= 0; y--) {
      rows.push(this.cells.slice(y * this.w, (y + 1) * this.w).join(''));
    }
    return rows;
  }
}
