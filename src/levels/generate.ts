// The procedural rough-in (SPEC §10.3a step 2): a whole level from a seed and a difficulty tier,
// following the design rules of SPEC §10.3. Deterministic: the same spec always makes the same map.
//
// Layout of a one-player map, south to north: the player's bunker near the south shore, depots
// along a road that winds north, often over a river by bridge, to the CPU's walled flag compound
// near the north shore. Higher tiers add turrets, drones, towers, water and distance, and take away
// vehicles, depots and bridges. Two-player maps are made as a southern half and mirrored.

import { Rng } from '../sim/rng';
import { type Mobility, passable, Tile, type TileChar } from '../sim/terrain';
import type { Team } from '../sim/types';
import { mirrorLevel } from './mirror';
import { type EntityType, type Level, type LevelEntity, type Stock, validateLevel } from './schema';

export type Layout = 'islands' | 'chessboard' | 'atoll';

export interface GenSpec {
  id: string;
  name: string;
  mode: Level['mode'];
  theme: Level['theme'];
  seed: number;
  /** 1 easiest to 9 hardest. */
  tier: number;
  layout?: Layout;
  size?: { w: number; h: number };
  /** Overrides for what the tier would choose. */
  towers?: number;
  turrets?: number;
  drones?: number;
  depots?: number;
  /** Bridge the river on the road north; false leaves the compound to the helicopter and an amphibious jeep. */
  bridges?: boolean;
  lakes?: number;
  stock?: Stock;
  /** Shrink the playable bounds by this many tiles from the map edge (the submarine lesson). */
  boundsInset?: number;
  /** Neutral buildings near the bunker, as targets. */
  targets?: number;
}

// --- a tile grid, row 0 the north edge, as level files store it ---

class Grid {
  readonly cells: TileChar[][];
  constructor(
    readonly w: number,
    readonly h: number,
    fill: TileChar = Tile.Deep,
  ) {
    this.cells = Array.from({ length: h }, () => Array<TileChar>(w).fill(fill));
  }
  inside(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.w && r < this.h;
  }
  get(c: number, r: number): TileChar {
    return this.inside(c, r) ? (this.cells[r]?.[c] as TileChar) : Tile.Deep;
  }
  set(c: number, r: number, t: TileChar): void {
    const row = this.cells[r];
    if (row && c >= 0 && c < this.w) row[c] = t;
  }
  rect(c0: number, r0: number, c1: number, r1: number, t: TileChar): void {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.set(c, r, t);
  }
  isLand(c: number, r: number): boolean {
    const t = this.get(c, r);
    return t !== Tile.Deep && t !== Tile.Bridge;
  }
  rows(): string[] {
    return this.cells.map((row) => row.join(''));
  }
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** A cell is free for a structure when it is open ground and nothing stands on it or next to it. */
class Placer {
  /** Cells with a structure on them; others keep a gap from these. */
  private readonly taken = new Set<number>();
  /** Cells kept clear (roads, the bunker apron), with no gap needed next to them. */
  private readonly clear = new Set<number>();
  readonly entities: LevelEntity[] = [];
  constructor(
    private readonly g: Grid,
    private readonly rng: Rng,
  ) {}

  private key(c: number, r: number): number {
    return r * this.g.w + c;
  }

  free(c: number, r: number, gap = 1): boolean {
    const t = this.g.get(c, r);
    if (t !== Tile.Grass && t !== Tile.Sand) return false;
    if (this.clear.has(this.key(c, r))) return false;
    for (let dr = -gap; dr <= gap; dr++)
      for (let dc = -gap; dc <= gap; dc++) if (this.taken.has(this.key(c + dc, r + dr))) return false;
    return true;
  }

  /** Keep a cell clear of structures (roads, the bunker apron); building right beside it is fine. */
  reserve(c: number, r: number): void {
    this.clear.add(this.key(c, r));
  }

  place(c: number, r: number, e: Omit<LevelEntity, 'x' | 'y'>): LevelEntity {
    const entity = { ...e, x: c + 0.5, y: this.g.h - 1 - r + 0.5 } as LevelEntity;
    this.entities.push(entity);
    this.taken.add(this.key(c, r));
    return entity;
  }

