// Counterfire entry point: engine setup, the menu, the fixed-step game loop and the render hooks.
//
// The game opens on the title menu (SPEC §5.1). URL options skip it for development and tests:
// `?level=<id>` plays a level, `?players=2` the first duel, `?showcase` the model line-up (with
// `&silhouette`, in black from the gameplay camera), `?seed=N` fixes the seed, and `?test` hands the
// live world to the browser smoke test.
// In play: Esc goes back to the menu, F3 pauses, Alt+Enter toggles full screen (SPEC §9.7).

import {
  engineInit,
  engineObjectsDestroy,
  keyIsDown,
  keyWasPressed,
  mainCanvasSize,
  mainContext,
  paused,
  Render3DPlugin,
  render3D,
  rgb,
  setCanvasClearColor,
  setInputWASDEmulateDirection,
  setPaused,
  setShowSplashScreen,
  vec3,
} from 'littlejsengine';
import { playSfx, setListeners } from './audio/sfx';
import { CUSTOM_KEY } from './editor/custom';
import { loadProgress, nextLevel, type Progress, recordWin, saveProgress, trackOf } from './game/progress';
import { addShowcaseStructures, parkShowcase } from './game/showcase';
import {
  ACTIONS,
  type Bindings,
  DEFAULT_BINDINGS,
  loadBindings,
  readInput,
  rebind,
  saveBindings,
} from './input/bindings';
import { mergeInputs, readGamepad } from './input/gamepad';
import { defaultLevelId, getLevel } from './levels';
import type { Level } from './levels/schema';
import { SceneView } from './render/scene';
import { toWorld } from './render/terrain';
import { THEMES } from './render/themes';
import { PlayerView, SplitScreen } from './render/views';
import { type BeaconLight, jeepBeacon } from './sim/beacon';
import { GAME_OVER_TICKS } from './sim/tuning';
import type { InputFrame, PlayerId } from './sim/types';
import { World } from './sim/world';
import { clearBanners, drawHud, updateBanners } from './ui/hud';
import {
  CONTROL_PLAYERS,
  drawMenu,
  initialMenu,
  type MenuAction,
  type MenuState,
  menuInput,
  selectedLevel,
} from './ui/menu';

const params = new URLSearchParams(location.search);
const showcase = params.has('showcase');
/** `?showcase&silhouette`: the line-up in black from the gameplay camera (SPEC §12.2). */
const silhouette = showcase && params.has('silhouette');
const directLevel = showcase
  ? 'training-01'
  : (params.get('level') ?? (params.get('players') === '2' ? defaultLevelId(2) : undefined));
const fixedSeed = params.has('seed') ? Number(params.get('seed')) : undefined;

let world: World;
let scene: SceneView;
let split: SplitScreen;
let bindings: Record<PlayerId, Bindings>;
let players: PlayerId[];
let progress: Progress;
let menu: MenuState = initialMenu();
/** On the menu the world is a still backdrop under a slowly circling camera. */
let inMenu = !directLevel;
let menuAngle = 0;
/** Last beacon colour per player, to chime when it turns green (SPEC §6.4). */
const beacons = new Map<PlayerId, BeaconLight>();
/** Players looking at the map in their bunker (SPEC §9.3), and last tick's Air Fire for each. */
const mapOpen = new Set<PlayerId>();
const lastAir = new Map<PlayerId, boolean>();

function newSeed(): number {
  return fixedSeed ?? Math.floor(Math.random() * 1e9);
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
  render3D.sunDirection = vec3(-0.4, 1, 0.3);
  render3D.shadowRange = 30;
  render3D.setFog(40, 90);
  render3D.onRenderOpaque = () => scene.drawDynamic(players[split.current] ?? 'P1');
  bindings = loadBindings();
  progress = loadProgress();
  startLevel(directLevel ?? selectedLevel(menu) ?? defaultLevelId(1), newSeed());
}

