// The deterministic simulation (SPEC §3.1, §4). No rendering, no DOM, no Math.random().

import type { Level, LevelEntity, Stock } from '../levels/schema';
import { Rng } from './rng';
import { blocksShots, Terrain, Tile } from './terrain';
import { BUNKER, DEPOT, MINES, type ShotKind, type ShotTuning } from './tuning';
import { EMPTY_INPUT, type InputFrame, type PlayerId, type VehicleType } from './types';
import { updateAsv } from './vehicles/asv';
import { updateHeli } from './vehicles/heli';
import { updateJeep } from './vehicles/jeep';
import { updateTank } from './vehicles/tank';
import { Vehicle } from './vehicles/vehicle';

export const TICK_RATE = 60;

/** The bunker's four slots, left to right (SPEC §9.2). */
export const VEHICLE_ORDER: readonly VehicleType[] = ['tank', 'asv', 'heli', 'jeep'];

/** Destroyed vehicles burn this long before the wreck is cleared. */
const WRECK_TICKS = 180;

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
  tuning: ShotTuning;
  alive: boolean;
}

export interface Mine {
  id: number;
  team: PlayerId;
  x: number;
  y: number;
}

/** Things that happened this tick, for sound and effects. Cleared at the start of every tick. */
export type SimEvent =
  | { type: 'shot'; kind: ShotKind; x: number; y: number }
  | { type: 'explosion'; x: number; y: number; size: number }
  | { type: 'treeDestroyed'; x: number; y: number }
  | { type: 'bridgeDestroyed'; x: number; y: number }
  | { type: 'vehicleHit'; vehicle: number; damage: number }
  | { type: 'vehicleDestroyed'; vehicle: number; x: number; y: number }
  | { type: 'sank'; vehicle: number; x: number; y: number }
  | { type: 'heliCrash'; vehicle: number; x: number; y: number }
  | { type: 'outOfFuel'; vehicle: number }
  | { type: 'driverBailed'; vehicle: number; x: number; y: number }
  | { type: 'dryFire'; vehicle: number }
  | { type: 'weaponSwitched'; vehicle: number; weapon: 'gun' | 'rockets' }
  | { type: 'tyres'; vehicle: number; inflated: boolean }
  | { type: 'mineLaid'; mine: number; x: number; y: number }
  | { type: 'mineExploded'; mine: number; x: number; y: number }
  | { type: 'resupply'; vehicle: number; depot: 'fuelDepot' | 'ammoTent' }
  | { type: 'bunkerLight'; vehicle: number; on: boolean }
  | { type: 'selectSlot'; player: PlayerId; slot: number }
  | { type: 'stockEmpty'; player: PlayerId; vehicleType: VehicleType }
  | { type: 'deploy'; player: PlayerId; vehicle: number }
  | { type: 'returned'; player: PlayerId; vehicleType: VehicleType }
  | { type: 'selfDestruct'; vehicle: number };

export type PlayerMode = 'bunker' | 'field';

export interface PlayerState {
  id: PlayerId;
  bunker: LevelEntity;
  stock: Stock;
  mode: PlayerMode;
  /** Highlighted bunker slot, an index into VEHICLE_ORDER. */
  selected: number;
  /** The vehicle in the field, if any. */
  vehicle?: Vehicle;
  /** Ticks left before a player who lost a vehicle is back in the bunker. */
  lostTimer: number;
  prevInput: InputFrame;
}

function pressedSince(now: InputFrame, before: InputFrame): InputFrame {
  const out = { ...now };
  for (const k of Object.keys(now) as (keyof InputFrame)[]) out[k] = now[k] && !before[k];
  return out;
}

export class World {
  readonly rng: Rng;
  readonly terrain: Terrain;
  readonly players = new Map<PlayerId, PlayerState>();
  readonly vehicles: Vehicle[] = [];
  readonly shots: Shot[] = [];
  readonly mines: Mine[] = [];
  events: SimEvent[] = [];
  tick = 0;
  private nextId = 1;
  private readonly depots: LevelEntity[];