  /** Place on a random free cell among `cells`, or nothing if none is free. */
  placeAny(cells: [number, number][], e: Omit<LevelEntity, 'x' | 'y'>, gap = 1): LevelEntity | undefined {
    const options = cells.filter(([c, r]) => this.free(c, r, gap));
    const pick = options[this.rng.int(options.length)];
    return pick ? this.place(pick[0], pick[1], e) : undefined;
  }
}

// --- terrain ---

function paintEllipse(g: Grid, rng: Rng, cx: number, cy: number, rx: number, ry: number, t: TileChar): void {
  for (let r = Math.floor(cy - ry - 1); r <= cy + ry + 1; r++) {
    for (let c = Math.floor(cx - rx - 1); c <= cx + rx + 1; c++) {
      const d = ((c + 0.5 - cx) / rx) ** 2 + ((r + 0.5 - cy) / ry) ** 2;
      // a ragged coastline: the edge wobbles cell by cell
      if (d < 0.82 + rng.next() * 0.25) g.set(c, r, t);
    }
  }
}

function landMass(g: Grid, rng: Rng, layout: Layout, rows: [number, number]): void {
  const [top, bottom] = rows;
  const midR = (top + bottom) / 2;
  switch (layout) {
    case 'chessboard': {
      // squares of land on alternate cells, joined later by roads and bridges
      const size = 5;
      for (let r = top; r + size <= bottom + 1; r += size) {
        for (let c = 3; c + size <= g.w - 3; c += size) {
          if (((r - top) / size + (c - 3) / size) % 2 === 0)
            g.rect(c, r, c + size - 1, r + size - 1, Tile.Grass);
        }
      }
      break;
    }
    case 'atoll': {
      // a ring of land round a lagoon, with an island in the middle
      paintEllipse(g, rng, g.w / 2, midR, g.w / 2 - 3, (bottom - top) / 2, Tile.Grass);
      paintEllipse(g, rng, g.w / 2, midR, g.w / 2 - 8, (bottom - top) / 2 - 5, Tile.Deep);
      paintEllipse(g, rng, g.w / 2, midR - 1, 5, 3, Tile.Grass);
      break;
    }
    default: {
      // overlapping blobs over the whole span, so there is land in the south and in the north
      const blobs = 4 + rng.int(3);
      for (let i = 0; i < blobs; i++) {
        const cx = 6 + rng.next() * (g.w - 12);
        const cy = top + 3 + (i / (blobs - 1)) * (bottom - top - 6) + rng.range(-2, 2);
        paintEllipse(
          g,
          rng,
          cx,
          cy,
          g.w * rng.range(0.18, 0.3),
          (bottom - top) * rng.range(0.15, 0.25),
          Tile.Grass,
        );
      }
      paintEllipse(g, rng, g.w / 2, bottom - 4, g.w * 0.22, 4, Tile.Grass);
      paintEllipse(g, rng, g.w / 2, top + 4, g.w * 0.25, 4, Tile.Grass);
    }
  }
}

/** A river across the island, wobbling as it goes. */
function river(g: Grid, rng: Rng, row: number, width: number): void {
  let r = row;
  for (let c = 0; c < g.w; c++) {
    for (let k = 0; k < width; k++) if (g.isLand(c, r + k)) g.set(c, r + k, Tile.Deep);
    if (rng.next() < 0.25) r += rng.next() < 0.5 ? -1 : 1;
    r = Math.max(row - 2, Math.min(row + 2, r));
  }
}

/** Sand wherever land meets deep water; a little shallow water off some beaches. */
function beaches(g: Grid): void {
  const sand: [number, number][] = [];
  for (let r = 0; r < g.h; r++) {
    for (let c = 0; c < g.w; c++) {
      if (g.get(c, r) !== Tile.Grass) continue;
      if (NEIGHBOURS.some(([dc, dr]) => g.get(c + dc, r + dr) === Tile.Deep)) sand.push([c, r]);
    }
  }
  for (const [c, r] of sand) g.set(c, r, Tile.Sand);
}

/** Keep the map's border as open sea. */
function clearBorder(g: Grid, margin: number): void {
  for (let r = 0; r < g.h; r++) {
    for (let c = 0; c < g.w; c++) {
      if (r < margin || c < margin || r >= g.h - margin || c >= g.w - margin) g.set(c, r, Tile.Deep);
    }
  }
}

/** The cheapest 4-way path, crossing water only where it must; returns cells start to goal. */
function path(g: Grid, from: [number, number], to: [number, number], waterCost: number): [number, number][] {
  const n = g.w * g.h;
  const dist = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const prev = new Int32Array(n).fill(-1);
  const start = from[1] * g.w + from[0];
  const goal = to[1] * g.w + to[0];
  dist[start] = 0;
  // the maps are small: a plain O(n^2) Dijkstra is fast enough and simple
  const done = new Uint8Array(n);
  for (;;) {
    let u = -1;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      if (!done[i] && (dist[i] as number) < best) {
        best = dist[i] as number;
        u = i;
      }
    }
    if (u < 0 || u === goal) break;
    done[u] = 1;
    const c = u % g.w;
    const r = (u - c) / g.w;
    for (const [dc, dr] of NEIGHBOURS) {
      const nc = c + dc;
      const nr = r + dr;
      if (!g.inside(nc, nr) || nc < 1 || nr < 1 || nc >= g.w - 1 || nr >= g.h - 1) continue;
      const t = g.get(nc, nr);
      if (t === Tile.Wall) continue;
      const cost = t === Tile.Deep ? waterCost : t === Tile.Road ? 0.5 : 1;
      const v = nr * g.w + nc;
      if (best + cost < (dist[v] as number)) {
        dist[v] = best + cost;
        prev[v] = u;
      }
    }
  }
  const out: [number, number][] = [];
  for (let v = goal; v >= 0; v = prev[v] as number) out.push([v % g.w, Math.floor(v / g.w)]);
  return out.reverse();
}

