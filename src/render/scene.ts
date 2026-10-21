// Mirrors sim entities as 3D objects and turns sim events into effects.

import {
  buildMatrix,
  type Color,
  EngineObject3D,
  type Mesh,
  ParticleEmitter3D,
  render3D,
  rgb,
  vec3,
} from 'littlejsengine';
import { playSfx } from '../audio/sfx';
import type { Flag } from '../sim/flags';
import type { Soldier } from '../sim/soldiers';
import type { Structure } from '../sim/structures';
import { Tile } from '../sim/terrain';
import { DRONES, HELI } from '../sim/tuning';
import type { PlayerId } from '../sim/types';
import type { Vehicle } from '../sim/vehicles/vehicle';
import type { Shot, SimEvent, World } from '../sim/world';
import {
  buildAsv,
  buildBuilding,
  buildBunker,
  buildBunkerLamp,
  buildDepot,
  buildDrone,
  buildFlag,
  buildFlagTower,
  buildHeli,
  buildJeep,
  buildMine,
  buildRubble,
  buildSoldier,
  buildSubmarine,
  buildTank,
  buildTurretParts,
} from './models';
import { SEA_LEVEL, TerrainView, toWorld } from './terrain';
import { THEMES } from './themes';

interface VehicleView {
  root: EngineObject3D;
  turret?: EngineObject3D;
  rotor?: EngineObject3D;
  tailRotor?: EngineObject3D;
  wheels: EngineObject3D[];
  rotorAngle: number;
}

interface StructureView {
  obj: EngineObject3D;
  head?: EngineObject3D;
  destroyed: boolean;
}

interface SoldierView {
  obj: EngineObject3D;
  phase: number;
}

const WRECK = rgb(0.18, 0.16, 0.14);
const LAMP_ON = rgb(0.3, 1, 0.4);
const LAMP_OFF = rgb(0.25, 0.25, 0.25);
/** How far down the shaft a vehicle sinks when the elevator is fully down. */
const SHAFT_DEPTH = 1.4;

export class SceneView {
  readonly terrain: TerrainView;
  private readonly vehicles = new Map<number, VehicleView>();
  private readonly lamps = new Map<string, EngineObject3D>();
  private readonly structures = new Map<number, StructureView>();
  private readonly soldiers = new Map<number, SoldierView>();
  private readonly soldierMeshes = new Map<string, Mesh>();
  private readonly mineMesh = buildMine();
  private readonly rubbleMesh = buildRubble();
  private readonly sub: EngineObject3D;
  private readonly flags = new Map<Flag, { pole: EngineObject3D; cloth: EngineObject3D }>();
  private readonly drones = new Map<number, EngineObject3D>();
  private readonly droneMesh = buildDrone('CPU');
  private frame = 0;

  constructor(private readonly world: World) {
    this.terrain = new TerrainView(world.terrain, THEMES[world.level.theme]);
    for (const t of world.structures) this.addStructure(t);
    this.sub = new EngineObject3D(toWorld(0, 0, -3), buildSubmarine());
    this.sub.castShadow = false;
    for (const f of world.flags) {
      const meshes = buildFlag(f.team);
      const pole = new EngineObject3D(toWorld(f.x, f.y, -5), meshes.pole);
      const cloth = new EngineObject3D(vec3(0.03, 0.78, 0), meshes.cloth);
      pole.addChild(cloth);
      this.flags.set(f, { pole, cloth });
    }
    for (const p of world.players.values()) {
      const lamp = new EngineObject3D(toWorld(p.bunker.x + 0.75, p.bunker.y + 0.75, 0.2), buildBunkerLamp());
      lamp.color = LAMP_OFF;
      this.lamps.set(p.id, lamp);
    }
  }

