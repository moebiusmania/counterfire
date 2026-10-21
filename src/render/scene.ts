// Mirrors sim entities as 3D objects and turns sim events into effects.

import { EngineObject3D, type Mesh, ParticleEmitter3D, render3D, rgb, vec3 } from 'littlejsengine';
import { playSfx } from '../audio/sfx';
import type { LevelEntity } from '../levels/schema';
import type { Vehicle } from '../sim/vehicles/vehicle';
import type { SimEvent, World } from '../sim/world';
import { buildBunker, buildDepot, buildFlagTower, buildTank, buildTurret } from './models';
import { TerrainView, toWorld } from './terrain';

interface VehicleView {
  hull: EngineObject3D;
  turret?: EngineObject3D;
}

const WRECK = rgb(0.18, 0.16, 0.14);

export class SceneView {
  readonly terrain: TerrainView;
  private readonly vehicles = new Map<number, VehicleView>();

  constructor(private readonly world: World) {
    this.terrain = new TerrainView(world.terrain);
    for (const e of world.level.entities) this.addStructure(e);
  }

  private addStructure(e: LevelEntity): void {
    const team = e.team ?? 'NEUTRAL';
    let mesh: Mesh;
    switch (e.type) {
      case 'bunker':
        mesh = buildBunker(team);
        break;
      case 'flagTower':
        mesh = buildFlagTower(team);
        break;
      case 'turret':
        mesh = buildTurret(team);
        break;
      case 'fuelDepot':
      case 'ammoTent':
        mesh = buildDepot(e.type, team);
        break;
      default:
        return; // buildings, drone spawns: milestone 3
    }
    const obj = new EngineObject3D(toWorld(e.x, e.y), mesh);
    obj.rotation3D = vec3(0, e.rot ?? 0, 0);
  }

  /** Call once per rendered frame. */
  sync(): void {
    this.terrain.sync();
    for (const v of this.world.vehicles) this.syncVehicle(v);
  }

  private syncVehicle(v: Vehicle): void {
    let view = this.vehicles.get(v.id);
    if (!view) {
      const meshes = buildTank(v.team);
      const hull = new EngineObject3D(toWorld(v.x, v.y), meshes.hull);
      const turret = new EngineObject3D(vec3(0, 0.31, 0), meshes.turret);
      hull.addChild(turret);
      hull.softShadow = 1.2;
      view = { hull, turret };
      this.vehicles.set(v.id, view);
    }
    view.hull.pos3D = toWorld(v.x, v.y);
    view.hull.rotation3D = vec3(0, v.heading, 0);
    if (view.turret) view.turret.rotation3D = vec3(0, v.turret, 0);
    if (v.state === 'destroyed') {
      view.hull.color = WRECK;
      if (view.turret) view.turret.color = WRECK;
    }
  }

  /** Shells are drawn straight from sim state each frame. */
  drawShots(): void {
    for (const s of this.world.shots) render3D.drawSphere(toWorld(s.x, s.y, 0.4), 0.14, rgb(1, 0.9, 0.5));
  }

  handleEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          playSfx('cannon', toWorld(e.x, e.y));
          break;
        case 'explosion':
          explosion(e.x, e.y, e.size);
          playSfx(e.size > 1 ? 'bigExplosion' : 'explosion', toWorld(e.x, e.y));
          break;
        case 'treeDestroyed':
          debris(e.x, e.y);
          break;
        case 'dryFire':
          playSfx('click');
          break;
        default:
          break;
      }
    }
  }
}

function explosion(x: number, y: number, size: number): void {
  new ParticleEmitter3D(
    toWorld(x, y, 0.3),
    size * 0.4,
    0.08,
    300 * size,
    Math.PI,
    undefined,
    rgb(1, 0.85, 0.3),
    rgb(1, 0.4, 0.1),
    rgb(0.25, 0.22, 0.2, 0),
    rgb(0.1, 0.1, 0.1, 0),
    0.5 + size * 0.3,
    0.25 * size,
    0.9 * size,
    0.04 * size,
    0.92,
    0,
    0.2,
    0.5,
    true,
  );
}

function debris(x: number, y: number): void {
  new ParticleEmitter3D(
    toWorld(x, y, 0.5),
    0.6,
    0.1,
    120,
    Math.PI / 2,
    undefined,
    rgb(0.15, 0.35, 0.12),
    rgb(0.35, 0.22, 0.1),
    rgb(0.15, 0.3, 0.1, 0),
    rgb(0.3, 0.2, 0.1, 0),
    0.8,
    0.15,
    0.08,
    0.06,
    0.95,
    -0.004,
    0.2,
    0.5,
    false,
  );
}
