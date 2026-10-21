// Counterfire entry point: engine setup, the fixed-step loop and the per-frame render hooks.
//
// Milestone 1 build: one tank per player drives on training-01. `?players=2` adds a second
// player for the split-screen test. The bunker screen and vehicle choice come in milestone 2;
// until then Ground Fire with no vehicle rolls out a new tank.

import {
  engineInit,
  keyWasPressed,
  Render3DPlugin,
  render3D,
  rgb,
  setCanvasClearColor,
  setInputWASDEmulateDirection,
  setShowSplashScreen,
  vec3,
} from 'littlejsengine';
import training01 from '../assets/levels/training-01.json';
import { type Bindings, loadBindings, readInput } from './input/bindings';
import type { Level } from './levels/schema';
import { SceneView } from './render/scene';
import { toWorld } from './render/terrain';
import { PlayerView, SplitScreen } from './render/views';
import type { InputFrame, PlayerId } from './sim/types';
import { World } from './sim/world';
import { drawHud, type HudSlot } from './ui/hud';

const params = new URLSearchParams(location.search);
const twoPlayers = params.get('players') === '2';
const seed = Number(params.get('seed') ?? Date.now() % 1e9);

let world: World;
let scene: SceneView;
let split: SplitScreen;
let bindings: Record<PlayerId, Bindings>;
let players: PlayerId[];

/** training-01 is a one-player map; for the split-screen test, put a P2 bunker on the far road. */
function loadLevel(): Level {
  const level = structuredClone(training01) as Level;
  if (!twoPlayers) return level;
  level.players = 2;
  level.entities.push({ id: 'p2-bunker', type: 'bunker', team: 'P2', x: 30.5, y: 18.5, rot: Math.PI });
  level.stock.P2 = { tank: 3, asv: 2, heli: 2, jeep: 3 };
  level.flagCandidates.P1 = [];
  level.flagCandidates.P2 = level.flagCandidates.CPU ?? [];
  return level;
}

function vehiclePos(player: PlayerId) {
  const p = world.players.get(player);
  const v = p?.vehicle;
  return v ? toWorld(v.x, v.y) : toWorld(p?.bunker.x ?? 0, p?.bunker.y ?? 0);
}

function gameInit() {
  setShowSplashScreen(false);
  setInputWASDEmulateDirection(false);
  setCanvasClearColor(rgb(0.15, 0.4, 0.55));

  split = new SplitScreen(); // before the 3D plugin, see render/views.ts
  new Render3DPlugin();
  split.install();
  render3D.setSky(rgb(0.45, 0.65, 0.9), rgb(0.75, 0.85, 0.95), rgb(0.2, 0.35, 0.45), 0.55);
  render3D.sunDirection = vec3(-0.4, 1, 0.3);
  render3D.sunColor = rgb(1, 0.96, 0.88);
  render3D.shadowRange = 30;
  render3D.setFog(40, 90);
  render3D.onRenderOpaque = () => scene.drawShots();

  world = new World(loadLevel(), seed);
  players = [...world.players.keys()];
  bindings = loadBindings();
  for (const p of players) world.spawnVehicle(p, 'tank');
  scene = new SceneView(world);
  split.views = players.map((p) => new PlayerView(vehiclePos(p)));
}

function gameUpdate() {
  const inputs: Partial<Record<PlayerId, InputFrame>> = {};
  for (const p of players) inputs[p] = readInput(bindings[p]);
  world.step(inputs);
  scene.handleEvents(world.events);

  // stand-in for the bunker until milestone 2
  for (const p of players) {
    const v = world.players.get(p)?.vehicle;
    if (v?.state !== 'active' && bindings[p].fireGround.some((k) => keyWasPressed(k)))
      world.spawnVehicle(p, 'tank');
  }
}

function gameUpdatePost() {
  scene.sync();
  players.forEach((p, i) => {
    split.views[i]?.follow(vehiclePos(p));
  });
}

function gameRender() {
  split.renderOtherViews();
}

function gameRenderPost() {
  const slots: HudSlot[] = players.map((p) => {
    const vehicle = world.players.get(p)?.vehicle;
    const lost = vehicle && vehicle.state !== 'active';
    const message =
      vehicle?.state === 'destroyed'
        ? 'VEHICLE LOST - FIRE FOR A NEW TANK'
        : lost
          ? 'OUT OF FUEL - FIRE FOR A NEW TANK'
          : undefined;
    return { player: p, vehicle: lost ? undefined : vehicle, message };
  });
  drawHud(slots);
}

engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);
