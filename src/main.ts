// Counterfire entry point: engine setup, the fixed-step loop and the per-frame render hooks.
//
// Milestone 2 build: players start in the bunker on training-01 and pick a vehicle.
// `?players=2` adds a second player for split-screen and two-player rules (mines).
// `?showcase` parks one of each vehicle by the bunker under a close camera, to check the models.

import {
  engineInit,
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
import { VEHICLE_ORDER, World } from './sim/world';
import { drawHud } from './ui/hud';

const params = new URLSearchParams(location.search);
const twoPlayers = params.get('players') === '2';
const showcase = params.has('showcase');
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
  render3D.onRenderOpaque = () => scene.drawDynamic();

  world = new World(loadLevel(), seed);
  players = [...world.players.keys()];
  bindings = loadBindings();
  if (showcase) parkShowcase();
  scene = new SceneView(world);
  split.views = players.map((p) => new PlayerView(vehiclePos(p)));
}

/** One of each vehicle in a row beside the P1 bunker, the helicopter flying, the jeep's tyres up. */
function parkShowcase() {
  const bunker = world.player('P1').bunker;
  VEHICLE_ORDER.forEach((type, i) => {
    const v = world.spawnVehicle('P1', type);
    v.x = bunker.x - 2.4 + i * 1.6;
    v.y = bunker.y + 2;
    v.heading = 0.5;
    v.turret = type === 'tank' ? -0.9 : 0;
    if (type === 'jeep') v.tyresInflated = true;
    if (type === 'heli') v.altitude = 0.3;
  });
  const p = world.player('P1');
  p.vehicle = undefined;
  p.mode = 'field';
  p.lostTimer = Number.POSITIVE_INFINITY;
}

function gameUpdate() {
  const inputs: Partial<Record<PlayerId, InputFrame>> = {};
  for (const p of players) inputs[p] = readInput(bindings[p]);
  world.step(inputs);
  scene.handleEvents(world.events);
}

function gameUpdatePost() {
  scene.sync();
  if (showcase) {
    const b = world.player('P1').bunker;
    const view = split.views[0];
    if (view) {
      view.camera.pos = toWorld(b.x, b.y - 2.5, 4.2);
      view.camera.lookAt(toWorld(b.x, b.y + 2, 0.4));
    }
    return;
  }
  players.forEach((p, i) => {
    split.views[i]?.follow(vehiclePos(p));
  });
}

function gameRender() {
  split.renderOtherViews();
}

function gameRenderPost() {
  if (!showcase) drawHud(world, bindings);
}

engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);