/**
 * Lay a road along a path. Water on it becomes a bridge three tiles wide, or stays water when bridges
 * are off. A one-tile bridge, or a staircase of them where the path crosses water on the diagonal,
 * leaves a tank or an ASV no room to steer; widened, the steps of a staircase fill in as well.
 */
function road(g: Grid, cells: [number, number][], bridges: boolean): void {
  if (bridges) {
    for (const [c, r] of cells)
      if (g.get(c, r) === Tile.Deep || g.get(c, r) === Tile.Bridge) widen(g, c, r, Tile.Bridge);
    // a road squeezed between waters on land gets beach either side
    for (const [c, r] of cells) if (g.isLand(c, r)) widen(g, c, r, Tile.Sand);
  }
  for (const [c, r] of cells) {
    const t = g.get(c, r);
    if (t !== Tile.Deep && t !== Tile.Bridge) g.set(c, r, Tile.Road);
  }
}

/** Turn the deep water round a cell into `t`. */
function widen(g: Grid, c: number, r: number, t: TileChar): void {
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) if (g.get(c + dc, r + dr) === Tile.Deep) g.set(c + dc, r + dr, t);
}

/** The cells a land vehicle can drive to from `from`, over the grid's terrain. */
function landReach(g: Grid, from: [number, number]): Set<number> {
  const seen = new Set<number>([from[1] * g.w + from[0]]);
  const queue = [from];
  for (let next = queue.pop(); next; next = queue.pop()) {
    for (const [dc, dr] of NEIGHBOURS) {
      const c = next[0] + dc;
      const r = next[1] + dr;
      const k = r * g.w + c;
      if (!g.inside(c, r) || seen.has(k) || !passable(g.get(c, r), 'ground')) continue;
      seen.add(k);
      queue.push([c, r]);
    }
  }
  return seen;
}

/** Cells within a step of a route, kept clear of forest and structures so a tank always has room. */
function routeMargin(g: Grid, routes: [number, number][][]): Set<number> {
  const out = new Set<number>();
  for (const [c, r] of routes.flat())
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) out.add((r + dr) * g.w + c + dc);
  return out;
}