  constructor(
    readonly level: Level,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    this.terrain = new Terrain(level.tiles);
    this.depots = level.entities.filter((e) => e.type === 'fuelDepot' || e.type === 'ammoTent');
    const ids: PlayerId[] = level.players === 1 ? ['P1'] : ['P1', 'P2'];
    for (const id of ids) {
      const bunker = level.entities.find((e) => e.type === 'bunker' && e.team === id);
      if (!bunker) throw new Error(`level ${level.id}: ${id} has no bunker`);
      const stock = { tank: 0, asv: 0, heli: 0, jeep: 0, ...level.stock[id] };
      this.players.set(id, {
        id,
        bunker,
        stock,
        mode: 'bunker',
        selected: 0,
        lostTimer: 0,
        prevInput: EMPTY_INPUT,
      });
    }
  }

  /** ASV mines are a two-player feature (SPEC §6.2). */
  get minesAllowed(): boolean {
    return this.level.players !== 1;
  }

  emit(event: SimEvent): void {
    this.events.push(event);
  }

  player(id: PlayerId): PlayerState {
    const p = this.players.get(id);
    if (!p) throw new Error(`no player ${id}`);
    return p;
  }

  /** Put a vehicle straight onto the bunker pad, ready to drive. Tests and tools only: no stock, no elevator. */
  spawnVehicle(player: PlayerId, type: VehicleType): Vehicle {
    const p = this.player(player);
    const v = new Vehicle(this.nextId++, type, player, p.bunker.x, p.bunker.y, p.bunker.rot ?? 0);
    if (type === 'heli') v.altitude = 1;
    this.vehicles.push(v);
    p.vehicle = v;
    p.mode = 'field';
    return v;
  }

  spawnShot(kind: ShotKind, owner: number, x: number, y: number, angle: number, tuning: ShotTuning): Shot {
    const shot: Shot = {
      id: this.nextId++,
      kind,
      owner,
      x,
      y,
      prevX: x,
      prevY: y,
      dx: -Math.sin(angle) * tuning.speed,
      dy: Math.cos(angle) * tuning.speed,
      travelled: 0,
      tuning,
      alive: true,
    };
    this.shots.push(shot);
    this.emit({ type: 'shot', kind, x, y });
    return shot;
  }

  layMine(v: Vehicle, x: number, y: number): void {
    const mine: Mine = { id: this.nextId++, team: v.team, x, y };
    this.mines.push(mine);
    this.emit({ type: 'mineLaid', mine: mine.id, x, y });
  }

  /** Advance one fixed tick. */
  step(inputs: Partial<Record<PlayerId, InputFrame>> = {}): void {
    this.events = [];
    this.tick++;

    for (const v of this.vehicles) v.savePrev();
    for (const p of this.players.values()) {
      const input = inputs[p.id] ?? EMPTY_INPUT;
      const pressed = pressedSince(input, p.prevInput);
      p.prevInput = input;
      if (p.mode === 'bunker') this.updateBunker(p, pressed);
      else this.updateField(p, input, pressed);
    }

    this.updateBunkerLights();
    this.updateDepots();
    this.updateShots();
    this.separateVehicles();
    this.updateMines();
    this.sinkVehicles();
    this.clearWrecks();
    for (let i = this.shots.length; i--; ) if (!this.shots[i]?.alive) this.shots.splice(i, 1);
  }

  // --- bunker (SPEC §6, §9.2) ---

  private updateBunker(p: PlayerState, pressed: InputFrame): void {
    const slots = VEHICLE_ORDER.length;
    if (pressed.left || pressed.right) {
      p.selected = (p.selected + (pressed.right ? 1 : slots - 1)) % slots;
      this.emit({ type: 'selectSlot', player: p.id, slot: p.selected });
    }
    if (pressed.fireGround) this.deploy(p);
  }

