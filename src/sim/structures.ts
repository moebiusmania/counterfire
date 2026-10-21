// Buildings, flag towers, turrets, depots and bunkers placed by the level (SPEC §8.2).

import type { EntityType, LevelEntity } from '../levels/schema';
import { STRUCTURES, TURRETS, type TurretVariant } from './tuning';
import type { Team } from './types';

export type StructureType = Exclude<EntityType, 'droneSpawn'>;

export class Structure {
  readonly type: StructureType;
  readonly team: Team;
  readonly x: number;
  readonly y: number;
  readonly maxHp: number;
  hp: number;
  destroyed = false;
  /** Turret head heading, absolute, same convention as vehicles. */
  aim: number;
  cooldown = 0;

  constructor(
    readonly id: number,
    readonly entity: LevelEntity,
  ) {
    this.type = entity.type as StructureType;
    this.team = entity.team ?? 'NEUTRAL';
    this.x = entity.x;
    this.y = entity.y;
    this.aim = entity.rot ?? 0;
    // the bunker can not be destroyed [VERIFY]
    this.maxHp = this.type === 'bunker' ? Number.POSITIVE_INFINITY : STRUCTURES.hp[this.type];
    this.hp = this.maxHp;
  }

  get turretVariant(): TurretVariant {
    return this.entity.variant === 'missile' ? 'missile' : 'gun';
  }

  get turret() {
    return TURRETS[this.turretVariant];
  }

  /** Intact structures block land vehicles and ground shots; the bunker pad is driven over. */
  get solid(): boolean {
    return !this.destroyed && this.type !== 'bunker';
  }

  /** Is (x, y) inside the footprint, grown by `pad`? */
  contains(x: number, y: number, pad = 0): boolean {
    const h = STRUCTURES.footprint / 2 + pad;
    return Math.abs(x - this.x) <= h && Math.abs(y - this.y) <= h;
  }

  /** Does a circle overlap the footprint? */
  overlapsCircle(x: number, y: number, r: number): boolean {
    const h = STRUCTURES.footprint / 2;
    const cx = Math.max(this.x - h, Math.min(x, this.x + h));
    const cy = Math.max(this.y - h, Math.min(y, this.y + h));
    return (x - cx) ** 2 + (y - cy) ** 2 < r * r;
  }
}
