// The bunker screen in 3D (SPEC §9.2), after the original's garage: each player's underground hangar
// seen from the side in cross-section, deep under their bunker, the four vehicles on their elevator
// platforms and a spotlight that slides along the gantry to the one selected. When a vehicle goes up
// its platform climbs the shaft before the view cuts to the field, and the other way on the way down.
// Layout and lighting are [VERIFY] against the original.

import {
  type Camera3D,
  type Color,
  EngineObject3D,
  Light3D,
  render3D,
  rgb,
  type Vector3,
  vec3,
} from 'littlejsengine';
import type { PlayerId, VehicleType } from '../sim/types';
import { type PlayerState, VEHICLE_ORDER, type World } from '../sim/world';
import {
  buildBayLamp,
  buildHangar,
  buildHangarPiston,
  buildHangarPlatform,
  buildSpotlightLamp,
  HANGAR,
  hangarBayX,
} from './models';
import { buildVehicleView, type VehicleView } from './scene';
import { toWorld } from './terrain';

/** How far under the bunker the hangar sits, well clear of the field and its lights. */
const DEPTH = 40;
/** How far a platform climbs up its shaft over the half of the elevator ride seen from below. */
const RISE = 4.5;
/** The share of the gap the spotlight closes each frame. */
const SPOT_RATE = 0.12;
/** Vehicles in profile, the nose turned a little toward the camera. */
const PARKED_YAW = Math.PI / 2 + 0.35;
/** Half the width the camera keeps in view, and how close it comes at most. */
const FRAME_HALF_WIDTH = 4.7;
const FRAME_MIN_DISTANCE = 7;

const STOCK_LAMP = rgb(0.3, 1, 0.4);
const EMPTY_LAMP = rgb(1, 0.25, 0.15);

interface Bay {
  platform: EngineObject3D;
  piston: EngineObject3D;
  vehicle: VehicleView;
  /** The skin the vehicle was built with, to rebuild it when the player picks another. */
  skin: number;
  lamp: EngineObject3D;
}

interface Garage {
  origin: Vector3;
  bays: Bay[];
  spot: Light3D;
  housing: EngineObject3D;
  spotX: number;
}

interface Lighting {
  sun: Color;
  ambient: Color;
  ground: Color | undefined;
  shadowLight: Light3D | undefined;
}

const INDOOR: Omit<Lighting, 'shadowLight'> = {
  sun: rgb(0.16, 0.15, 0.13),
  ambient: rgb(0.17, 0.17, 0.19),
  ground: rgb(0.06, 0.05, 0.05),
};

function parkedView(type: VehicleType, player: PlayerId, at: Vector3, skin: number): VehicleView {
  const view = buildVehicleView(type, player, at, skin);
  view.root.softShadow = 0; // a blob would land on the field above
  return view;
}

/** The platform on its way up or down, while the hangar is still in view. */
function transit(p: PlayerState): { bay: number; rise: number } | undefined {
  const v = p.vehicle;
  if (!v || v.elevatorDir === 0 || v.elevator <= 0.5) return undefined;
  return { bay: VEHICLE_ORDER.indexOf(v.type), rise: (1 - v.elevator) * 2 * RISE };
}

export class Hangars {
  private readonly garages = new Map<PlayerId, Garage>();
  /** The field's lighting, put back for views outside. */
  private readonly outdoor: Lighting;
  private frame = 0;

  /** Build after the level's sky is set, so its lighting is the one put back. */
  constructor(private readonly world: World) {
    this.outdoor = {
      sun: render3D.sunColor,
      ambient: render3D.ambientColor,
      ground: render3D.ambientGroundColor,
      shadowLight: render3D.shadowLight,
    };
    for (const p of world.players.values()) {
      const origin = toWorld(p.bunker.x, p.bunker.y, -DEPTH);
      const room = new EngineObject3D(origin, buildHangar(p.id));
      room.castShadow = false;
      const platformMesh = buildHangarPlatform();
      const pistonMesh = buildHangarPiston();
      const lampMesh = buildBayLamp();
      const bays = VEHICLE_ORDER.map((type, i): Bay => {
        const lamp = new EngineObject3D(origin.add(vec3(hangarBayX(i), 1.6, HANGAR.back + 0.03)), lampMesh);
        lamp.emissive = 1;
        return {
          platform: new EngineObject3D(origin, platformMesh),
          piston: new EngineObject3D(origin, pistonMesh),
          vehicle: parkedView(type, p.id, origin, p.skins[type]),
          skin: p.skins[type],
          lamp,
        };
      });
      const spotX = hangarBayX(p.selected);
      const spot = new Light3D(origin, 8, rgb(1, 0.93, 0.78), 6);
      spot.coneAngle = 0.36;
      spot.coneSoftness = 0.45;
      spot.glow = 0.35;
      // a dim cool fill from in front, so the cut face and the parked vehicles read in the dark
      new Light3D(origin.add(vec3(0, 2.5, HANGAR.front + 4)), 16, rgb(0.55, 0.62, 0.75), 0.9);
      const housing = new EngineObject3D(origin, buildSpotlightLamp());
      housing.castShadow = false;
      this.garages.set(p.id, { origin, bays, spot, housing, spotX });
    }
    this.sync();
  }

