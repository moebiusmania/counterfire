// Per-player overlays: the bunker screen and map (SPEC §9.2, §9.3), the field dashboard with radar
// (SPEC §9.4, §9.5), the skull (SPEC §9.6) and the end of the game.
// Layout and art are [VERIFY] against the original.

import { mainCanvasSize, mainContext } from 'littlejsengine';
import type { Action, Bindings } from '../input/bindings';
import { jeepBeacon } from '../sim/beacon';
import { outOfBounds } from '../sim/submarine';
import { BUNKER, GAME_OVER_TICKS } from '../sim/tuning';
import type { PlayerId, Team, VehicleType } from '../sim/types';
import type { Vehicle } from '../sim/vehicles/vehicle';
import {
  type GameOverReason,
  type PlayerState,
  type SimEvent,
  TICK_RATE,
  VEHICLE_ORDER,
  VEHICLE_SKINS,
  type World,
} from '../sim/world';
import { hasRadar } from './intel';
import { drawMapScreen } from './mapscreen';
import { HUD, TEAM_CSS } from './palette';
import { drawRadar } from './radar';
import { drawSkull } from './skull';
import { drawTickerTape } from './victory';

const VEHICLE_NAMES: Record<VehicleType, string> = {
  tank: 'TANK',
  asv: 'ASV',
  heli: 'HELICOPTER',
  jeep: 'JEEP',
};

/** A short label for a key code: KeyA -> A, Numpad4 -> Num4, NumpadSubtract -> Num-. */
export function keyLabel(code: string | undefined): string {
  if (!code) return '?';
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace('NumpadSubtract', 'Num-')
    .replace('NumpadAdd', 'Num+')
    .replace('NumpadEnter', 'NumEnter')
    .replace(/^Numpad/, 'Num');
}

type Ctx = CanvasRenderingContext2D;
export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}

/** Ticks a banner stays up. */
const BANNER_TICKS = 180;
const banners = new Map<PlayerId, { text: string; until: number }>();

/** Turn this tick's flag events into a banner for each player they concern (SPEC §7). */
export function updateBanners(world: World, events: readonly SimEvent[]): void {
  const say = (player: PlayerId, text: string) =>
    banners.set(player, { text, until: world.tick + BANNER_TICKS });
  const own = (p: PlayerId, team: Team) => p === team;
  for (const e of events) {
    for (const p of world.players.keys()) {
      switch (e.type) {
        case 'flagExposed':
          say(p, own(p, e.team) ? 'YOUR FLAG HAS BEEN FOUND!' : 'ENEMY FLAG EXPOSED!');
          break;
        case 'flagPickedUp':
          if (e.by === p)
            say(p, own(p, e.team) ? 'YOU HAVE YOUR FLAG - HIDE IT' : 'YOU HAVE THE FLAG - BRING IT HOME!');
          else if (own(p, e.team)) say(p, 'THE ENEMY HAS YOUR FLAG!');
          break;
        case 'flagDropped':
          if (own(p, e.team)) say(p, 'YOUR FLAG IS ON THE GROUND');
          else say(p, 'THE ENEMY FLAG IS DOWN');
          break;
        case 'flagReturned':
          if (own(p, e.team)) say(p, 'FLAG HIDDEN IN A NEW TOWER');
          break;
        default:
          break;
      }
    }
  }
}

export function clearBanners(): void {
  banners.clear();
}