  private addStructure(t: Structure): void {
    let mesh: Mesh;
    let head: EngineObject3D | undefined;
    switch (t.type) {
      case 'bunker':
        mesh = buildBunker(t.team);
        break;
      case 'flagTower':
        mesh = buildFlagTower(t.team);
        break;
      case 'building':
        mesh = buildBuilding(t.entity.variant, t.team);
        break;
      case 'turret': {
        const parts = buildTurretParts(t.turretVariant, t.team);
        mesh = parts.base;
        head = new EngineObject3D(vec3(0, 0.36, 0), parts.head);
        break;
      }
      case 'fuelDepot':
      case 'ammoTent':
        mesh = buildDepot(t.type, t.team);
        break;
    }
    const obj = new EngineObject3D(toWorld(t.x, t.y), mesh);
    obj.rotation3D = vec3(0, t.type === 'turret' ? 0 : (t.entity.rot ?? 0), 0);
    if (head) obj.addChild(head);
    this.structures.set(t.id, { obj, head, destroyed: false });
  }

  private syncStructures(): void {
    for (const t of this.world.structures) {
      const view = this.structures.get(t.id);
      if (!view) continue;
      if (view.head) view.head.rotation3D = vec3(0, t.aim, 0);
      if (t.destroyed && !view.destroyed) {
        view.destroyed = true;
        view.head?.destroy();
        view.head = undefined;
        // setMesh would free the shared rubble mesh's GPU buffer when it is swapped out later
        view.obj.mesh = this.rubbleMesh;
        view.obj.rotation3D = vec3(0, (t.id * 1.3) % 6.28, 0);
      }
    }
  }

  private syncSoldiers(): void {
    const alive = new Set<number>();
    for (const s of this.world.soldiers) {
      alive.add(s.id);
      let view = this.soldiers.get(s.id);
      if (!view) {
        view = { obj: new EngineObject3D(toWorld(s.x, s.y), this.soldierMesh(s)), phase: (s.id * 0.37) % 1 };
        this.soldiers.set(s.id, view);
      }
      view.phase += 0.25;
      let pitch = 0;
      let roll = 0;
      let bob = 0;
      if (s.state === 'dead') pitch = -Math.PI / 2;
      else if (s.state === 'waving') roll = Math.sin(view.phase) * 0.25;
      else bob = Math.abs(Math.sin(view.phase)) * 0.04;
      view.obj.pos3D = toWorld(s.x, s.y, s.state === 'dead' ? 0.04 : bob);
      view.obj.rotation3D = vec3(pitch, s.heading, roll);
      if (s.state === 'dead') view.obj.color = rgb(0.5, 0.2, 0.18);
    }
    for (const [id, view] of this.soldiers) {
      if (alive.has(id)) continue;
      view.obj.destroy();
      this.soldiers.delete(id);
    }
  }

  private soldierMesh(s: Soldier): Mesh {
    let mesh = this.soldierMeshes.get(s.team);
    if (!mesh) {
      mesh = buildSoldier(s.team);
      this.soldierMeshes.set(s.team, mesh);
    }
    return mesh;
  }

  private syncFlags(): void {
    for (const [f, view] of this.flags) {
      let pos = toWorld(f.x, f.y, -5); // hidden: out of sight under the tower
      let yaw = 0;
      if (f.state === 'exposed') pos = toWorld(f.x, f.y);
      if (f.state === 'floating')
        pos = toWorld(f.x, f.y, SEA_LEVEL - 0.3 + Math.sin(this.frame * 0.05) * 0.05);
      if (f.state === 'carried') {
        // on the jeep's flag mount, back right
        const jeep = this.world.vehicles.find((v) => v.id === f.carrier);
        if (jeep) {
          const c = Math.cos(jeep.heading);
          const s = Math.sin(jeep.heading);
          pos = toWorld(jeep.x + 0.17 * c - 0.3 * s, jeep.y + 0.17 * s + 0.3 * c, 0.3);
          yaw = jeep.heading;
        }
      }
      view.pole.pos3D = pos;
      view.pole.rotation3D = vec3(0, yaw, 0);
      view.cloth.rotation3D = vec3(0, Math.sin(this.frame * 0.15 + f.x) * 0.35, 0);
    }
  }

