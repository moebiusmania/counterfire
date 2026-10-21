import type { Collider, Mobility } from '../terrain';
import { HELI, MINES, VEHICLES, type VehicleTuning } from '../tuning';
import type { PlayerId, VehicleType } from '../types';

export type VehicleState = 'active' | 'abandoned' | 'destroyed';

export class Vehicle {
  readonly tuning: VehicleTuning;
  x: number;
  y: number;
  heading: number;
  /** Forward speed in tiles per tick, negative in reverse. */
  speed = 0;
  /** Turret angle relative to the hull (tank only). */
  turret = 0;
  hp: number;
  fuel: number;
  ammo: number;
  cooldown = 0;
  state: VehicleState = 'active';
  /** Ticks since the vehicle was destroyed; wrecks are cleared after a while. */
  wreckTicks = 0;

  /** 0 at ground level, 1 fully down the bunker shaft. */
  elevator = 0;
  /** -1 rising out of the bunker, +1 going down into it, 0 still. */
  elevatorDir: -1 | 0 | 1 = 0;
  /** Set once the vehicle has driven off its bunker pad, so the bunker light can come on. */
  leftBunker = false;
  /** The bunker light: on the pad and able to go down with a Fire key (SPEC §6). */
  onBunker = false;
  /** Parked at a depot and taking on fuel or ammo. */
  resupplying = false;

  /** Helicopter: the weapon Switch selects, and rocket count. */
  weapon: 'gun' | 'rockets' = 'gun';
  rockets = 0;
  /** Helicopter: 0 landed, 1 at flight height. */
  altitude = 0;
  /** Jeep: tyres inflated for water, and progress of the last change (0..1). */
  tyresInflated = false;
  tyreChange = 1;
  /** ASV: mines left. */
  mines = 0;

  // last tick's pose, so the renderer can interpolate
  prevX: number;
  prevY: number;
  prevHeading: number;
  prevTurret = 0;

  constructor(
    readonly id: number,
    readonly type: VehicleType,
    readonly team: PlayerId,
    x: number,
    y: number,
    heading: number,
  ) {
    this.tuning = VEHICLES[type];
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.heading = this.prevHeading = heading;
    this.hp = this.tuning.hp;
    this.fuel = this.tuning.fuel;
    this.ammo = this.tuning.ammo;
    if (type === 'heli') this.rockets = HELI.rockets;
    if (type === 'asv') this.mines = MINES.count;
  }

  get mobility(): Mobility {
    if (this.type === 'heli') return 'air';
    if (this.type === 'jeep' && this.tyresInflated) return 'amphibious';
    return 'ground';
  }

  get alive(): boolean {
    return this.state !== 'destroyed';
  }

  /** Under player control: active and not riding the elevator. */
  get controllable(): boolean {
    return this.state === 'active' && this.elevatorDir === 0;
  }

  /** Full repair and resupply, as the bunker does. */
  restore(): void {
    this.hp = this.tuning.hp;
    this.fuel = this.tuning.fuel;
    this.ammo = this.tuning.ammo;
    if (this.type === 'heli') this.rockets = HELI.rockets;
    if (this.type === 'asv') this.mines = MINES.count;
  }

  savePrev(): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevHeading = this.heading;
    this.prevTurret = this.turret;
  }

  /**
   * Move by (dx, dy), sliding along whatever blocks the way.
   * Returns true when something blocked the move.
   */
  moveBy(space: Collider, dx: number, dy: number): boolean {
    const r = this.tuning.radius;
    let blocked = false;
    if (space.fits(this.x + dx, this.y, r, this.mobility)) this.x += dx;
    else blocked = true;
    if (space.fits(this.x, this.y + dy, r, this.mobility)) this.y += dy;
    else blocked = true;
    return blocked;
  }

  /** Move by the current speed along the heading. */
  move(space: Collider): boolean {
    return this.moveBy(space, -Math.sin(this.heading) * this.speed, Math.cos(this.heading) * this.speed);
  }
}
