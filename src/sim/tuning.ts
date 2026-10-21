// Gameplay tuning. Every number here is [VERIFY] against the original (SPEC §4.2):
// measure speeds and hits-to-kill there and update these values.
// Units: tiles, ticks (60 per second), radians.

import type { VehicleType } from './types';

export interface VehicleTuning {
  radius: number;
  /** Top speed forward, tiles per tick. */
  maxSpeed: number;
  /** Top speed in reverse, tiles per tick. */
  maxReverse: number;
  accel: number;
  /** Speed lost per tick with no throttle. */
  drag: number;
  turnRate: number;
  hp: number;
  fuel: number;
  /** Fuel burned per tick while idling and per unit of speed while moving. */
  fuelIdle: number;
  fuelPerSpeed: number;
  ammo: number;
  fireCooldown: number;
  turretTurnRate: number;
}

export const VEHICLES: Record<VehicleType, VehicleTuning> = {
  tank: {
    radius: 0.45,
    maxSpeed: 0.07,
    maxReverse: 0.04,
    accel: 0.003,
    drag: 0.004,
    turnRate: 0.035,
    hp: 100,
    fuel: 100,
    fuelIdle: 0.0005,
    fuelPerSpeed: 0.12,
    ammo: 40,
    fireCooldown: 30,
    turretTurnRate: 0.05,
  },
  asv: {
    radius: 0.5,
    maxSpeed: 0.05,
    maxReverse: 0.03,
    accel: 0.002,
    drag: 0.004,
    turnRate: 0.03,
    hp: 160,
    fuel: 100,
    fuelIdle: 0.0005,
    fuelPerSpeed: 0.12,
    ammo: 24,
    fireCooldown: 40,
    turretTurnRate: 0,
  },
  heli: {
    radius: 0.5,
    maxSpeed: 0.12,
    maxReverse: 0.06,
    accel: 0.004,
    drag: 0.003,
    turnRate: 0.05,
    hp: 40,
    fuel: 100,
    fuelIdle: 0.004,
    fuelPerSpeed: 0.08,
    ammo: 60,
    fireCooldown: 10,
    turretTurnRate: 0,
  },
  jeep: {
    radius: 0.35,
    maxSpeed: 0.14,
    maxReverse: 0.06,
    accel: 0.005,
    drag: 0.005,
    turnRate: 0.06,
    hp: 1,
    fuel: 100,
    fuelIdle: 0.0005,
    fuelPerSpeed: 0.1,
    ammo: 12,
    fireCooldown: 30,
    turretTurnRate: 0,
  },
};

/** Helicopter extras: sideways strafe while banking, and rockets alongside the gun. */
export const HELI = {
  strafeSpeed: 0.06,
  rockets: 12,
  rocketCooldown: 30,
  /** Height in tiles when flying; only the renderer uses it. */
  flightHeight: 2.5,
};

/** Jeep with inflated tyres: amphibious but slower on land. */
export const JEEP = {
  inflatedLandSpeed: 0.09,
  waterSpeed: 0.07,
  inflateTicks: 40,
};

/** ASV mines (two-player only, SPEC §6.2). */
export const MINES = {
  count: 6,
  triggerRadius: 0.45,
  layCooldown: 45,
};

export const BUNKER = {
  /** Ticks for the elevator to bring a vehicle up or take it down. */
  elevatorTicks: 60,
  /** How close to the bunker centre the bunker light comes on. */
  radius: 0.8,
  /** Ticks after losing a vehicle before the player is back in the bunker. */
  lostDelay: 120,
};

export const DEPOT = {
  /** How close to a depot a vehicle must park. */
  radius: 1.3,
  maxParkSpeed: 0.005,
  fuelPerTick: 0.4,
  /** Ticks per round of ammo. */
  ticksPerRound: 6,
};

export interface ShotTuning {
  speed: number;
  range: number;
  damage: number;
  /** Lobbed or fired from the air: flies over trees and walls and lands at the end of its range. */
  air?: boolean;
  clearsTrees?: boolean;
  destroysBridges?: boolean;
  destroysMines?: boolean;
}

export const SHOTS = {
  tankShell: { speed: 0.35, range: 9, damage: 35, clearsTrees: true },
  asvRocket: { speed: 0.3, range: 11, damage: 60, clearsTrees: true },
  heliGun: { speed: 0.5, range: 6, damage: 6, air: true },
  heliRocket: {
    speed: 0.35,
    range: 7,
    damage: 40,
    air: true,
    clearsTrees: true,
    destroysBridges: true,
    destroysMines: true,
  },
  grenade: { speed: 0.12, range: 3, damage: 20, air: true, clearsTrees: true },
} as const satisfies Record<string, ShotTuning>;
export type ShotKind = keyof typeof SHOTS;