function forests(g: Grid, rng: Rng, count: number, keepClear: (c: number, r: number) => boolean): void {
  const grass = cellsWhere(g, (c, r) => g.get(c, r) === Tile.Grass && !keepClear(c, r));
  for (let i = 0; i < count; i++) {
    // start each patch on open grass, so it grows on land
    const start = grass[rng.int(grass.length)];
    if (!start) return;
    let [c, r] = start;
    const size = 8 + rng.int(18);
    for (let k = 0; k < size; k++) {
      if (g.get(c, r) === Tile.Grass && !keepClear(c, r)) g.set(c, r, Tile.Forest);
      const [dc, dr] = NEIGHBOURS[rng.int(4)] as readonly [number, number];
      c += dc;
      r += dr;
    }
  }
}

/** Find a grass cell in a band of rows whose surroundings are all land. */
function findSite(
  g: Grid,
  rng: Rng,
  rows: [number, number],
  clear: number,
  preferC = g.w / 2,
): [number, number] {
  let best: [number, number] | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let r = rows[0]; r <= rows[1]; r++) {
    for (let c = clear + 1; c < g.w - clear - 1; c++) {
      let ok = true;
      for (let dr = -clear; dr <= clear && ok; dr++)
        for (let dc = -clear; dc <= clear && ok; dc++) if (!g.isLand(c + dc, r + dr)) ok = false;
      if (!ok) continue;
      const score = Math.abs(c - preferC) + rng.next() * 3;
      if (score < bestScore) {
        bestScore = score;
        best = [c, r];
      }
    }
  }
  if (best) return best;
  // nowhere fits: make room
  const c = Math.round(preferC);
  const r = Math.round((rows[0] + rows[1]) / 2);
  g.rect(c - clear - 1, r - clear - 1, c + clear + 1, r + clear + 1, Tile.Grass);
  return [c, r];
}

interface Compound {
  /** The cell just outside the gate. */
  gate: [number, number];
  interior: [number, number][];
  /** The cells just inside the gate, kept clear so nothing blocks the way in. */
  entry: [number, number][];
}

/** A walled compound with a gate in the south wall (SPEC §10.3 rule 3). */
function compound(g: Grid, c: number, r: number, w: number, h: number): Compound {
  const c0 = c - Math.floor(w / 2);
  const r0 = r - Math.floor(h / 2);
  g.rect(c0 - 1, r0 - 1, c0 + w, r0 + h, Tile.Grass);
  g.rect(c0, r0, c0 + w - 1, r0 + h - 1, Tile.Wall);
  g.rect(c0 + 1, r0 + 1, c0 + w - 2, r0 + h - 2, Tile.Grass);
  // a gate three tiles wide, so a tank can drive in as well as a jeep
  const gateC = c0 + Math.floor(w / 2);
  for (let dc = -1; dc <= 1; dc++) g.set(gateC + dc, r0 + h - 1, Tile.Road);
  const interior: [number, number][] = [];
  const entry: [number, number][] = [];
  for (let rr = r0 + 1; rr <= r0 + h - 2; rr++)
    for (let cc = c0 + 1; cc <= c0 + w - 2; cc++)
      (rr === r0 + h - 2 && Math.abs(cc - gateC) <= 1 ? entry : interior).push([cc, rr]);
  return { gate: [gateC, r0 + h], interior, entry };
}

function cellsWhere(g: Grid, test: (c: number, r: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < g.h; r++) for (let c = 0; c < g.w; c++) if (test(c, r)) out.push([c, r]);
  return out;
}

const near = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// --- tier rules (SPEC §10.2) ---

export function tierStock(tier: number): Stock {
  return {
    tank: Math.max(1, 4 - Math.floor(tier / 3)),
    asv: Math.max(1, 3 - Math.floor(tier / 4)),
    heli: Math.max(1, 3 - Math.floor(tier / 4)),
    jeep: Math.max(2, 4 - Math.floor(tier / 4)),
  };
}

export function tierCounts(tier: number) {
  return {
    towers: Math.min(8, 3 + Math.floor(((tier - 1) * 5) / 8)),
    turrets: 1 + Math.round(tier * 1.4),
    drones: tier < 2 ? 0 : Math.floor((tier + 1) / 3),
    depots: Math.max(1, 4 - Math.floor(tier / 3)),
    lakes: Math.min(3, Math.floor(tier / 3)),
    missileShare: Math.min(0.6, 0.1 + tier * 0.06),
  };
}