/** Draw each player's overlay over their share of the screen, left to right. */
export function drawHud(
  world: World,
  bindings: Record<PlayerId, Bindings>,
  mapOpen: ReadonlySet<PlayerId>,
  /** What Ground Fire does once the game is over: next map, try again, play again. */
  endHint = 'PLAY AGAIN',
  /** Where each bunker bay's caption goes on screen, over the 3D hangar. */
  bunkerSlots: (player: PlayerId, area: Area) => readonly Point[] = () => [],
  options: {
    /** Players with a gamepad, whose controls legend names its buttons instead of keys. */
    pads?: ReadonlySet<PlayerId>;
    /** Dashboards along the top, clear of on-screen controls in the bottom corners. */
    dashboardTop?: boolean;
  } = {},
): void {
  const ctx = mainContext;
  const players = [...world.players.values()];
  const slotW = mainCanvasSize.x / players.length;
  players.forEach((p, i) => {
    const area = { x: i * slotW, y: 0, w: slotW, h: mainCanvasSize.y };
    const keys = bindings[p.id];
    ctx.save();
    ctx.font = HUD.font;
    ctx.textBaseline = 'middle';
    if (world.outcome) drawGameOver(ctx, world, p, area, keys, endHint);
    else if (p.mode === 'bunker' && mapOpen.has(p.id))
      drawMapScreen(ctx, world, p.id, area, `${keyLabel(keys.fireAir[0])} back to the bunker`);
    else if (p.mode === 'bunker') drawBunker(ctx, p, area, keys, bunkerSlots(p.id, area));
    else drawField(ctx, world, p, area, keys, !!options.pads?.has(p.id), !!options.dashboardTop);
    const banner = banners.get(p.id);
    if (!world.outcome && banner && banner.until > world.tick)
      centered(
        ctx,
        banner.text,
        area.x + area.w / 2,
        Math.max(area.h * 0.12, options.dashboardTop ? 136 : 0),
        1,
      );
    ctx.restore();
  });
  if (players.length > 1) {
    ctx.fillStyle = '#000';
    ctx.fillRect(mainCanvasSize.x / 2 - 1, 0, 2, mainCanvasSize.y);
  }
}

const REASONS: Record<GameOverReason, string> = {
  flagCaptured: 'THE FLAG WAS CAPTURED',
  outOfVehicles: 'OUT OF VEHICLES',
  outOfJeeps: 'NO JEEPS LEFT TO CARRY THE FLAG',
  stalemate: 'NEITHER SIDE CAN CARRY A FLAG',
};

/** The end of the game: ticker tape for the winner, then who won, why, and how to play again. */
function drawGameOver(
  ctx: Ctx,
  world: World,
  p: PlayerState,
  area: Area,
  keys: Bindings,
  hint: string,
): void {
  const o = world.outcome;
  if (!o) return;
  const t = (world.tick - o.tick) / TICK_RATE;
  const won = o.winner === p.id;
  ctx.fillStyle = won ? 'rgba(0, 0, 0, .3)' : 'rgba(0, 0, 0, .6)';
  ctx.fillRect(area.x, area.y, area.w, area.h);
  if (won) drawTickerTape(ctx, area, t);
  const title = o.winner === 'draw' ? 'DRAW' : won ? 'VICTORY!' : 'DEFEAT';
  const cx = area.x + area.w / 2;
  const cy = area.h * 0.4;
  ctx.save();
  ctx.textAlign = 'center';
  const pop = won ? 1 + Math.max(0, 0.4 - t) : 1;
  ctx.font = `bold ${Math.round(52 * pop)}px monospace`;
  ctx.fillStyle = '#000';
  ctx.fillText(title, cx + 3, cy + 3);
  ctx.fillStyle = won ? '#f2d43a' : o.winner === 'draw' ? '#ddd' : '#d44';
  ctx.fillText(title, cx, cy);
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#eee';
  ctx.fillText(REASONS[o.reason], cx, cy + 46);
  if (world.tick - o.tick > GAME_OVER_TICKS) {
    ctx.font = '16px monospace';
    ctx.fillText(`${keyLabel(keys.fireGround[0])} ${hint}   ESC MENU`, cx, cy + 84);
  }
  ctx.restore();
}

