// What a player knows: the bunker map (SPEC §9.3) and the radar (SPEC §9.5). Pure functions of the
// world, so the rules about who sees what are testable without drawing anything.

import { RADAR } from '../sim/tuning';
import type { PlayerId, Team } from '../sim/types';
import type { Vehicle } from '../sim/vehicles/vehicle';
import type { World } from '../sim/world';

export type MapMarker =
  | { kind: 'bunker'; team: Team; x: number; y: number }
  | { kind: 'turret'; team: Team; x: number; y: number; destroyed: boolean }
  | { kind: 'flagTower'; team: Team; x: number; y: number; destroyed: boolean }
  | { kind: 'flag'; team: Team; x: number; y: number }
  | { kind: 'enemy'; team: Team; x: number; y: number };

/**
 * The Intelligence Gathering Division's map: bunkers, turrets, every flag building, flags once
 * found, and the enemy player's position. It never shows mines. Walls and the current state of the
 * terrain come from the terrain itself.
 */
export function mapMarkers(world: World, viewer: PlayerId): MapMarker[] {
  const out: MapMarker[] = [];
  for (const s of world.structures) {
    if (s.type === 'bunker') {
      // in one-player only your own bunker; in two-player the enemy's too
      out.push({ kind: 'bunker', team: s.team, x: s.x, y: s.y });
    } else if (s.type === 'turret' || s.type === 'flagTower') {
      out.push({ kind: s.type, team: s.team, x: s.x, y: s.y, destroyed: s.destroyed });
    }
  }
  for (const f of world.flags) {
    if (f.state !== 'hidden') out.push({ kind: 'flag', team: f.team, x: f.x, y: f.y });
  }
  for (const p of world.players.values()) {
    const v = p.vehicle;
    if (p.id === viewer || v?.state !== 'active') continue;
    out.push({ kind: 'enemy', team: p.id, x: v.x, y: v.y });
  }
  return out;
}

export type RadarContact =
  | { kind: 'enemy' | 'friend' | 'drone'; x: number; y: number }
  | { kind: 'mine'; x: number; y: number; own: boolean };

export function hasRadar(v: Vehicle): boolean {
  return RADAR.vehicles.includes(v.type);
}

/**
 * Radar contacts within range of a vehicle: other vehicles, drones, and mines, which the map does
 * not show. Positions are relative to the vehicle, in tiles.
 */
export function radarContacts(world: World, v: Vehicle): RadarContact[] {
  const out: RadarContact[] = [];
  const near = (x: number, y: number) => Math.hypot(x - v.x, y - v.y) <= RADAR.range;
  for (const o of world.vehicles) {
    if (o === v || o.state !== 'active' || o.elevator > 0.5 || !near(o.x, o.y)) continue;
    out.push({ kind: world.areEnemies(o.team, v.team) ? 'enemy' : 'friend', x: o.x - v.x, y: o.y - v.y });
  }
  for (const d of world.drones) {
    if (near(d.x, d.y)) out.push({ kind: 'drone', x: d.x - v.x, y: d.y - v.y });
  }
  for (const m of world.mines) {
    if (near(m.x, m.y)) out.push({ kind: 'mine', x: m.x - v.x, y: m.y - v.y, own: m.team === v.team });
  }
  return out;
}