  private syncDrones(): void {
    const alive = new Set<number>();
    for (const d of this.world.drones) {
      alive.add(d.id);
      let obj = this.drones.get(d.id);
      if (!obj) {
        obj = new EngineObject3D(toWorld(d.x, d.y), this.droneMesh);
        obj.softShadow = 0.7;
        this.drones.set(d.id, obj);
      }
      obj.pos3D = toWorld(d.x, d.y, DRONES.hoverHeight + Math.sin(this.frame * 0.08 + d.id) * 0.08);
      obj.rotation3D = vec3(0, d.heading, 0);
    }
    for (const [id, obj] of this.drones) {
      if (alive.has(id)) continue;
      obj.destroy();
      this.drones.delete(id);
    }
  }

  private syncSubmarine(): void {
    const sub = this.world.submarine;
    // under the waves it sits deep enough to vanish; surfaced its deck is just awash
    this.sub.pos3D = toWorld(sub.x, sub.y, -1.6 + sub.surfaced * 1.55);
    this.sub.rotation3D = vec3(0, sub.heading, 0);
  }

  /** Call once per rendered frame. */
  sync(): void {
    this.terrain.sync();
    this.syncStructures();
    this.syncSoldiers();
    this.syncSubmarine();
    this.syncFlags();
    this.syncDrones();
    this.frame++;
    const alive = new Set<number>();
    for (const v of this.world.vehicles) {
      alive.add(v.id);
      this.syncVehicle(v);
    }
    // vehicles the sim removed: back in the bunker, or burnt-out wrecks cleared
    for (const [id, view] of this.vehicles) {
      if (alive.has(id)) continue;
      view.root.destroy();
      this.vehicles.delete(id);
    }
    for (const p of this.world.players.values()) {
      const lamp = this.lamps.get(p.id);
      const on = p.vehicle?.onBunker ?? false;
      if (lamp) {
        lamp.color = on ? LAMP_ON : LAMP_OFF;
        lamp.emissive = on ? 1.5 : 0;
      }
    }
  }

  private createVehicleView(v: Vehicle): VehicleView {
    const at = toWorld(v.x, v.y);
    const view = (root: EngineObject3D, shadow: number): VehicleView => {
      root.softShadow = shadow;
      return { root, wheels: [], rotorAngle: 0 };
    };
    switch (v.type) {
      case 'tank': {
        const meshes = buildTank(v.team);
        const out = view(new EngineObject3D(at, meshes.hull), 1.2);
        out.turret = new EngineObject3D(vec3(0, 0.31, 0), meshes.turret);
        out.root.addChild(out.turret);
        return out;
      }
      case 'asv':
        return view(new EngineObject3D(at, buildAsv(v.team)), 1.4);
      case 'heli': {
        const meshes = buildHeli(v.team);
        const out = view(new EngineObject3D(at, meshes.body), 1.6);
        out.rotor = new EngineObject3D(vec3(0, 0.7, 0), meshes.rotor);
        out.tailRotor = new EngineObject3D(vec3(0.08, 0.55, 1.25), meshes.tailRotor);
        out.root.addChild(out.rotor);
        out.root.addChild(out.tailRotor);
        return out;
      }
      case 'jeep': {
        const meshes = buildJeep(v.team);
        const out = view(new EngineObject3D(at, meshes.body), 0.9);
        for (const [x, z] of [
          [-0.26, -0.27],
          [0.26, -0.27],
          [-0.26, 0.27],
          [0.26, 0.27],
        ] as const) {
          const wheel = new EngineObject3D(vec3(x, 0.2, z), meshes.wheel);
          out.root.addChild(wheel);
          out.wheels.push(wheel);
        }
        return out;
      }
    }
  }

