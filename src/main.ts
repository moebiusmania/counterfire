// Counterfire entry point: engine setup, the fixed-step loop and the per-frame render hooks.
//
// Milestone 5 build: training-01 alone against the CPU, or `?players=2` for a split-screen duel
// on duel-01. `?level=<id>` picks any shipped level; gamepads 0 and 1 play alongside the keys.
// `?showcase` freezes a line-up of every vehicle, structure and soldier under a close camera,
// to check the models.

import {
  engineInit,
  engineObjectsDestroy,
  keyWasPressed,
  Render3DPlugin,
  render3D,
  rgb,
  setCanvasClearColor,
  setInputWASDEmulateDirection,
  setShowSplashScreen,
  vec3,
} from 'littlejsengine';
import { playSfx, setListeners } from './audio/sfx';
import { type Bindings, loadBindings, readInput } from './input/bindings';
import { mergeInputs, readGamepad } from './input/gamepad';
import { defaultLevelId, getLevel } from './levels';
import type { Level } from './levels/schema';
import { SceneView } from './render/scene';
import { toWorld } from './render/terrain';
import { PlayerView, SplitScreen } from './render/views';
import { type BeaconLight, jeepBeacon } from './sim/beacon';
import { Drone } from './sim/drones';
import { GAME_OVER_TICKS } from './sim/tuning';
import type { InputFrame, PlayerId } from './sim/types';
import { VEHICLE_ORDER, World } from './sim/world';
import { clearBanners, drawHud, updateBanners } from './ui/hud';

const params = new URLSearchParams(location.search);
const showcase = params.has('showcase');
const levelId = showcase
  ? 'training-01'
  : (params.get('level') ?? defaultLevelId(params.get('players') === '2' ? 2 : 1));
const seed = Number(params.get('seed') ?? Date.now() % 1e9);

let world: World;
let scene: SceneView;
let split: SplitScreen;
let bindings: Record<PlayerId, Bindings>;
let players: PlayerId[];
/** Last beacon colour per player, to chime when it turns green (SPEC §6.4). */
const beacons = new Map<PlayerId, BeaconLight>();

function loadLevel(): Level {
  const level = getLevel(levelId) ?? getLevel(defaultLevelId(1));
  if (!level) throw new Error(`no level '${levelId}'`);
  if (showcase) {
    const b = level.entities.find((e) => e.id === 'p1-bunker');
    const y = (b?.y ?? 0) + 4;
    const x = (b?.x ?? 0) - 2.4;
    level.entities.push(
      { id: 'sc-house', type: 'building', team: 'NEUTRAL', variant: 'house', x, y },
      { id: 'sc-barracks', type: 'building', team: 'CPU', variant: 'barracks', x: x + 1.6, y },
      { id: 'sc-gun', type: 'turret', team: 'P1', variant: 'gun', x: x + 3.2, y, rot: 0.6 },
      { id: 'sc-missile', type: 'turret', team: 'P1', variant: 'missile', x: x + 4.8, y, rot: -0.6 },
      { id: 'sc-rubble', type: 'building', team: 'NEUTRAL', x: x + 6.4, y },
    );
  }
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
  render3D.onRenderOpaque = () => scene.drawDynamic(players[split.current] ?? 'P1');
  bindings = loadBindings();
  startGame(seed);
}

/** A fresh world and everything drawn for it; also how a finished game restarts. */
function startGame(gameSeed: number) {
  engineObjectsDestroy();
  clearBanners();
  beacons.clear();
  world = new World(loadLevel(), gameSeed);
  players = [...world.players.keys()];
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
  const rubble = world.structures.find((s) => s.entity.id === 'sc-rubble');
  if (rubble) world.damageStructure(rubble, rubble.hp);
  world.soldiers.splice(0); // the rubble's occupants; the line-up below replaces them
  Object.assign(world.submarine, {
    state: 'aiming',
    surfaced: 1,
    x: bunker.x + 3.4,
    y: bunker.y + 0.6,
    heading: 1.2,
  });
  for (let i = 0; i < 4; i++) {
    const s = world.spawnSoldier(i % 2 ? 'CPU' : 'NEUTRAL', bunker.x - 1.5 + i * 0.5, bunker.y + 0.9);
    s.state = i === 3 ? 'dead' : i % 2 ? 'waving' : 'running';
  }
  const flag = world.flags[0];
  if (flag) Object.assign(flag, { state: 'exposed', x: bunker.x + 1.2, y: bunker.y + 0.9 });
  const drone = new Drone(0, 'CPU', 'showcase', bunker.x - 2.6, bunker.y + 0.6);
  drone.heading = -0.4;
  world.drones.push(drone);
}

function gameUpdate() {
  if (showcase) return; // a still line-up
  const inputs: Partial<Record<PlayerId, InputFrame>> = {};
  players.forEach((p, i) => {
    inputs[p] = mergeInputs(readInput(bindings[p]), readGamepad(i));
  });
  world.step(inputs);
  scene.handleEvents(world.events);
  updateBanners(world, world.events);
  for (const e of world.events) {
    if (e.type !== 'gameOver') continue;
    // two players share one screen, so a win for either sounds like a win
    const won = e.winner !== 'CPU' && e.winner !== 'draw';
    playSfx(won ? 'victory' : 'defeat');
  }
  chimeBeacons();

  const o = world.outcome;
  if (o && world.tick - o.tick > GAME_OVER_TICKS) {
    if (players.some((p) => bindings[p].fireGround.some((k) => keyWasPressed(k))))
      startGame(seed + world.tick);
  }
}

/** The jeep's beacon chimes as it swings onto the enemy flag. */
function chimeBeacons() {
  for (const p of players) {
    const v = world.players.get(p)?.vehicle;
    const light = v?.type === 'jeep' && v.controllable ? jeepBeacon(world, v) : 'off';
    if (light === 'green' && beacons.get(p) !== 'green') playSfx('ping');
    beacons.set(p, light);
  }
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
  // in split-screen each player hears from their own vehicle, on their own side
  setListeners(players.length > 1 ? players.map((p, i) => ({ ...vehiclePos(p), pan: i ? 0.7 : -0.7 })) : []);
}

function gameRender() {
  split.renderOtherViews();
}

function gameRenderPost() {
  if (!showcase) drawHud(world, bindings);
}

engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);
