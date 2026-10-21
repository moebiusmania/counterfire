// Flags (SPEC §7): each side's flag hides in one of its flag towers. Destroying that tower
// exposes it; only a jeep can carry it. An enemy flag brought home wins the game. A side's own
// flag brought home is hidden again in a random tower; dropped at sea it drifts back to shore.

import { Tile } from './terrain';
import { FLAGS } from './tuning';
import type { Team } from './types';
import type { Vehicle } from './vehicles/vehicle';
import type { World } from './world';

export type FlagState = 'hidden' | 'exposed' | 'carried' | 'floating';

export class Flag {
  state: FlagState = 'hidden';
  x = 0;
  y = 0;
  /** The flag tower it hides in while hidden. */
  tower = 0;
  /** The jeep carrying it. */
  carrier = 0;
  /** Ticks until it can be picked up again after a drop. */
  pickupDelay = 0;

  constructor(readonly team: Team) {}
}

/** Hide a flag in a random intact tower from its side's candidates. Returns false if none is left. */
export function hideFlag(flag: Flag, world: World, avoid = 0): boolean {
  const ids = world.level.flagCandidates[flag.team] ?? [];
  const towers = world.structures.filter(
    (s) => s.type === 'flagTower' && !s.destroyed && s.entity.id && ids.includes(s.entity.id),
  );
  // a returned flag goes to a new tower when there is a choice
  const choices = towers.length > 1 ? towers.filter((t) => t.id !== avoid) : towers;
  const tower = choices[world.rng.int(choices.length)];
  if (!tower) return false;
  flag.state = 'hidden';
  flag.tower = tower.id;
  flag.x = tower.x;
  flag.y = tower.y;
  flag.carrier = 0;
  return true;
}

export function updateFlag(flag: Flag, world: World): void {
  if (flag.pickupDelay > 0) flag.pickupDelay--;
  switch (flag.state) {
    case 'hidden':
      return;
    case 'carried': {
      const jeep = world.vehicles.find((v) => v.id === flag.carrier);
      if (jeep?.state !== 'active') {
        dropFlag(flag, world, jeep?.x ?? flag.x, jeep?.y ?? flag.y);
        return;
      }
      flag.x = jeep.x;
      flag.y = jeep.y;
      if (jeep.elevatorDir === 0) deliver(flag, jeep, world);
      return;
    }
    case 'floating':
      drift(flag, world);
      tryPickup(flag, world);
      return;
    case 'exposed':
      tryPickup(flag, world);
      return;
  }
}

/** Let go of a flag where it is; at sea it floats. */
export function dropFlag(flag: Flag, world: World, x: number, y: number): void {
  flag.x = x;
  flag.y = y;
  flag.carrier = 0;
  flag.pickupDelay = FLAGS.pickupDelay;
  flag.state = world.terrain.at(x, y) === Tile.Deep ? 'floating' : 'exposed';
  world.emit({ type: 'flagDropped', team: flag.team, x, y });
}

/** Expose the flag hidden in a tower that was just destroyed. */
export function exposeFlag(flag: Flag, world: World): void {
  flag.state = 'exposed';
  world.emit({ type: 'flagExposed', team: flag.team, x: flag.x, y: flag.y });
}

function tryPickup(flag: Flag, world: World): void {
  if (flag.pickupDelay > 0) return;
  const jeep = world.vehicles.find(
    (v) =>
      v.type === 'jeep' &&
      v.controllable &&
      !world.flags.some((f) => f.state === 'carried' && f.carrier === v.id) &&
      Math.hypot(v.x - flag.x, v.y - flag.y) < FLAGS.pickupRadius,
  );
  if (!jeep) return;
  flag.state = 'carried';
  flag.carrier = jeep.id;
  world.emit({ type: 'flagPickedUp', team: flag.team, vehicle: jeep.id, by: jeep.team });
}

/** A jeep with a flag on its own bunker pad: capture an enemy flag, or re-hide its own. */
function deliver(flag: Flag, jeep: Vehicle, world: World): void {
  const home = world.players.get(jeep.team)?.bunker;
  if (!home || Math.hypot(jeep.x - home.x, jeep.y - home.y) > 0.8) return;
  if (world.areEnemies(flag.team, jeep.team)) {
    world.emit({ type: 'flagCaptured', team: flag.team, by: jeep.team });
    world.endGame(jeep.team, 'flagCaptured');
    return;
  }
  if (flag.team !== jeep.team) return;
  const from = flag.tower;
  if (hideFlag(flag, world, from)) world.emit({ type: 'flagReturned', team: flag.team });
}

/** Drift toward the nearest land: "it will slowly float back to shore" (SPEC §7). */
function drift(flag: Flag, world: World): void {
  const t = world.terrain;
  const fx = Math.floor(flag.x);
  const fy = Math.floor(flag.y);
  let best: { x: number; y: number } | undefined;
  let bestD = Number.POSITIVE_INFINITY;
  const reach = 12;
  for (let y = fy - reach; y <= fy + reach; y++) {
    for (let x = fx - reach; x <= fx + reach; x++) {
      if (t.get(x, y) === Tile.Deep) continue;
      const d = (x + 0.5 - flag.x) ** 2 + (y + 0.5 - flag.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x: x + 0.5, y: y + 0.5 };
      }
    }
  }
  if (!best) return; // nothing in reach: it bobs where it is
  const d = Math.sqrt(bestD);
  const step = Math.min(FLAGS.driftSpeed, d);
  flag.x += ((best.x - flag.x) / d) * step;
  flag.y += ((best.y - flag.y) / d) * step;
  if (t.at(flag.x, flag.y) !== Tile.Deep) flag.state = 'exposed';
}