  /** Take the selected vehicle out of stock and send it up the elevator. */
  deploy(p: PlayerState): Vehicle | undefined {
    const type = VEHICLE_ORDER[p.selected] as VehicleType;
    if (p.stock[type] <= 0) {
      this.emit({ type: 'stockEmpty', player: p.id, vehicleType: type });
      return undefined;
    }
    p.stock[type]--;
    const v = new Vehicle(this.nextId++, type, p.id, p.bunker.x, p.bunker.y, p.bunker.rot ?? 0);
    v.elevator = 1;
    v.elevatorDir = -1;
    this.vehicles.push(v);
    p.vehicle = v;
    p.mode = 'field';
    this.emit({ type: 'deploy', player: p.id, vehicle: v.id });
    return v;
  }

  private updateField(p: PlayerState, input: InputFrame, pressed: InputFrame): void {
    const v = p.vehicle;
    if (v?.state !== 'active') {
      // lost: wait for the skull, then back to the bunker
      if (--p.lostTimer <= 0) {
        p.mode = 'bunker';
        p.vehicle = undefined;
      }
      return;
    }
    if (v.elevatorDir !== 0) {
      this.updateElevator(p, v);
      return;
    }
    // all three fire keys at once: self-destruct (SPEC §6)
    if (input.fireGround && input.fireAir && input.switch) {
      this.emit({ type: 'selfDestruct', vehicle: v.id });
      this.destroyVehicle(v);
      return;
    }
    if (v.onBunker && (pressed.fireGround || pressed.fireAir)) {
      v.elevatorDir = 1;
      v.speed = 0;
      return;
    }
    switch (v.type) {
      case 'tank':
        updateTank(v, input, this);
        break;
      case 'asv':
        updateAsv(v, input, pressed, this);
        break;
      case 'heli':
        updateHeli(v, input, pressed, this);
        break;
      case 'jeep':
        updateJeep(v, input, pressed, this);
        break;
    }
  }

  private updateElevator(p: PlayerState, v: Vehicle): void {
    const rate = 1 / BUNKER.elevatorTicks;
    if (v.elevatorDir < 0) {
      v.elevator = Math.max(0, v.elevator - rate);
      if (v.elevator === 0) v.elevatorDir = 0;
      return;
    }
    // going down: a helicopter lands first, then everything centres on the hatch and sinks
    if (v.altitude > 0) {
      v.altitude = Math.max(0, v.altitude - 1 / 30);
      return;
    }
    v.x += (p.bunker.x - v.x) * 0.2;
    v.y += (p.bunker.y - v.y) * 0.2;
    v.elevator = Math.min(1, v.elevator + rate);
    if (v.elevator < 1) return;
    // in the bunker: repaired and back in stock (SPEC §6)
    this.removeVehicle(v);
    p.stock[v.type]++;
    p.vehicle = undefined;
    p.mode = 'bunker';
    this.emit({ type: 'returned', player: p.id, vehicleType: v.type });
  }

  private updateBunkerLights(): void {
    for (const p of this.players.values()) {
      const v = p.vehicle;
      if (!v) continue;
      const d = Math.hypot(v.x - p.bunker.x, v.y - p.bunker.y);
      if (d > BUNKER.radius * 1.5) v.leftBunker = true;
      const on = v.controllable && v.leftBunker && d < BUNKER.radius;
      if (on !== v.onBunker) this.emit({ type: 'bunkerLight', vehicle: v.id, on });
      v.onBunker = on;
    }
  }

  // --- depots (SPEC §6.5) ---

  private updateDepots(): void {
    for (const v of this.vehicles) {
      const was = v.resupplying;
      v.resupplying = false;
      // the helicopter can only refuel and rearm at its own base
      if (!v.controllable || v.type === 'heli' || Math.abs(v.speed) > DEPOT.maxParkSpeed) continue;
      for (const d of this.depots) {
        if (d.team && d.team !== v.team && d.team !== 'NEUTRAL') continue;
        if (Math.hypot(v.x - d.x, v.y - d.y) > DEPOT.radius) continue;
        const fuel = d.type === 'fuelDepot';
        const full = fuel ? v.fuel >= v.tuning.fuel : v.ammo >= v.tuning.ammo;
        if (full) continue;
        if (fuel) v.fuel = Math.min(v.tuning.fuel, v.fuel + DEPOT.fuelPerTick);
        else if (this.tick % DEPOT.ticksPerRound === 0) v.ammo++;
        v.resupplying = true;
        if (!was) this.emit({ type: 'resupply', vehicle: v.id, depot: fuel ? 'fuelDepot' : 'ammoTent' });
        break;
      }
    }
  }