/** Captions over the 3D hangar (render/hangar.ts): each bay's vehicle and stock, the controls. */
function drawBunker(ctx: Ctx, p: PlayerState, area: Area, keys: Bindings, slots: readonly Point[]): void {
  const { x: x0, w, h } = area;
  ctx.textAlign = 'center';
  shadowed(ctx, `${p.id} BUNKER`, x0 + w / 2, h * 0.08, HUD.text, 'bold 22px monospace');
  ctx.fillStyle = TEAM_CSS[p.id];
  ctx.fillRect(x0 + w / 2 - 60, h * 0.08 + 18, 120, 3);

  const size = Math.max(10, Math.min(15, Math.round(w / 60)));
  VEHICLE_ORDER.forEach((type, i) => {
    const at = slots[i];
    if (!at) return;
    const count = p.stock[type];
    const selected = i === p.selected;
    const color = selected ? '#f2d43a' : count ? HUD.text : '#777';
    const name = selected ? `> ${VEHICLE_NAMES[type]} <` : VEHICLE_NAMES[type];
    shadowed(ctx, name, at.x, at.y + size, color, `bold ${size}px monospace`);
    // a type with no stock left shows as an empty bay (SPEC §9.2)
    shadowed(
      ctx,
      count ? `x${count}` : 'EMPTY',
      at.x,
      at.y + size * 2.3,
      count ? color : '#c44',
      `${size}px monospace`,
    );
    const skins = VEHICLE_SKINS[type];
    if (skins.length > 1) {
      const skin = (skins[p.skins[type]] ?? '').toUpperCase();
      shadowed(ctx, selected ? `< ${skin} >` : skin, at.x, at.y + size * 3.5, HUD.dim, `${size}px monospace`);
    }
  });

  const choose = `${keyLabel(keys.left[0])}/${keyLabel(keys.right[0])} choose`;
  const skin = `${keyLabel(keys.forward[0])}/${keyLabel(keys.back[0])} skin`;
  const deploy = `${keyLabel(keys.fireGround[0])} deploy`;
  const map = `${keyLabel(keys.fireAir[0])} map`;
  shadowed(ctx, `${choose}   ${skin}   ${deploy}   ${map}`, x0 + w / 2, h * 0.94, HUD.dim, '14px monospace');
}