/** A fresh world for a level and everything drawn for it. */
function startLevel(id: string, seed: number) {
  engineObjectsDestroy();
  clearBanners();
  mapOpen.clear();
  beacons.clear();
  const level = (id === 'custom' ? customLevel() : getLevel(id)) ?? getLevel(defaultLevelId(1));
  if (!level) throw new Error(`no level '${id}'`);
  if (showcase) addShowcaseStructures(level);
  world = new World(level, seed);
  players = [...world.players.keys()];
  if (showcase) parkShowcase(world);
  const theme = THEMES[world.level.theme];
  render3D.setSky(...theme.sky, 0.55);
  render3D.sunColor = theme.sun;
  scene = new SceneView(world);
  // the menu shows one view; the game splits the screen for two players
  split.views = (inMenu ? ['P1' as PlayerId] : players).map((p) => new PlayerView(vehiclePos(p)));
  if (params.has('test')) Object.assign(globalThis, { counterfire: { world } });
}

/** The map the level editor's Play button left behind (SPEC §10.5). */
function customLevel(): Level | undefined {
  try {
    const saved = localStorage.getItem(CUSTOM_KEY);
    return saved ? (JSON.parse(saved) as Level) : undefined;
  } catch {
    return undefined;
  }
}

function play(id: string) {
  inMenu = false;
  startLevel(id, newSeed());
}

function backToMenu() {
  inMenu = true;
  setPaused(false);
  const id = selectedLevel(menu) ?? world.level.id;
  startLevel(id, 1);
}

// --- the menu ---

/** One press of a menu control, from P1's keys, the arrows, Enter/Escape or the first gamepad. */
function menuAction(): MenuAction | undefined {
  const k = bindings.P1;
  const any = (codes: string[]) => codes.some((c) => keyWasPressed(c));
  if (any([...k.forward, 'ArrowUp'])) return 'up';
  if (any([...k.back, 'ArrowDown'])) return 'down';
  if (any([...k.left, 'ArrowLeft'])) return 'left';
  if (any([...k.right, 'ArrowRight'])) return 'right';
  // Alt+Enter is full screen, not a menu choice
  const alt = keyIsDown('AltLeft') || keyIsDown('AltRight');
  if (any([...k.fireGround, 'Space']) || (!alt && keyWasPressed('Enter'))) return 'select';
  if (any(['Escape', ...k.fireAir])) return 'back';
  return undefined;
}

/** The last key pressed, for the controls screen to bind; held-key repeats don't count. */
let pressedKey: string | undefined;
document.addEventListener('keydown', (e) => {
  if (!e.repeat) pressedKey = e.code;
});

function updateMenu() {
  const key = pressedKey;
  pressedKey = undefined;
  if (menu.capturing) {
    if (!key) return;
    const action = ACTIONS[menu.row]?.action;
    const player = CONTROL_PLAYERS[menu.col];
    if (key !== 'Escape' && action && player) {
      bindings = rebind(bindings, player, action, key);
      saveBindings(bindings);
    }
    menu = { ...menu, capturing: false };
    playSfx('select');
    return;
  }
  const action = menuAction();
  if (!action) return;
  const before = selectedLevel(menu);
  const { menu: next, start, reset } = menuInput(menu, action, progress);
  menu = next;
  if (reset) {
    bindings = structuredClone(DEFAULT_BINDINGS);
    saveBindings(bindings);
  }
  playSfx(start ? 'elevator' : 'select');
  if (start) play(start);
  else if (menu.screen === 'levels' && selectedLevel(menu) !== before)
    startLevel(selectedLevel(menu) ?? before ?? '', 1);
}

// --- the game ---

function gameUpdate() {
  if (showcase) return; // a still line-up
  if (inMenu) {
    updateMenu();
    return;
  }
  if (keyWasPressed('Escape') && !directLevel) {
    backToMenu();
    return;
  }
  const inputs: Partial<Record<PlayerId, InputFrame>> = {};
  players.forEach((p, i) => {
    inputs[p] = mergeInputs(readInput(bindings[p]), readGamepad(i));
  });
  toggleMaps(inputs);
  world.step(inputs);
  scene.handleEvents(world.events);
  updateBanners(world, world.events);
  for (const e of world.events) {
    if (e.type === 'vehicleDestroyed' && players.some((p) => world.players.get(p)?.vehicle?.id === e.vehicle))
      playSfx('laugh');
    if (e.type !== 'gameOver') continue;
    // two players share one screen, so a win for either sounds like a win
    const won = e.winner !== 'CPU' && e.winner !== 'draw';
    playSfx(won ? 'victory' : 'defeat');
    if (e.winner === 'P1' && world.level.players === 1) {
      progress = recordWin(progress, world.level.id);
      saveProgress(progress);
    }
  }
  chimeBeacons();
  celebrate();

  const o = world.outcome;
  if (o && world.tick - o.tick > GAME_OVER_TICKS) {
    if (players.some((p) => bindings[p].fireGround.some((k) => keyWasPressed(k)))) afterGame();
  }
}

