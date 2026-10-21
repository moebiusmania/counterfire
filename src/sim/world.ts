// The deterministic simulation (SPEC §3.1, §4). No rendering, no DOM, no Math.random().

import type { Level, LevelEntity, Stock } from '../levels/schema';
import { Drone, updateDrone } from './drones';
import { dropFlag, exposeFlag, Flag, hideFlag, updateFlag } from './flags';
import { Rng } from './rng';
import { Soldier, updateSoldier } from './soldiers';
import { Structure } from './structures';
import { Submarine, updateSubmarine } from './submarine';
import { blocksShots, type Collider, type Mobility, Terrain, Tile } from './terrain';
import { BUNKER, DEPOT, DRONES, MINES, type ShotKind, type ShotTuning, SOLDIERS, STRUCTURES } from './tuning';
import { headingTo, updateTurret } from './turrets';
import { EMPTY_INPUT, type InputFrame, type PlayerId, type Team, type VehicleType, wrapAngle } from './types';
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
  /** Id of the vehicle or structure that fired it, -1 for the submarine. */
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
  /** The vehicle a homing missile is chasing right now. */
  target?: number;
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
  | { type: 'structureHit'; structure: number; damage: number }
  | { type: 'structureDestroyed'; structure: number; x: number; y: number }
  | { type: 'soldierKilled'; soldier: number; x: number; y: number; crushed: boolean }
  | { type: 'subSurfacing'; x: number; y: number; vehicle: number }
  | { type: 'subFired'; x: number; y: number }
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
  | { type: 'selfDestruct'; vehicle: number }
  | { type: 'flagExposed'; team: Team; x: number; y: number }
  | { type: 'flagPickedUp'; team: Team; vehicle: number; by: PlayerId }
  | { type: 'flagDropped'; team: Team; x: number; y: number }
  | { type: 'flagReturned'; team: Team }
  | { type: 'flagCaptured'; team: Team; by: PlayerId }
  | { type: 'droneDestroyed'; drone: number; x: number; y: number }
  | { type: 'gameOver'; winner: Team | 'draw'; reason: GameOverReason };

export type GameOverReason = 'flagCaptured' | 'outOfVehicles' | 'outOfJeeps' | 'stalemate';

export interface Outcome {
  winner: Team | 'draw';
  reason: GameOverReason;
  tick: number;
}

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

export class World implements Collider {
  readonly rng: Rng;
  readonly terrain: Terrain;
  readonly players = new Map<PlayerId, PlayerState>();
  readonly vehicles: Vehicle[] = [];
  readonly structures: Structure[] = [];
  readonly soldiers: Soldier[] = [];
  readonly shots: Shot[] = [];
  readonly mines: Mine[] = [];
  readonly submarine = new Submarine();
  readonly flags: Flag[] = [];
  readonly drones: Drone[] = [];
  /** Ticks until each drone spawn (by level entity id) launches a replacement. */
  private readonly droneRespawn = new Map<string, number>();
  /** Set once the game is won, lost or drawn; the world stops after that. */
  outcome?: Outcome;
  events: SimEvent[] = [];
  tick = 0;
  private nextId = 1;