  private syncVehicle(v: Vehicle): void {
    let view = this.vehicles.get(v.id);
    if (!view) {
      view = this.createVehicleView(v);
      this.vehicles.set(v.id, view);
    }
    let height = -v.elevator * SHAFT_DEPTH;
    let pitch = 0;
    let roll = 0;
    if (v.type === 'heli') {
      height += v.altitude * HELI.flightHeight;
      // nose down with forward speed, bank into a strafe
      pitch = -(v.speed / v.tuning.maxSpeed) * 0.2;
      const lateral = (v.x - v.prevX) * Math.cos(v.heading) + (v.y - v.prevY) * Math.sin(v.heading);
      roll = -(lateral / HELI.strafeSpeed) * 0.25;
      const spin = v.state === 'destroyed' ? 0 : v.altitude > 0 || v.elevatorDir === 0 ? 0.5 : 0.15;
      view.rotorAngle += spin;
      if (view.rotor) view.rotor.rotation3D = vec3(0, view.rotorAngle, 0);
      if (view.tailRotor) view.tailRotor.rotation3D = vec3(view.rotorAngle * 1.7, 0, 0);
    }
    if (v.type === 'jeep') {
      const k = v.tyresInflated ? v.tyreChange : 1 - v.tyreChange;
      const s = 1 + 0.6 * k;
      for (const w of view.wheels) w.scale3D = vec3(s, s, s);
      height += 0.08 * k;
      if (this.world.terrain.at(v.x, v.y) === Tile.Deep) height -= 0.15;
    }
    view.root.pos3D = toWorld(v.x, v.y, height);
    view.root.rotation3D = vec3(pitch, v.heading, roll);
    if (view.turret) view.turret.rotation3D = vec3(0, v.turret, 0);
    if (v.state === 'destroyed') this.tint(view, WRECK);
  }

  private tint(view: VehicleView, color: Color): void {
    view.root.color = color;
    for (const c of [view.turret, view.rotor, view.tailRotor, ...view.wheels]) if (c) c.color = color;
  }

  /** Shots and mines, drawn straight from sim state; called inside each 3D pass. */
  drawDynamic(viewer: PlayerId): void {
    for (const s of this.world.shots) drawShot(s);
    for (const m of this.world.minesSeenBy(viewer))
      render3D.drawMesh(this.mineMesh, buildMatrix(toWorld(m.x, m.y)));
  }

  handleEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          playSfx(e.kind, toWorld(e.x, e.y));
          break;
        case 'explosion':
          explosion(e.x, e.y, e.size);
          if (e.size > 0.2) playSfx(e.size > 1 ? 'bigExplosion' : 'explosion', toWorld(e.x, e.y));
          break;
        case 'structureDestroyed':
          debris(e.x, e.y, rgb(0.6, 0.55, 0.45), rgb(0.3, 0.28, 0.25));
          playSfx('collapse', toWorld(e.x, e.y));
          break;
        case 'soldierKilled':
          playSfx('scream', toWorld(e.x, e.y));
          break;
        case 'flagExposed':
          playSfx('flagExposed');
          break;
        case 'flagPickedUp':
          playSfx('flagTaken');
          break;
        case 'subSurfacing':
          splash(e.x, e.y);
          playSfx('klaxon', toWorld(e.x, e.y));
          break;
        case 'treeDestroyed':
          debris(e.x, e.y, rgb(0.15, 0.35, 0.12), rgb(0.35, 0.22, 0.1));
          break;
        case 'bridgeDestroyed':
          debris(e.x, e.y, rgb(0.45, 0.33, 0.2), rgb(0.2, 0.2, 0.2));
          break;
        case 'sank':
          splash(e.x, e.y);
          playSfx('splash', toWorld(e.x, e.y));
          break;
        case 'resupply':
          playSfx('bell', this.vehiclePos(e.vehicle));
          break;
        case 'bunkerLight':
          if (e.on) playSfx('ping', this.vehiclePos(e.vehicle));
          break;
        case 'deploy':
          playSfx('elevator', this.bunkerPos(e.player));
          break;
        case 'tyres':
          playSfx('tyres', this.vehiclePos(e.vehicle));
          break;
        // interface sounds come from the player's own side in split-screen
        case 'mineLaid':
          playSfx('select', toWorld(e.x, e.y));
          break;
        case 'weaponSwitched':
          playSfx('select', this.vehiclePos(e.vehicle));
          break;
        case 'selectSlot':
          playSfx('select', this.bunkerPos(e.player));
          break;
        case 'dryFire':
          playSfx('click', this.vehiclePos(e.vehicle));
          break;
        case 'stockEmpty':
          playSfx('click', this.bunkerPos(e.player));
          break;
        default:
          break;
      }
    }
  }

  private bunkerPos(player: PlayerId) {
    const b = this.world.players.get(player)?.bunker;
    return b ? toWorld(b.x, b.y) : undefined;
  }

  private vehiclePos(id: number) {
    const v = this.world.vehicles.find((x) => x.id === id);
    return v ? toWorld(v.x, v.y) : undefined;
  }
}