function shadowed(ctx: Ctx, text: string, x: number, y: number, color: string, font: string): void {
  ctx.font = font;
  ctx.fillStyle = '#000';
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawField(
  ctx: Ctx,
  world: World,
  p: PlayerState,
  area: Area,
  keys: Bindings,
  pad: boolean,
  top: boolean,
): void {
  const v = p.vehicle;
  const { x: x0, w, h } = area;
  if (v?.state !== 'active') {
    const t = (BUNKER.lostDelay - p.lostTimer) / TICK_RATE;
    if (v?.state === 'destroyed') drawSkull(ctx, x0 + w / 2, h * 0.45, Math.min(w, h) * 0.35, t);
    else centered(ctx, 'OUT OF FUEL - DRIVER BAILED OUT', x0 + w / 2, h / 2, p.lostTimer / BUNKER.lostDelay);
    return;
  }

  const y = top ? 12 : h - 108;
  // messages keep below dashboards along the top
  const below = (share: number) => Math.max(h * share, top ? 136 + (share - 0.2) * 200 : 0);
  const panelW = drawDashboard(ctx, world, p, v, x0 + 12, y);
  drawControls(ctx, vehicleControls(world, v), keys, pad, x0 + 12 + panelW + 8, y);
  if (v.resupplying) centered(ctx, 'RESUPPLYING', x0 + w / 2, below(0.2), 1);
  const warning = dangerWarning(world, p);
  if (warning) centered(ctx, warning, x0 + w / 2, below(0.3), (world.tick >> 4) % 2 ? 1 : 0.5);
  if (v.onBunker)
    centered(ctx, `BUNKER LIGHT ON - ${keyLabel(keys.fireGround[0])} TO GO DOWN`, x0 + w / 2, below(0.2), 1);
}

/** The dashboard: name plate, gauges, extras, and the radar scope or the jeep's beacon. Returns its width. */
function drawDashboard(ctx: Ctx, world: World, p: PlayerState, v: Vehicle, x: number, y: number): number {
  const radar = hasRadar(v);
  const panelW = radar ? 330 : 250;
  const panelH = 96;
  ctx.save();
  ctx.fillStyle = HUD.panel;
  ctx.strokeStyle = HUD.edge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, panelW, panelH, 6);
  ctx.fill();
  ctx.stroke();
  // rivets
  ctx.fillStyle = HUD.edge;
  for (const [rx, ry] of [
    [x + 6, y + 6],
    [x + panelW - 6, y + 6],
    [x + 6, y + panelH - 6],
    [x + panelW - 6, y + panelH - 6],
  ] as const) {
    ctx.beginPath();
    ctx.arc(rx, ry, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = TEAM_CSS[p.id];
  ctx.fillRect(x + 12, y + 10, 4, 14);
  ctx.fillStyle = HUD.text;
  ctx.font = HUD.font;
  ctx.textAlign = 'left';
  ctx.fillText(`${p.id} ${VEHICLE_NAMES[v.type]}`, x + 22, y + 17);

  gauge(ctx, x + 14, y + 36, 'ARMOR', v.hp / v.tuning.hp, '#d8473a');
  gauge(ctx, x + 14, y + 52, 'FUEL', v.fuel / v.tuning.fuel, '#e0b73a');
  gauge(ctx, x + 14, y + 68, 'AMMO', v.ammo / v.tuning.ammo, '#7cc44a');
  const extra = vehicleExtras(world, v);
  if (extra) {
    ctx.fillStyle = HUD.dim;
    ctx.font = '12px monospace';
    ctx.fillText(extra, x + 14, y + 85);
  }
  ctx.restore();

  if (radar) drawRadar(ctx, world, v, x + panelW - 50, y + panelH / 2, 42);
  if (v.type === 'jeep') drawBeacon(ctx, jeepBeacon(world, v), x + panelW - 22, y + 17);
  return panelW;
}

/** A control on the legend: the actions pressed together, and what they do. */
export interface Control {
  actions: Action[];
  label: string;
}

/** The vehicle's controls other than driving, for the legend beside the dashboard. */
export function vehicleControls(world: World, v: Vehicle): Control[] {
  const controls: Control[] = [];
  const add = (label: string, ...actions: Action[]) => controls.push({ actions, label });
  switch (v.type) {
    case 'tank':
      add('FIRE', 'fireGround');
      add('TURRET', 'auxLeft', 'auxRight');
      add('CENTRE TURRET', 'switch');
      break;
    case 'asv':
      add('ROCKETS', 'fireGround');
      if (world.minesAllowed) add('LAY MINE', 'fireAir');
      break;
    case 'heli':
      add(v.weapon === 'gun' ? 'FIRE GUN' : 'FIRE ROCKETS', 'fireGround');
      add('STRAFE', 'auxLeft', 'auxRight');
      add('SWITCH WEAPON', 'switch');
      break;
    case 'jeep':
      add('GRENADE', 'fireGround');
      add(v.tyresInflated ? 'TYRES DOWN' : 'TYRES UP', 'fireAir');
      if (world.carriedBy(v)) add('DROP FLAG', 'switch');
      break;
  }
  add('SELF-DESTRUCT', 'fireGround', 'fireAir', 'switch');
  return controls;
}

/** The standard pad's button for each action that has one (SPEC §13.2). */
const PAD_BUTTONS: Partial<Record<Action, string>> = {
  auxLeft: 'LB',
  auxRight: 'RB',
  fireGround: 'A',
  fireAir: 'B',
  switch: 'X',
};

/** The legend: a key cap per control, with what it does. */
function drawControls(
  ctx: Ctx,
  controls: Control[],
  keys: Bindings,
  pad: boolean,
  x: number,
  y: number,
): void {
  const name = (a: Action) => (pad ? (PAD_BUTTONS[a] ?? '?') : keyLabel(keys[a][0]));
  ctx.save();
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const rows = controls.map((c) => ({ cap: c.actions.map(name).join('+'), label: c.label }));
  const capW = Math.max(...rows.map((r) => ctx.measureText(r.cap).width)) + 10;
  const panelW = capW + Math.max(...rows.map((r) => ctx.measureText(r.label).width)) + 24;
  ctx.fillStyle = HUD.panel;
  ctx.strokeStyle = HUD.edge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, panelW, 96, 6);
  ctx.fill();
  ctx.stroke();
  const step = Math.min(18, 80 / rows.length);
  rows.forEach((r, i) => {
    const ry = y + 12 + step * (i + 0.5);
    ctx.fillStyle = '#2b2d22';
    ctx.strokeStyle = HUD.edge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x + 8, ry - 7, capW, 14, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = HUD.text;
    ctx.textAlign = 'center';
    ctx.fillText(r.cap, x + 8 + capW / 2, ry + 1);
    ctx.fillStyle = HUD.dim;
    ctx.textAlign = 'left';
    ctx.fillText(r.label, x + capW + 16, ry + 1);
  });
  ctx.restore();
}

/** A segmented gauge, like a row of indicator lamps. */
function gauge(ctx: Ctx, x: number, y: number, label: string, value: number, color: string): void {
  const segments = 16;
  const lit = Math.ceil(Math.max(0, Math.min(1, value)) * segments);
  ctx.fillStyle = HUD.dim;
  ctx.font = '11px monospace';
  ctx.fillText(label, x, y);
  for (let i = 0; i < segments; i++) {
    ctx.fillStyle = i < lit ? (value < 0.25 && i === lit - 1 ? '#fff' : color) : '#2b2d22';
    ctx.fillRect(x + 50 + i * 10, y - 4, 8, 8);
  }
}

/** The submarine and its heat-seeker, worst first (SPEC §8.4). */
function dangerWarning(world: World, p: PlayerState): string | undefined {
  const v = p.vehicle;
  if (!v) return undefined;
  if (world.shots.some((s) => s.kind === 'subMissile' && s.target === v.id))
    return 'HEAT-SEEKER ON YOUR TAIL!';
  const sub = world.submarine;
  if (sub.culprit === v.id && (sub.state === 'surfacing' || sub.state === 'aiming'))
    return 'SUBMARINE SURFACING!';
  if (outOfBounds(world, v.x, v.y)) return 'DESERTER! RETURN TO YOUR SECTOR';
  return undefined;
}

function vehicleExtras(world: World, v: Vehicle): string | undefined {
  switch (v.type) {
    case 'heli':
      return `WEAPON ${v.weapon === 'gun' ? 'GUN' : 'ROCKETS'}  ROCKETS ${v.rockets}`;
    case 'asv':
      return world.minesAllowed ? `MINES ${v.mines}` : undefined;
    case 'jeep': {
      const flag = world.carriedBy(v);
      const carrying = flag ? `  FLAG: ${flag.team === v.team ? 'OURS' : 'ENEMY'}` : '';
      return `TYRES ${v.tyresInflated ? 'UP' : 'DOWN'}  GRENADES ${v.ammo}${carrying}`;
    }
    default:
      return undefined;
  }
}

/** The dashboard beacon: a lamp that glows green toward the exposed enemy flag, red toward home. */
function drawBeacon(ctx: Ctx, light: 'green' | 'red' | 'off', x: number, y: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fillStyle = light === 'green' ? '#3f3' : light === 'red' ? '#f33' : '#333';
  if (light !== 'off') {
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 12;
  }
  ctx.fill();
  ctx.restore();
}

function centered(ctx: Ctx, text: string, x: number, y: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0.3, Math.min(1, alpha));
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000';
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x, y);
  ctx.restore();
}
