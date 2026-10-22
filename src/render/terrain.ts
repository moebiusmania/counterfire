// Draws the sim's terrain grid: ground mesh, sea, forests, walls and bridges.
// Sim (x, y) maps to 3D (x, height, -y): north is -Z, matching LittleJS's forward.

import {
  buildGrid,
  EngineObject3D,
  InstancedMesh3D,
  type Mesh,
  render3D,
  rgb,
  type Vector3,
  vec2,
  vec3,
} from 'littlejsengine';
import { type Terrain, Tile, type TileChar } from '../sim/terrain';
import { buildBridgeDeck, buildBridgeRail, buildWallBlock } from './models';
import type { Theme } from './themes';

export function toWorld(x: number, y: number, height = 0): Vector3 {
  return vec3(x, height, -y);
}

export const SEA_LEVEL = -0.1;

function tileHeight(tile: TileChar): number {
  switch (tile) {
    case Tile.Deep:
    case Tile.Bridge:
      return -0.6;
    case Tile.Shallow:
      return -0.18;
    default:
      return 0;
  }
}

/** Stable per-cell noise in [0, 1), so the ground and trees vary without touching the sim's RNG. */
function cellNoise(x: number, y: number, salt = 0): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + salt * 2147483647, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Neighbour offsets and the yaw that turns a rail's -Z edge toward each: north, east, south, west. */
const RAIL_SIDES = [
  [0, 1, 0],
  [1, 0, -Math.PI / 2],
  [0, -1, Math.PI],
  [-1, 0, Math.PI / 2],
] as const;

export class TerrainView {
  private ground?: EngineObject3D;
  private sets: InstancedMesh3D[] = [];
  private version = -1;
  private readonly treeMesh: Mesh;
  private readonly wallMesh = buildWallBlock();
  private readonly bridgeMesh = buildBridgeDeck();
  private readonly railMesh = buildBridgeRail();

  constructor(
    private readonly terrain: Terrain,
    private readonly theme: Theme,
  ) {
    this.treeMesh = theme.tree();
    const sea = new EngineObject3D(
      toWorld(terrain.w / 2, terrain.h / 2, SEA_LEVEL),
      render3D.planeMesh,
      undefined,
      theme.sea,
    );
    sea.scale3D = vec3(terrain.w * 4, 1, terrain.h * 4);
    sea.transparent = true;
    sea.specular = 0.6;
    sea.shininess = 60;
    sea.castShadow = false;
    this.sync();
  }

  /** Rebuild whatever the sim changed since the last call. */
  sync(): void {
    if (this.version === this.terrain.version) return;
    this.version = this.terrain.version;
    this.buildGround();
    this.buildProps();
  }

  private buildGround(): void {
    const { w, h } = this.terrain;
    const t = this.terrain;
    // grid local coords: x in [-w/2, w/2], z in [-h/2, h/2]; tile x = lx + w/2, tile y = h/2 - lz
    const color = (lx: number, lz: number) => {
      const tx = Math.floor(lx + w / 2);
      const ty = Math.floor(h / 2 - lz);
      const base = this.theme.tiles[t.get(tx, ty)];
      const n = 0.94 + cellNoise(tx, ty) * 0.1;
      return rgb(base.r * n, base.g * n, base.b * n);
    };
    const height = (lx: number, lz: number) => {
      const gx = Math.round(lx + w / 2);
      const gy = Math.round(h / 2 - lz);
      return Math.min(
        tileHeight(t.get(gx - 1, gy - 1)),
        tileHeight(t.get(gx, gy - 1)),
        tileHeight(t.get(gx - 1, gy)),
        tileHeight(t.get(gx, gy)),
      );
    };
    const mesh = buildGrid(vec2(w, h), vec2(w, h), color, height);
    mesh.doubleSided = false;
    if (this.ground) this.ground.setMesh(mesh);
    else this.ground = new EngineObject3D(toWorld(w / 2, h / 2), mesh);
  }

  private buildProps(): void {
    for (const set of this.sets) set.destroy();
    this.sets = [];
    const cells: Record<'trees' | 'walls' | 'bridges' | 'rails', [number, number, number][]> = {
      trees: [],
      walls: [],
      bridges: [],
      rails: [],
    };
    for (let y = 0; y < this.terrain.h; y++) {
      for (let x = 0; x < this.terrain.w; x++) {
        const tile = this.terrain.get(x, y);
        if (tile === Tile.Forest) cells.trees.push([x, y, 0]);
        else if (tile === Tile.Wall) cells.walls.push([x, y, 0]);
        else if (tile === Tile.Bridge) {
          cells.bridges.push([x, y, 0]);
          // a rail along each edge over open water: north, east, south, west
          RAIL_SIDES.forEach(([dx, dy, yaw]) => {
            if (this.terrain.get(x + dx, y + dy) === Tile.Deep) cells.rails.push([x, y, yaw]);
          });
        }
      }
    }
    this.addSet(this.treeMesh, cells.trees, (x, y) => [
      toWorld(x + 0.3 + cellNoise(x, y, 1) * 0.4, y + 0.3 + cellNoise(x, y, 2) * 0.4),
      vec3(0, cellNoise(x, y, 3) * Math.PI * 2, 0),
      vec3(0.85 + cellNoise(x, y, 4) * 0.35),
    ]);
    this.addSet(this.wallMesh, cells.walls, (x, y) => [toWorld(x + 0.5, y + 0.5), vec3(), vec3(1)]);
    this.addSet(this.bridgeMesh, cells.bridges, (x, y) => [toWorld(x + 0.5, y + 0.5), vec3(), vec3(1)]);
    this.addSet(this.railMesh, cells.rails, (x, y, yaw) => [
      toWorld(x + 0.5, y + 0.5),
      vec3(0, yaw, 0),
      vec3(1),
    ]);
  }

  private addSet(
    mesh: Mesh,
    cells: [number, number, number][],
    place: (x: number, y: number, yaw: number) => [Vector3, Vector3, Vector3],
  ): void {
    if (!cells.length) return;
    const set = new InstancedMesh3D(mesh, cells.length);
    cells.forEach(([x, y, yaw], i) => {
      set.setTransformAt(i, ...place(x, y, yaw));
    });
    this.sets.push(set);
  }
}