  constructor(
    readonly level: Level,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    this.terrain = new Terrain(level.tiles);
    for (const e of level.entities) {
      if (e.type !== 'droneSpawn') this.structures.push(new Structure(this.nextId++, e));
      else this.droneRespawn.set(e.id ?? `drone-${this.nextId++}`, 0);
    }
    // each side's flag hides in one of its flag towers (SPEC §7)
    const sides: Team[] = level.players === 1 ? ['CPU'] : ['P1', 'P2'];
    for (const side of sides) {
      const flag = new Flag(side);
      if (hideFlag(flag, this)) this.flags.push(flag);
    }
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

  /** Neutral things are nobody's enemy. */
  areEnemies(a: Team, b: Team): boolean {
    return a !== b && a !== 'NEUTRAL' && b !== 'NEUTRAL';
  }

  /** Terrain plus intact structures: what a land vehicle or a soldier can stand on. */
  fits(x: number, y: number, r: number, mobility: Mobility): boolean {
    if (!this.terrain.fits(x, y, r, mobility)) return false;
    if (mobility === 'air') return true;
    for (const s of this.structures) if (s.solid && s.overlapsCircle(x, y, r)) return false;
    return true;
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

  spawnSoldier(team: Team, x: number, y: number): Soldier {
    const s = new Soldier(
      this.nextId++,
      team,
      x,
      y,
      this.rng.range(-Math.PI, Math.PI),
      30 + this.rng.int(60),
    );
    this.soldiers.push(s);
    return s;
  }

  removeSoldier(s: Soldier): void {
    const i = this.soldiers.indexOf(s);
    if (i >= 0) this.soldiers.splice(i, 1);
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
    if (this.outcome) return;

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
    for (const s of this.structures) if (s.type === 'turret' && !s.destroyed) updateTurret(s, this);
    updateSubmarine(this.submarine, this);
    this.updateDrones();
    this.updateShots();
    this.separateVehicles();
    this.updateMines();
    this.updateSoldiers();
    this.sinkVehicles();
    for (const f of this.flags) updateFlag(f, this);
    this.clearWrecks();
    for (let i = this.shots.length; i--; ) if (!this.shots[i]?.alive) this.shots.splice(i, 1);
    this.checkDefeat();
  }

  // --- the end (SPEC §5.3) ---

  endGame(winner: Team | 'draw', reason: GameOverReason): void {
    if (this.outcome) return;
    this.outcome = { winner, reason, tick: this.tick };
    this.emit({ type: 'gameOver', winner, reason });
  }

  /**
   * A player with no vehicles left loses. With no jeep left a player can never capture a flag:
   * alone against the CPU that is a loss, and when neither player has one it is a draw. [VERIFY]
   */
  private checkDefeat(): void {
    if (this.outcome) return;
    const status = [...this.players.values()].map((p) => {
      const v = p.vehicle?.state === 'active' ? p.vehicle : undefined;
      const stock = VEHICLE_ORDER.reduce((n, t) => n + p.stock[t], 0);
      return { id: p.id, hasVehicle: !!v || stock > 0, hasJeep: v?.type === 'jeep' || p.stock.jeep > 0 };
    });
    if (this.level.players === 1) {
      const p = status[0];
      if (p && !p.hasVehicle) this.endGame('CPU', 'outOfVehicles');
      else if (p && !p.hasJeep) this.endGame('CPU', 'outOfJeeps');
      return;
    }
    const out = status.filter((p) => !p.hasVehicle);
    if (out.length === 2) this.endGame('draw', 'outOfVehicles');
    else if (out.length === 1) this.endGame(status.find((p) => p.hasVehicle)?.id ?? 'draw', 'outOfVehicles');
    else if (status.every((p) => !p.hasJeep)) this.endGame('draw', 'stalemate');
  }

  // --- flags (SPEC §7) ---

  /** The flag a jeep is carrying, if any. */
  carriedBy(v: Vehicle): Flag | undefined {
    return this.flags.find((f) => f.state === 'carried' && f.carrier === v.id);
  }

  /** Switch on a jeep with a flag: put it down here. */
  dropCarriedFlag(v: Vehicle): void {
    const flag = this.carriedBy(v);
    if (flag) dropFlag(flag, this, v.x, v.y);
  }

  // --- drones (SPEC §8.3) ---

  private updateDrones(): void {
    for (const [spawnId, wait] of this.droneRespawn) {
      if (this.drones.some((d) => d.spawn === spawnId)) continue;
      if (wait > 0) {
        this.droneRespawn.set(spawnId, wait - 1);
        continue;
      }
      const e = this.level.entities.find((x) => x.id === spawnId);
      if (e) this.drones.push(new Drone(this.nextId++, e.team ?? 'CPU', spawnId, e.x, e.y));
    }
    for (const d of this.drones) {
      const e = this.level.entities.find((x) => x.id === d.spawn);
      updateDrone(d, this, e?.x ?? d.x, e?.y ?? d.y);
    }
  }

  private damageDrone(d: Drone, damage: number): void {
    d.hp -= damage;
    if (d.hp > 0) return;
    const i = this.drones.indexOf(d);
    if (i >= 0) this.drones.splice(i, 1);
    this.droneRespawn.set(d.spawn, DRONES.respawnTicks);
    this.emit({ type: 'droneDestroyed', drone: d.id, x: d.x, y: d.y });
    this.explode(d.x, d.y, 1);
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
      for (const d of this.structures) {
        if ((d.type !== 'fuelDepot' && d.type !== 'ammoTent') || d.destroyed) continue;
        if (this.areEnemies(d.team, v.team)) continue;
        if (Math.hypot(v.x - d.x, v.y - d.y) > DEPOT.radius) continue;
        const fuel = d.type === 'fuelDepot';
        const full = fuel ? v.fuel >= v.tuning.fuel : v.ammo >= v.tuning.ammo;
        if (full) continue;
        if (fuel) v.fuel = Math.min(v.tuning.fuel, v.fuel + DEPOT.fuelPerTick);
        else if (this.tick % DEPOT.ticksPerRound === 0) v.ammo++;
        v.resupplying = true;
        if (!was)
          this.emit({
            type: 'resupply',
            vehicle: v.id,
            depot: d.type === 'fuelDepot' ? 'fuelDepot' : 'ammoTent',
          });
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
      if (s.tuning.homing) this.steer(s);
      for (let k = 0; k < SUBSTEPS && s.alive; k++) {
        s.x += s.dx / SUBSTEPS;
        s.y += s.dy / SUBSTEPS;
        s.travelled += Math.hypot(s.dx, s.dy) / SUBSTEPS;
        this.collideShot(s);
      }
    }
  }

  /**
   * Turn a missile toward its target. The submarine's heat-seeker really seeks heat: each tick
   * it chases whatever hot vehicle is nearest to it, whoever that is (SPEC §8.4).
   */
  private steer(s: Shot): void {
    let target: { id: number; x: number; y: number } | undefined;
    if (s.tuning.homing === 'heat') {
      // vehicles with their engines running, and drones (SPEC §8.4)
      const hot = [...this.vehicles.filter((v) => v.controllable), ...this.drones];
      let best = Number.POSITIVE_INFINITY;
      for (const v of hot) {
        const d = Math.hypot(v.x - s.x, v.y - s.y);
        if (d < best) {
          best = d;
          target = v;
        }
      }
      s.target = target?.id;
    } else {
      target = this.vehicles.find((v) => v.id === s.target && v.controllable);
    }
    if (!target) return;
    const heading = Math.atan2(-s.dx, s.dy);
    const diff = wrapAngle(headingTo(s.x, s.y, target.x, target.y) - heading);
    const turn = s.tuning.turnRate ?? 0;
    const next = heading + Math.max(-turn, Math.min(turn, diff));
    s.dx = -Math.sin(next) * s.tuning.speed;
    s.dy = Math.cos(next) * s.tuning.speed;
  }

  private collideShot(s: Shot): void {
    // drones hover low enough for every weapon to hit them
    for (const d of this.drones) {
      if (d.id === s.owner || Math.hypot(d.x - s.x, d.y - s.y) > DRONES.radius) continue;
      this.damageDrone(d, s.tuning.damage);
      this.explodeShot(s, 0.5);
      return;
    }
    for (const v of this.vehicles) {
      if (v.id === s.owner || !v.alive || v.elevator > 0.5) continue;
      if (v.mobility === 'air' && !s.tuning.hitsAir) continue;
      const r = v.tuning.radius;
      if ((v.x - s.x) ** 2 + (v.y - s.y) ** 2 < r * r) {
        this.damageVehicle(v, s.tuning.damage);
        this.explodeShot(s, s.kind === 'subMissile' ? 1.4 : 0.6);
        return;
      }
    }

    const tx = Math.floor(s.x);
    const ty = Math.floor(s.y);
    if (!s.tuning.air) {
      const hit = this.structureAt(s.x, s.y, s.owner);
      if (hit) {
        this.damageStructure(hit, s.tuning.damage);
        this.explodeShot(s, 0.6);
        return;
      }
      if (blocksShots(this.terrain.get(tx, ty))) {
        this.impact(s, tx, ty);
        this.explodeShot(s, 0.6);
        return;
      }
    }
    if (s.travelled >= s.tuning.range) {
      if (s.tuning.air && !s.tuning.homing) {
        this.impact(s, tx, ty);
        const hit = this.structureAt(s.x, s.y, s.owner);
        if (hit) this.damageStructure(hit, s.tuning.damage);
      }
      this.explodeShot(s, s.kind === 'heliGun' ? 0.15 : 0.4);
    }
  }

  private structureAt(x: number, y: number, ignore: number): Structure | undefined {
    return this.structures.find((t) => t.solid && t.id !== ignore && t.contains(x, y));
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
    this.explode(s.x, s.y, size);
  }

  /** A blast: the effect, and any soldier caught in it dies. */
  private explode(x: number, y: number, size: number): void {
    this.emit({ type: 'explosion', x, y, size });
    const r = Math.max(0.35, size * 0.6);
    for (const s of this.soldiers) {
      if (s.state !== 'dead' && Math.hypot(s.x - x, s.y - y) < r) this.killSoldier(s, false);
    }
  }

  private destroyBridge(tx: number, ty: number): void {
    this.terrain.set(tx, ty, Tile.Deep);
    this.emit({ type: 'bridgeDestroyed', x: tx + 0.5, y: ty + 0.5 });
  }

  // --- structures (SPEC §8.2) ---

  damageStructure(t: Structure, damage: number): void {
    if (t.destroyed) return;
    t.hp -= damage;
    this.emit({ type: 'structureHit', structure: t.id, damage });
    if (t.hp > 0) return;
    t.hp = 0;
    t.destroyed = true;
    this.emit({ type: 'structureDestroyed', structure: t.id, x: t.x, y: t.y });
    this.explode(t.x, t.y, 1.8);
    // it leaves rubble, and the people inside run out
    const tx = Math.floor(t.x);
    const ty = Math.floor(t.y);
    if (this.terrain.get(tx, ty) !== Tile.Deep) this.terrain.set(tx, ty, Tile.Rubble);
    for (const f of this.flags) if (f.state === 'hidden' && f.tower === t.id) exposeFlag(f, this);
    if (t.type === 'building' || t.type === 'flagTower') {
      const [min, max] = STRUCTURES.soldiers;
      const count = min + this.rng.int(max - min + 1);
      for (let i = 0; i < count; i++) {
        this.spawnSoldier(t.team, t.x + this.rng.range(-0.3, 0.3), t.y + this.rng.range(-0.3, 0.3));
      }
    }
  }

  // --- soldiers ---

  private updateSoldiers(): void {
    for (const s of [...this.soldiers]) updateSoldier(s, this);
    // land vehicles on the move run soldiers over
    for (const v of this.vehicles) {
      if (!v.controllable || v.mobility === 'air' || Math.abs(v.speed) < 0.005) continue;
      for (const s of this.soldiers) {
        if (s.state === 'dead') continue;
        if (Math.hypot(s.x - v.x, s.y - v.y) < v.tuning.radius + SOLDIERS.radius) this.killSoldier(s, true);
      }
    }
    for (let i = this.soldiers.length; i--; ) {
      const s = this.soldiers[i] as Soldier;
      if (s.state === 'dead' && s.timer <= 0) this.soldiers.splice(i, 1);
    }
  }

  private killSoldier(s: Soldier, crushed: boolean): void {
    s.state = 'dead';
    s.timer = SOLDIERS.corpseTicks;
    this.emit({ type: 'soldierKilled', soldier: s.id, x: s.x, y: s.y, crushed });
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
    this.explode(m.x, m.y, 1);
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

  /** Out of fuel and stopped: the driver flees on foot toward the bunker (SPEC §6). */
  abandonVehicle(v: Vehicle): void {
    if (v.state !== 'active') return;
    v.state = 'abandoned';
    v.onBunker = false;
    this.emit({ type: 'driverBailed', vehicle: v.id, x: v.x, y: v.y });
    const p = this.players.get(v.team);
    const driver = this.spawnSoldier(v.team, v.x + 0.5, v.y);
    if (p) driver.home = { x: p.bunker.x, y: p.bunker.y };
    for (const q of this.players.values()) if (q.vehicle === v) q.lostTimer = BUNKER.lostDelay;
  }

  destroyVehicle(v: Vehicle): void {
    if (!v.alive) return;
    v.hp = 0;
    v.state = 'destroyed';
    v.speed = 0;
    v.onBunker = false;
    this.emit({ type: 'vehicleDestroyed', vehicle: v.id, x: v.x, y: v.y });
    this.explode(v.x, v.y, 1.6);
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
        a.moveBy(this, -nx * overlap * 0.5, -ny * overlap * 0.5);
        b.moveBy(this, nx * overlap * 0.5, ny * overlap * 0.5);
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
    for (const t of this.structures) h.num(t.id).num(t.hp).num(t.aim).num(t.cooldown);
    for (const s of this.soldiers) h.num(s.id).str(s.state).num(s.x).num(s.y).num(s.heading).num(s.timer);
    for (const s of this.shots) h.num(s.id).num(s.x).num(s.y).num(s.dx).num(s.dy).num(s.travelled);
    for (const m of this.mines) h.num(m.id).num(m.x).num(m.y);
    for (const f of this.flags)
      h.str(f.state).num(f.x).num(f.y).num(f.tower).num(f.carrier).num(f.pickupDelay);
    for (const d of this.drones) h.num(d.id).num(d.x).num(d.y).num(d.heading).num(d.hp).num(d.cooldown);
    h.str(this.outcome ? `${this.outcome.winner}:${this.outcome.reason}` : '');
    const sub = this.submarine;
    h.str(sub.state).num(sub.x).num(sub.y).num(sub.timer).num(sub.surfaced);
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