/** What Ground Fire does at the end: the next map after a win, the same map again otherwise. */
function afterGame() {
  const id = world.level.id;
  const won = world.outcome?.winner === 'P1' && world.level.players === 1;
  const next = won ? nextLevel(trackOf(id), id) : undefined;
  if (won && !next && !directLevel) backToMenu();
  else startLevel(next ?? id, newSeed());
}

function endHint(): string {
  const won = world.outcome?.winner === 'P1' && world.level.players === 1;
  if (!won) return world.level.players === 1 ? 'TRY AGAIN' : 'PLAY AGAIN';
  return nextLevel(trackOf(world.level.id), world.level.id) ? 'NEXT MAP' : 'BACK TO MENU';
}

/** Air Fire in the bunker opens and closes the map; leaving the bunker closes it. */
function toggleMaps(inputs: Partial<Record<PlayerId, InputFrame>>) {
  for (const p of players) {
    const air = inputs[p]?.fireAir ?? false;
    const inBunker = world.players.get(p)?.mode === 'bunker';
    if (!inBunker) mapOpen.delete(p);
    else if (air && !lastAir.get(p)) {
      if (mapOpen.has(p)) mapOpen.delete(p);
      else mapOpen.add(p);
    }
    lastAir.set(p, air);
  }
}

/** Fireworks over a win for the first few seconds (SPEC §9.6); no music in v1. */
function celebrate() {
  const o = world.outcome;
  if (!o || o.winner === 'CPU' || o.winner === 'draw') return;
  const t = world.tick - o.tick;
  if (t > 30 && t < 420 && t % 37 === 0) playSfx('firework');
  if (t === 20) playSfx('cheer');
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

/** System keys work even while paused. */
function systemKeys() {
  if (keyWasPressed('F3') && !inMenu) setPaused(!paused);
  if (keyWasPressed('Enter') && (keyIsDown('AltLeft') || keyIsDown('AltRight'))) {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }
}

function gameUpdatePost() {
  systemKeys();
  scene.sync();
  if (showcase) {
    const b = world.player('P1').bunker;
    const view = split.views[0];
    if (view && silhouette) {
      scene.silhouette();
      view.follow(toWorld(b.x + 0.8, b.y + 2));
    } else if (view) {
      view.camera.pos = toWorld(b.x, b.y - 2.5, 4.2);
      view.camera.lookAt(toWorld(b.x, b.y + 2, 0.4));
    }
    return;
  }
  if (inMenu) {
    // circle high over the middle of the selected map
    const view = split.views[0];
    const t = world.terrain;
    menuAngle += 0.002;
    if (view) {
      const r = Math.max(t.w, t.h) * 0.55;
      view.camera.pos = toWorld(
        t.w / 2 + Math.sin(menuAngle) * r,
        t.h / 2 - Math.cos(menuAngle) * r,
        r * 0.8,
      );
      view.camera.lookAt(toWorld(t.w / 2, t.h / 2, 0));
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
  if (showcase) return;
  if (inMenu) {
    drawMenu(mainContext, menu, progress, bindings, mainCanvasSize.x, mainCanvasSize.y);
    return;
  }
  drawHud(world, bindings, mapOpen, endHint());
  if (paused) {
    const ctx = mainContext;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(0, 0, mainCanvasSize.x, mainCanvasSize.y);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED - F3', mainCanvasSize.x / 2, mainCanvasSize.y / 2);
    ctx.restore();
  }
}

engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost);