  // --- shots ---

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
      // nothing can hit the helicopter yet: turrets and drones arrive in milestone 3
      if (v.id === s.owner || !v.alive || v.mobility === 'air' || v.elevator > 0.5) continue;
      const r = v.tuning.radius;
      if ((v.x - s.x) ** 2 + (v.y - s.y) ** 2 < r * r) {
        this.damageVehicle(v, s.tuning.damage);
        this.explodeShot(s, 0.6);
        return;
      }
    }

    const tx = Math.floor(s.x);
    const ty = Math.floor(s.y);
    if (!s.tuning.air && blocksShots(this.terrain.get(tx, ty))) {
      this.impact(s, tx, ty);
      this.explodeShot(s, 0.6);
      return;
    }
    if (s.travelled >= s.tuning.range) {
      if (s.tuning.air) this.impact(s, tx, ty);
      this.explodeShot(s, s.kind === 'heliGun' ? 0.15 : 0.4);
    }
  }

  /** What a shot does to the ground where it lands. */
  private impact(s: Shot, tx: number, ty: number): void {
    const tile = this.terrain.get(tx, ty);
    if (tile === Tile.Forest && s.tuning.clearsTrees) {
      this.terrain.set(tx, ty, Tile.Grass);
      this.emit({ type: 'treeDestroyed', x: tx + 0.5, y: ty + 0.5 });
    }
    if (tile === Tile.Bridge && s.tuning.destroysBridges) this.destroyBridge(tx, ty);
    if (s.tuning.destroysMines) {
      for (const m of [...this.mines]) if (Math.hypot(m.x - s.x, m.y - s.y) < 0.7) this.explodeMine(m);
    }
  }

  private explodeShot(s: Shot, size: number): void {
    s.alive = false;
    this.emit({ type: 'explosion', x: s.x, y: s.y, size });
  }

  private destroyBridge(tx: number, ty: number): void {
    this.terrain.set(tx, ty, Tile.Deep);
    this.emit({ type: 'bridgeDestroyed', x: tx + 0.5, y: ty + 0.5 });
  }

  // --- mines ---

  private updateMines(): void {
    for (const m of [...this.mines]) {
      const victim = this.vehicles.find(
        (v) =>
          v.alive &&
          v.mobility !== 'air' &&
          v.elevator === 0 &&
          Math.hypot(v.x - m.x, v.y - m.y) < MINES.triggerRadius + v.tuning.radius * 0.6,
      );
      if (!victim) continue;
      this.explodeMine(m);
      // a mine destroys any land vehicle instantly (SPEC §6.2)
      this.destroyVehicle(victim);
    }
  }

  private explodeMine(m: Mine): void {
    const i = this.mines.indexOf(m);
    if (i < 0) return;
    this.mines.splice(i, 1);
    this.emit({ type: 'mineExploded', mine: m.id, x: m.x, y: m.y });
    this.emit({ type: 'explosion', x: m.x, y: m.y, size: 1 });
    const tx = Math.floor(m.x);
    const ty = Math.floor(m.y);
    // a mine on a bridge takes the bridge with it (SPEC §6.2)
    if (this.terrain.get(tx, ty) === Tile.Bridge) this.destroyBridge(tx, ty);
  }

  // --- vehicles ---

  damageVehicle(v: Vehicle, damage: number): void {
    if (!v.alive) return;
    v.hp -= damage;
    this.emit({ type: 'vehicleHit', vehicle: v.id, damage });
    if (v.hp <= 0) this.destroyVehicle(v);
  }

  /** Out of fuel and stopped: the driver flees on foot and the vehicle stays where it is (SPEC §6). */
  abandonVehicle(v: Vehicle): void {
    if (v.state !== 'active') return;
    v.state = 'abandoned';
    v.onBunker = false;
    this.emit({ type: 'driverBailed', vehicle: v.id, x: v.x, y: v.y });
    for (const p of this.players.values()) if (p.vehicle === v) p.lostTimer = BUNKER.lostDelay;
  }

  destroyVehicle(v: Vehicle): void {
    if (!v.alive) return;
    v.hp = 0;
    v.state = 'destroyed';
    v.speed = 0;
    v.onBunker = false;
    this.emit({ type: 'vehicleDestroyed', vehicle: v.id, x: v.x, y: v.y });
    this.emit({ type: 'explosion', x: v.x, y: v.y, size: 1.6 });
    for (const p of this.players.values()) if (p.vehicle === v) p.lostTimer = BUNKER.lostDelay;
  }

  /** Land vehicles over deep water sink: a destroyed bridge, or a jeep with flat tyres. */
  private sinkVehicles(): void {
    for (const v of this.vehicles) {
      if (!v.alive || v.mobility !== 'ground' || v.elevator > 0) continue;
      if (this.terrain.at(v.x, v.y) !== Tile.Deep) continue;
      this.emit({ type: 'sank', vehicle: v.id, x: v.x, y: v.y });
      this.destroyVehicle(v);
    }
  }

  /** Push overlapping land vehicles apart, half each. */
  private separateVehicles(): void {
    const solid = this.vehicles.filter((v) => v.mobility !== 'air' && v.elevator === 0 && v.wreckTicks < 30);
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i] as Vehicle;
        const b = solid[j] as Vehicle;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const overlap = a.tuning.radius + b.tuning.radius - d;
        if (overlap <= 0) continue;
        // coincident centres: push along x
        const nx = d > 1e-9 ? dx / d : 1;
        const ny = d > 1e-9 ? dy / d : 0;
        a.moveBy(this.terrain, -nx * overlap * 0.5, -ny * overlap * 0.5);
        b.moveBy(this.terrain, nx * overlap * 0.5, ny * overlap * 0.5);
      }
    }
  }

  private clearWrecks(): void {
    for (let i = this.vehicles.length; i--; ) {
      const v = this.vehicles[i] as Vehicle;
      if (v.state !== 'destroyed') continue;
      if (++v.wreckTicks >= WRECK_TICKS) this.vehicles.splice(i, 1);
    }
  }

  private removeVehicle(v: Vehicle): void {
    const i = this.vehicles.indexOf(v);
    if (i >= 0) this.vehicles.splice(i, 1);
  }

  /** Hash of the whole sim state, for replay tests (SPEC §14.1). */
  hash(): string {
    const h = new Hasher();
    h.num(this.tick).num(this.rng.seed).num(this.terrain.version);
    for (const row of this.terrain.toRows()) h.str(row);
    for (const p of this.players.values()) {
      h.str(p.id)
        .str(p.mode)
        .num(p.selected)
        .num(p.lostTimer)
        .num(p.vehicle?.id ?? 0);
      for (const t of VEHICLE_ORDER) h.num(p.stock[t]);
    }
    for (const v of this.vehicles) {
      h.num(v.id).str(v.state).num(v.x).num(v.y).num(v.heading).num(v.turret).num(v.speed);
      h.num(v.hp).num(v.fuel).num(v.ammo).num(v.cooldown).num(v.elevator).num(v.altitude);
      h.num(v.rockets)
        .num(v.mines)
        .num(v.tyresInflated ? 1 : 0)
        .num(v.wreckTicks);
    }
    for (const s of this.shots) h.num(s.id).num(s.x).num(s.y).num(s.travelled);
    for (const m of this.mines) h.num(m.id).num(m.x).num(m.y);
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