/** Height of a shot above the ground: air shots fall from the helicopter, grenades arc. */
function shotHeight(s: Shot): number {
  const f = Math.min(1, s.travelled / s.tuning.range);
  switch (s.kind) {
    case 'heliGun':
    case 'heliRocket':
      return HELI.flightHeight * (1 - f) + 0.15;
    case 'turretMissile':
      return 0.8;
    case 'droneGun':
      return DRONES.hoverHeight;
    case 'subMissile':
      return 1.2;
    case 'grenade':
      return 0.4 + 4 * 1.2 * f * (1 - f);
    default:
      return 0.4;
  }
}

function drawShot(s: Shot): void {
  const h = shotHeight(s);
  const pos = toWorld(s.x, s.y, h);
  const yaw = Math.atan2(-s.dx, s.dy);
  switch (s.kind) {
    case 'asvRocket':
    case 'heliRocket':
    case 'turretMissile':
    case 'subMissile':
      render3D.drawBox(pos, vec3(0.08, 0.08, 0.38), rgb(0.85, 0.85, 0.8), vec3(0, yaw, 0));
      render3D.drawSphere(toWorld(s.x - s.dx * 0.6, s.y - s.dy * 0.6, h), 0.16, rgb(1, 0.6, 0.2));
      break;
    case 'heliGun':
    case 'droneGun':
      render3D.drawSphere(pos, 0.07, rgb(1, 1, 0.6));
      break;
    case 'grenade':
      render3D.drawSphere(pos, 0.12, rgb(0.25, 0.3, 0.15));
      break;
    default:
      render3D.drawSphere(pos, 0.14, rgb(1, 0.9, 0.5));
  }
}

function transparent(c: Color): Color {
  return rgb(c.r, c.g, c.b, 0);
}

function burst(
  x: number,
  y: number,
  height: number,
  size: number,
  rate: number,
  cone: number,
  a: Color,
  b: Color,
  life: number,
  sizes: [number, number],
  speed: number,
  gravity: number,
  additive: boolean,
): void {
  new ParticleEmitter3D(
    toWorld(x, y, height),
    size,
    0.1,
    rate,
    cone,
    undefined,
    a,
    b,
    transparent(a),
    transparent(b),
    life,
    sizes[0],
    sizes[1],
    speed,
    0.94,
    gravity,
    0.2,
    0.5,
    additive,
  );
}

function explosion(x: number, y: number, size: number): void {
  burst(
    x,
    y,
    0.3,
    size * 0.4,
    300 * size,
    Math.PI,
    rgb(1, 0.85, 0.3),
    rgb(1, 0.4, 0.1),
    0.5 + size * 0.3,
    [0.25 * size, 0.9 * size],
    0.04 * size,
    0,
    true,
  );
}

function debris(x: number, y: number, a: Color, b: Color): void {
  burst(x, y, 0.5, 0.6, 120, Math.PI / 2, a, b, 0.8, [0.15, 0.08], 0.06, -0.004, false);
}

function splash(x: number, y: number): void {
  burst(x, y, 0, 0.8, 200, 0.5, rgb(0.8, 0.9, 1), rgb(0.5, 0.7, 0.9), 0.9, [0.15, 0.3], 0.08, -0.006, false);
}