// --- one-player maps ---

export function generateLevel(spec: GenSpec): Level {
  for (let attempt = 0; attempt < 25; attempt++) {
    const level = buildOnePlayer(spec, spec.seed + attempt * 7919);
    if (!validateLevel(level).length) return level;
  }
  throw new Error(`could not generate a valid ${spec.id}`);
}

function buildOnePlayer(spec: GenSpec, seed: number): Level {
  const rng = new Rng(seed);
  const tier = spec.tier;
  const counts = { ...tierCounts(tier), ...definedOnly(spec) };
  const layout = spec.layout ?? 'islands';
  const w = spec.size?.w ?? 40 + tier * 2 + rng.int(5);
  const h = spec.size?.h ?? 32 + tier * 2 + rng.int(5);
  const g = new Grid(w, h);

  landMass(g, rng, layout, [3, h - 4]);
  const bridges = spec.bridges ?? !(tier >= 7 && rng.next() < 0.4);
  if (layout === 'islands' && (tier >= 3 || rng.next() < 0.5))
    river(g, rng, Math.round(h * 0.45), 2 + Math.floor(tier / 3));
  for (let i = 0; i < counts.lakes; i++) {
    paintEllipse(
      g,
      rng,
      6 + rng.next() * (w - 12),
      h * rng.range(0.3, 0.65),
      rng.range(2, 4),
      rng.range(1.5, 3),
      Tile.Deep,
    );
  }
  clearBorder(g, 2);

  // the player's bunker near the south shore, the CPU compound near the north (rule 2, rule 3)
  const bunker = findSite(g, rng, [h - 12, h - 8], 3, w / 2 + rng.range(-w / 5, w / 5));
  g.rect(bunker[0] - 2, bunker[1] - 2, bunker[0] + 2, bunker[1] + 2, Tile.Grass);
  const cw = 7 + 2 * rng.int(3);
  const ch = 5 + rng.int(2);
  const site = findSite(
    g,
    rng,
    [5, Math.round(h * 0.3)],
    Math.ceil(cw / 2) + 1,
    w / 2 + rng.range(-w / 4, w / 4),
  );
  const main = compound(g, site[0], site[1], cw, ch);
  const compounds = [main];
  if (tier >= 5 && layout === 'islands') {
    const side = site[0] < w / 2 ? w * 0.78 : w * 0.22;
    const s2 = findSite(g, rng, [5, Math.round(h * 0.4)], 4, side);
    if (near(s2, site) > 10) compounds.push(compound(g, s2[0], s2[1], 7, 5));
  }

  // roads from the bunker to each gate, bridging water on the way (rule 7)
  const routes = compounds.map((cp) => path(g, bunker, cp.gate, layout === 'chessboard' ? 3 : 12));
  for (const route of routes) road(g, route, bridges);
  beaches(g);

  const onRoute = routeMargin(g, routes);
  forests(
    g,
    rng,
    spec.theme === 'desert' || spec.theme === 'western' ? 3 : spec.theme === 'city' ? 4 : 6 + rng.int(4),
    (c, r) =>
      onRoute.has(r * w + c) ||
      near([c, r], bunker) < 4 ||
      compounds.some((cp) => cp.interior.some((i) => near(i, [c, r]) < 2)),
  );

  const place = new Placer(g, rng);
  // structures are solid: one beside the road, with water or another across it, would close the way
  for (const k of onRoute) place.reserve(k % w, Math.floor(k / w));
  for (const [c, r] of compounds.flatMap((cp) => cp.entry)) place.reserve(c, r);
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) place.reserve(bunker[0] + dc, bunker[1] + dr);
  place.place(bunker[0], bunker[1], { id: 'p1-bunker', type: 'bunker', team: 'P1', rot: 0 });

  placeDepots(g, place, routes[0] ?? [], bunker, counts.depots, 'P1');
  placeTargets(g, place, bunker, spec.targets ?? 0, spec.theme);

  // flag towers: most inside the compounds, the rest out in the north where a land vehicle can get
  const towerIds: string[] = [];
  const drivable = landReach(g, bunker);
  const inside = compounds.flatMap((cp) => cp.interior);
  for (let i = 0; i < counts.towers; i++) {
    const id = `cpu-tower-${i + 1}`;
    const spot =
      i < Math.ceil(counts.towers * 0.7)
        ? place.placeAny(inside, { id, type: 'flagTower', team: 'CPU' })
        : place.placeAny(
            cellsWhere(g, (c, r) => r < h * 0.5 && near([c, r], bunker) > h * 0.4 && drivable.has(r * w + c)),
            { id, type: 'flagTower', team: 'CPU' },
          );
    if (spot) towerIds.push(id);
  }
  place.placeAny(inside, { id: 'cpu-barracks', type: 'building', team: 'CPU', variant: 'barracks' });

  // turrets guard the gates, the bridges and the approaches, never the bunker itself
  const guardSpots = cellsWhere(g, (c, r) => {
    if (near([c, r], bunker) < 10) return false;
    const byGate = compounds.some((cp) => near(cp.gate, [c, r]) < 5);
    const byBridge = NEIGHBOURS.some(([dc, dr]) => g.get(c + dc * 2, r + dr * 2) === Tile.Bridge);
    return byGate || byBridge || r < h * 0.45;
  });
  for (let i = 0; i < counts.turrets; i++) {
    const variant = rng.next() < counts.missileShare ? 'missile' : 'gun';
    place.placeAny(guardSpots, {
      id: `cpu-turret-${i + 1}`,
      type: 'turret',
      team: 'CPU',
      variant,
      rot: Math.PI,
    });
  }
  for (let i = 0; i < counts.drones; i++) {
    place.placeAny(
      cellsWhere(g, (_c, r) => r < h * 0.4),
      { id: `cpu-drones-${i + 1}`, type: 'droneSpawn', team: 'CPU' },
      0,
    );
  }
  placeTown(g, rng, place, routes[0] ?? [], bunker, spec.theme);

  const inset = spec.boundsInset ?? 0;
  return {
    id: spec.id,
    name: spec.name,
    mode: spec.mode,
    players: 1,
    tier: spec.mode === 'tournament' ? tier : undefined,
    theme: spec.theme,
    tiles: g.rows(),
    entities: place.entities,
    stock: { P1: spec.stock ?? tierStock(tier) },
    flagCandidates: { CPU: towerIds },
    bounds: { x: inset, y: inset, w: w - 2 * inset, h: h - 2 * inset },
  };
}

