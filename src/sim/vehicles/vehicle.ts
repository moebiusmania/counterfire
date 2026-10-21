import type { Mobility, Terrain } from '../terrain';
import { VEHICLES, type VehicleTuning } from '../tuning';
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
  }

  get mobility(): Mobility {
    return this.type === 'heli' ? 'air' : 'ground';
  }

  get alive(): boolean {
    return this.state !== 'destroyed';
  }

  savePrev(): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevHeading = this.heading;
    this.prevTurret = this.turret;
  }

  /**
   * Move by the current speed along the heading, sliding along whatever blocks the way.
   * Returns true when something blocked the move.
   */
  move(terrain: Terrain): boolean {
    const dx = -Math.sin(this.heading) * this.speed;
    const dy = Math.cos(this.heading) * this.speed;
    const r = this.tuning.radius;
    let blocked = false;
    if (terrain.circleFits(this.x + dx, this.y, r, this.mobility)) this.x += dx;
    else blocked = true;
    if (terrain.circleFits(this.x, this.y + dy, r, this.mobility)) this.y += dy;
    else blocked = true;
    return blocked;
  }
}
