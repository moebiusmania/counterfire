// The deterministic simulation (SPEC §3.1, §4). No rendering, no DOM, no Math.random().

import type { Level, LevelEntity } from '../levels/schema';
import { Rng } from './rng';
import { blocksShots, Terrain, Tile } from './terrain';
import type { ShotKind, ShotTuning } from './tuning';
import { EMPTY_INPUT, type InputFrame, type PlayerId, type VehicleType } from './types';
import { updateTank } from './vehicles/tank';
import { Vehicle } from './vehicles/vehicle';

export const TICK_RATE = 60;

export interface Shot {
  id: number;
  kind: ShotKind;
  owner: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  dx: number;
  dy: number;
  travelled: number;
  range: number;
  damage: number;
  alive: boolean;
}

/** Things that happened this tick, for sound and effects. Cleared at the start of every tick. */
export type SimEvent =
  | { type: 'shot'; kind: ShotKind; x: number; y: number }
  | { type: 'explosion'; x: number; y: number; size: number }
  | { type: 'treeDestroyed'; x: number; y: number }
  | { type: 'vehicleHit'; vehicle: number; damage: number }
  | { type: 'vehicleDestroyed'; vehicle: number; x: number; y: number }
  | { type: 'outOfFuel'; vehicle: number }
  | { type: 'driverBailed'; vehicle: number; x: number; y: number }
  | { type: 'dryFire'; vehicle: number };

export interface PlayerState {
  id: PlayerId;
  bunker: LevelEntity;
  /** The vehicle in the field, if any. */
  vehicle?: Vehicle;
}

export class World {
  readonly rng: Rng;
  readonly terrain: Terrain;
  readonly players = new Map<PlayerId, PlayerState>();
  readonly vehicles: Vehicle[] = [];
  readonly shots: Shot[] = [];
  events: SimEvent[] = [];
  tick = 0;
  private nextId = 1;

  constructor(
    readonly level: Level,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    this.terrain = new Terrain(level.tiles);
    const ids: PlayerId[] = level.players === 1 ? ['P1'] : ['P1', 'P2'];
    for (const id of ids) {
      const bunker = level.entities.find((e) => e.type === 'bunker' && e.team === id);
      if (!bunker) throw new Error(`level ${level.id}: ${id} has no bunker`);
      this.players.set(id, { id, bunker });
    }
  }

  emit(event: SimEvent): void {
    this.events.push(event);
  }

  /** Put a new vehicle on the player's bunker. Bunker selection and stock arrive in milestone 2. */
  spawnVehicle(player: PlayerId, type: VehicleType): Vehicle {
    const p = this.players.get(player);
    if (!p) throw new Error(`no player ${player}`);
    const v = new Vehicle(this.nextId++, type, player, p.bunker.x, p.bunker.y, p.bunker.rot ?? 0);
    this.vehicles.push(v);
    p.vehicle = v;
    return v;
  }

  spawnShot(kind: ShotKind, owner: number, x: number, y: number, angle: number, t: ShotTuning): Shot {
    const shot: Shot = {
      id: this.nextId++,
      kind,
      owner,
      x,
      y,
      prevX: x,
      prevY: y,
      dx: -Math.sin(angle) * t.speed,
      dy: Math.cos(angle) * t.speed,
      travelled: 0,
      range: t.range,
      damage: t.damage,
      alive: true,
    };
    this.shots.push(shot);
    this.emit({ type: 'shot', kind, x, y });
    return shot;
  }

  /** Advance one fixed tick. */
  step(inputs: Partial<Record<PlayerId, InputFrame>> = {}): void {
    this.events = [];
    this.tick++;

    for (const v of this.vehicles) v.savePrev();
    for (const p of this.players.values()) {
      const v = p.vehicle;
      if (v?.state !== 'active') continue;
      const input = inputs[p.id] ?? EMPTY_INPUT;
      switch (v.type) {
        case 'tank':
          updateTank(v, input, this);
          break;
        default:
          // asv, heli and jeep arrive in milestone 2
          break;
      }
    }

    this.updateShots();
    for (let i = this.shots.length; i--; ) if (!this.shots[i]?.alive) this.shots.splice(i, 1);
  }

  private updateShots(): void {
    // two sub-steps keep fast shells from skipping over a tile corner or a vehicle
    const SUBSTEPS = 2;
    for (const s of this.shots) {
      s.prevX = s.x;
      s.prevY = s.y;
      for (let k = 0; k < SUBSTEPS && s.alive; k++) {
        s.x += s.dx / SUBSTEPS;
        s.y += s.dy / SUBSTEPS;
        s.travelled += Math.hypot(s.dx, s.dy) / SUBSTEPS;
        this.collideShot(s);
      }
    }
  }

  private collideShot(s: Shot): void {
    for (const v of this.vehicles) {
      if (v.id === s.owner || !v.alive || v.mobility === 'air') continue;
      const r = v.tuning.radius;
      if ((v.x - s.x) ** 2 + (v.y - s.y) ** 2 < r * r) {
        this.damageVehicle(v, s.damage);
        this.explodeShot(s, 0.6);
        return;
      }
    }

    const tx = Math.floor(s.x);
    const ty = Math.floor(s.y);
    const tile = this.terrain.get(tx, ty);
    if (blocksShots(tile)) {
      if (tile === Tile.Forest) {
        this.terrain.set(tx, ty, Tile.Grass);
        this.emit({ type: 'treeDestroyed', x: tx + 0.5, y: ty + 0.5 });
      }
      this.explodeShot(s, 0.6);
      return;
    }
    if (s.travelled >= s.range) this.explodeShot(s, 0.4);
  }

  private explodeShot(s: Shot, size: number): void {
    s.alive = false;
    this.emit({ type: 'explosion', x: s.x, y: s.y, size });
  }

  damageVehicle(v: Vehicle, damage: number): void {
    if (!v.alive) return;
    v.hp -= damage;
    this.emit({ type: 'vehicleHit', vehicle: v.id, damage });
    if (v.hp <= 0) {
      v.hp = 0;
      v.state = 'destroyed';
      v.speed = 0;
      this.emit({ type: 'vehicleDestroyed', vehicle: v.id, x: v.x, y: v.y });
      this.emit({ type: 'explosion', x: v.x, y: v.y, size: 1.6 });
    }
  }

  /** Hash of the whole sim state, for replay tests (SPEC §14.1). */
  hash(): string {
    const h = new Hasher();
    h.num(this.tick).num(this.rng.seed).num(this.terrain.version);
    for (const row of this.terrain.toRows()) h.str(row);
    for (const v of this.vehicles) {
      h.num(v.id).str(v.state).num(v.x).num(v.y).num(v.heading).num(v.turret).num(v.speed);
      h.num(v.hp).num(v.fuel).num(v.ammo).num(v.cooldown);
    }
    for (const s of this.shots) h.num(s.id).num(s.x).num(s.y).num(s.travelled);
    return h.digest();
  }
}

/** FNV-1a over exact float bits, so any divergence shows up. */
class Hasher {
  private h = 0x811c9dc5;
  private readonly f64 = new Float64Array(1);
  private readonly bytes = new Uint8Array(this.f64.buffer);

  num(n: number): this {
    this.f64[0] = n;
    for (const b of this.bytes) this.byte(b);
    return this;
  }

  str(s: string): this {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i) & 0xff);
    return this;
  }

  private byte(b: number): void {
    this.h ^= b;
    this.h = Math.imul(this.h, 0x01000193) >>> 0;
  }

  digest(): string {
    return this.h.toString(16).padStart(8, '0');
  }
}