function definedOnly(spec: GenSpec) {
  const out: Partial<ReturnType<typeof tierCounts>> = {};
  for (const k of ['towers', 'turrets', 'drones', 'depots', 'lakes'] as const) {
    const v = spec[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Depots by the road, the first ones close to home (rule 5). */
function placeDepots(
  g: Grid,
  place: Placer,
  route: [number, number][],
  home: [number, number],
  count: number,
  team: Team,
): void {
  // by the road, a tile clear of it, as the cells next to the road are kept open
  const beside = route.flatMap(([c, r]) =>
    NEIGHBOURS.map(([dc, dr]) => [c + 2 * dc, r + 2 * dr] as [number, number]),
  );
  for (let i = 0; i < count; i++) {
    const type: EntityType = i % 2 === 0 ? 'fuelDepot' : 'ammoTent';
    // the first pair near the bunker, later ones further up the road
    const lo = i < 2 ? 2 : 6 + i * 3;
    const hi = i < 2 ? 7 : 12 + i * 4;
    const e = { id: `${team.toLowerCase()}-${type}-${i + 1}`, type, team };
    const inRange = (p: [number, number]) => near(p, home) >= lo && near(p, home) <= hi;
    // beside the road if there is room, otherwise on open ground the same distance from home
    if (!place.placeAny(beside.filter(inRange), e))
      place.placeAny(
        cellsWhere(g, (c, r) => inRange([c, r])),
        e,
      );
  }
}

/** Neutral buildings round the bunker, for the turret lesson. */
function placeTargets(
  g: Grid,
  place: Placer,
  home: [number, number],
  count: number,
  theme: Level['theme'],
): void {
  const ring = cellsWhere(g, (c, r) => near([c, r], home) >= 3 && near([c, r], home) <= 6);
  const variant = TOWN_LOOK[theme]?.house ?? 'house';
  for (let i = 0; i < count; i++)
    place.placeAny(ring, { id: `target-${i + 1}`, type: 'building', team: 'NEUTRAL', variant });
}

/** A neutral village somewhere along the road. */
function placeTown(
  g: Grid,
  rng: Rng,
  place: Placer,
  route: [number, number][],
  home: [number, number],
  theme: Level['theme'],
): void {
  const middle = route[Math.floor(route.length * rng.range(0.3, 0.6))];
  if (!middle) return;
  const spots = cellsWhere(g, (c, r) => near([c, r], middle) < 4 && near([c, r], home) > 5);
  // a city is built up more than a village
  const houses = 2 + rng.int(3) + (theme === 'city' ? 4 : 0);
  const look = TOWN_LOOK[theme];
  for (let i = 0; i < houses; i++) {
    const variant = rng.next() < 0.2 ? (look?.hangar ?? 'hangar') : (look?.house ?? 'house');
    place.placeAny(spots, { id: `town-${i + 1}`, type: 'building', team: 'NEUTRAL', variant });
  }
}

/** The village buildings of the themes that have their own, in place of the house and the hangar. */
const TOWN_LOOK: Partial<Record<Level['theme'], { house: string; hangar: string }>> = {
  city: { house: 'tower', hangar: 'house' },
  western: { house: 'saloon', hangar: 'house' },
  alien: { house: 'pod', hangar: 'hangar' },
};

// --- two-player maps (SPEC §10.2: symmetric) ---

export function generateDuel(spec: GenSpec): Level {
  for (let attempt = 0; attempt < 25; attempt++) {
    const level = buildDuel(spec, spec.seed + attempt * 7919);
    if (!validateLevel(level).length) return level;
  }
  throw new Error(`could not generate a valid ${spec.id}`);
}

function buildDuel(spec: GenSpec, seed: number): Level {
  const rng = new Rng(seed);
  const tier = spec.tier;
  const counts = { ...tierCounts(tier), ...definedOnly(spec) };
  const w = spec.size?.w ?? 44 + 2 * rng.int(4);
  const hh = spec.size ? spec.size.h / 2 : 18 + rng.int(4);
  const channel = 2 + rng.int(3);
  const g = new Grid(w, hh);

  // the southern island, below a channel that runs along the middle of the full map
  const layout = spec.layout ?? 'islands';
  landMass(g, rng, layout === 'atoll' ? 'islands' : layout, [channel + 1, hh - 3]);
  g.rect(0, 0, w - 1, channel - 1, Tile.Deep);
  for (let c = 0; c < w; c++) for (let r = hh - 2; r < hh; r++) g.set(c, r, Tile.Deep);
  for (let r = 0; r < hh; r++) for (const c of [0, 1, w - 2, w - 1]) g.set(c, r, Tile.Deep);
  // an islet in mid-channel, half of it ours
  if (channel >= 3) g.rect(Math.floor(w / 2) - 3, 0, Math.ceil(w / 2) + 2, 0, Tile.Grass);

  const bunker = findSite(g, rng, [hh - 7, hh - 5], 2, w / 2 + rng.range(-w / 6, w / 6));
  g.rect(bunker[0] - 2, bunker[1] - 2, bunker[0] + 2, bunker[1] + 2, Tile.Grass);
  // the compound's south wall stays a row clear of the bunker's apron, so vehicles come up with room
  const site = findSite(g, rng, [channel + 4, hh - 11], 5, bunker[0] < w / 2 ? w * 0.7 : w * 0.3);
  const cp = compound(g, site[0], site[1], 9, 5);

  // bridges cross the channel in mirrored pairs, so each span joins up with the north half
  const bridgeC = 6 + rng.int(Math.floor(w / 2) - 10);
  const heads: [number, number][] = [
    [bridgeC, channel],
    [w - 1 - bridgeC, channel],
  ];
  for (const [c] of heads) {
    g.rect(c - 1, 0, c + 1, channel - 1, Tile.Bridge);
    g.rect(c - 1, channel, c + 1, channel, Tile.Grass);
  }
  const routes = [...heads.map((hd) => path(g, bunker, hd, 30)), path(g, bunker, cp.gate, 30)];
  for (const route of routes) road(g, route, true);
  beaches(g);
  const onRoute = routeMargin(g, routes);
  forests(
    g,
    rng,
    3 + rng.int(3),
    (c, r) => onRoute.has(r * w + c) || near([c, r], bunker) < 4 || r <= channel,
  );

  // the half's rows are the southern rows of the full map, so place with the full height
  const full = new Grid(w, hh * 2);
  for (let r = 0; r < hh; r++) for (let c = 0; c < w; c++) full.set(c, hh + r, g.get(c, r));
  const place = new Placer(full, rng);
  const at = (p: [number, number]): [number, number] => [p[0], p[1] + hh];
  for (const k of onRoute) place.reserve(k % w, Math.floor(k / w) + hh);
  for (const [c, r] of cp.entry) place.reserve(c, r + hh);
  place.place(...at(bunker), { id: 'p1-bunker', type: 'bunker', team: 'P1', rot: 0 });
  placeDepots(full, place, (routes[2] ?? []).map(at), at(bunker), counts.depots, 'P1');

  const towers: string[] = [];
  const total = Math.max(3, Math.min(6, counts.towers));
  const drivable = landReach(full, at(bunker));
  for (let i = 0; i < total; i++) {
    const id = `p1-tower-${i + 1}`;
    const spot =
      i < 2
        ? place.placeAny(cp.interior.map(at), { id, type: 'flagTower', team: 'P1' })
        : place.placeAny(
            cellsWhere(
              full,
              (c, r) => r > hh + channel + 1 && near([c, r], at(bunker)) > 6 && drivable.has(r * w + c),
            ),
            { id, type: 'flagTower', team: 'P1' },
          );
    if (spot) towers.push(id);
  }
  const guard = cellsWhere(
    full,
    (c, r) =>
      r > hh + channel && near([c, r], at(bunker)) > 4 && heads.some((hd) => near(at(hd), [c, r]) < 5),
  );
  for (let i = 0; i < Math.max(2, Math.round(counts.turrets / 2)); i++) {
    const variant = i === 0 ? 'missile' : 'gun';
    place.placeAny(i < 2 ? guard : cp.interior.map(at), {
      id: `p1-turret-${i + 1}`,
      type: 'turret',
      team: 'P1',
      variant,
      rot: 0,
    });
  }
  placeTown(full, rng, place, (routes[0] ?? []).map(at), at(bunker), spec.theme);

  const half = {
    id: spec.id,
    name: spec.name,
    mode: spec.mode,
    theme: spec.theme,
    tiles: g.rows(),
    entities: place.entities,
    stock: { P1: spec.stock ?? tierStock(tier) },
    flagCandidates: { P1: towers },
    bounds: { x: 0, y: 0, w, h: hh * 2 },
  };
  return mirrorLevel(half);
}

/** Can a mobility class get from one cell to another over the grid's terrain? For tests. */
export function connected(level: Level, from: LevelEntity, to: LevelEntity, mobility: Mobility): boolean {
  const h = level.tiles.length;
  const seen = new Set<string>();
  const queue: [number, number][] = [[Math.floor(from.x), Math.floor(from.y)]];
  const goal = [Math.floor(to.x), Math.floor(to.y)];
  const tile = (x: number, y: number) => (level.tiles[h - 1 - y]?.[x] ?? Tile.Deep) as TileChar;
  while (queue.length) {
    const [x, y] = queue.shift() as [number, number];
    if (Math.abs(x - (goal[0] as number)) + Math.abs(y - (goal[1] as number)) <= 1) return true;
    for (const [dx, dy] of NEIGHBOURS) {
      const k = `${x + dx},${y + dy}`;
      if (seen.has(k) || !passable(tile(x + dx, y + dy), mobility)) continue;
      seen.add(k);
      queue.push([x + dx, y + dy]);
    }
  }
  return false;
}