  /** Is this player looking at their hangar: in the bunker, or riding the elevator below ground. */
  indoor(player: PlayerId): boolean {
    const p = this.world.players.get(player);
    return !!p && (p.mode === 'bunker' || !!transit(p));
  }

  /** Call once per rendered frame. */
  sync(): void {
    this.frame++;
    for (const [id, g] of this.garages) {
      const p = this.world.player(id);
      const moving = transit(p);
      const target = moving?.bay ?? p.selected;
      g.spotX += (hangarBayX(target) - g.spotX) * SPOT_RATE;
      g.bays.forEach((bay, i) => {
        const x = hangarBayX(i);
        const type = VEHICLE_ORDER[i] as VehicleType;
        const stocked = p.stock[type] > 0;
        if (bay.skin !== p.skins[type]) {
          bay.vehicle.root.destroy();
          bay.vehicle = parkedView(type, id, g.origin, p.skins[type]);
          bay.skin = p.skins[type];
        }
        const rise = moving?.bay === i ? moving.rise : 0;
        const at = g.origin.add(vec3(x, rise, 0));
        bay.platform.pos3D = at;
        bay.piston.pos3D = at;
        bay.piston.scale3D = vec3(1, Math.max(0.01, rise), 1);
        // an empty bay shows its bare platform; the vehicle waits out of sight under the floor
        const shown = stocked || moving?.bay === i;
        const v = bay.vehicle;
        v.root.pos3D = shown ? at.add(vec3(0, 0.09, 0)) : g.origin.add(vec3(x, -5, 0));
        v.root.rotation3D = vec3(0, PARKED_YAW, 0);
        if (v.turret) v.turret.rotation3D = vec3(0, -0.5, 0);
        // the selected helicopter idles its rotor
        if (i === target) v.rotorAngle += 0.06;
        if (v.rotor) v.rotor.rotation3D = vec3(0, v.rotorAngle, 0);
        if (v.tailRotor) v.tailRotor.rotation3D = vec3(v.rotorAngle * 1.7, 0, 0);
        bay.lamp.color = stocked ? STOCK_LAMP : EMPTY_LAMP;
        // the lamp of the selected bay blinks
        bay.lamp.emissive = i === target && (this.frame >> 4) % 2 ? 0.4 : 1;
      });
      const lamp = g.origin.add(vec3(g.spotX, HANGAR.height - 0.32, HANGAR.front - 0.15));
      const aim = g.origin.add(vec3(g.spotX, Math.min(2, 0.2 + (moving?.rise ?? 0)), -0.3));
      g.spot.pos3D = lamp;
      g.spot.lookAt(aim);
      g.housing.pos3D = lamp;
      g.housing.lookAt(aim);
    }
  }

  /** Put the camera in front of the cut face, far enough back that all four bays fit the view. */
  frameCamera(player: PlayerId, camera: Camera3D, aspect: number): void {
    const g = this.garages.get(player);
    if (!g) return;
    const fit = FRAME_HALF_WIDTH / (Math.tan(camera.fov / 2) * aspect);
    camera.pos = g.origin.add(vec3(0, 1.9, HANGAR.front + Math.max(FRAME_MIN_DISTANCE, fit)));
    camera.lookAt(g.origin.add(vec3(0, 1.2, 0)));
  }

  /** Where each bay's caption goes: under the front edge of its floor, in world space. */
  captionPoints(player: PlayerId): Vector3[] {
    const g = this.garages.get(player);
    if (!g) return [];
    return VEHICLE_ORDER.map((_, i) => g.origin.add(vec3(hangarBayX(i), -0.4, HANGAR.front)));
  }

  /** Light the view that is drawing next: the player's hangar, or the field when undefined. */
  light(player: PlayerId | undefined): void {
    const g = player && this.garages.get(player);
    const l = g ? { ...INDOOR, shadowLight: g.spot } : this.outdoor;
    render3D.sunColor = l.sun;
    render3D.ambientColor = l.ambient;
    render3D.ambientGroundColor = l.ground;
    render3D.shadowLight = l.shadowLight;
  }
}
