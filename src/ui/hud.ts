// Per-player overlays: the bunker screen (SPEC §9.2) and the field HUD (SPEC §9.4).
// Layout and art are [VERIFY] against the original.

import { mainCanvasSize, mainContext } from 'littlejsengine';
import type { Bindings } from '../input/bindings';
import { jeepBeacon } from '../sim/beacon';
import { outOfBounds } from '../sim/submarine';
import { BUNKER, GAME_OVER_TICKS } from '../sim/tuning';
import type { PlayerId, Team, VehicleType } from '../sim/types';
import {
  type GameOverReason,
  type PlayerState,
  type SimEvent,
  VEHICLE_ORDER,
  type World,
} from '../sim/world';

const BAR_W = 140;
const BAR_H = 10;

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
export function drawHud(world: World, bindings: Record<PlayerId, Bindings>): void {
  const ctx = mainContext;
  const players = [...world.players.values()];
  const slotW = mainCanvasSize.x / players.length;
  players.forEach((p, i) => {
    const x0 = i * slotW;
    const keys = bindings[p.id];
    ctx.save();
    ctx.font = 'bold 14px monospace';
    ctx.textBaseline = 'middle';
    if (p.mode === 'bunker') drawBunker(ctx, p, x0, slotW, keys);
    else drawField(ctx, world, p, x0, slotW, keys);
    const banner = banners.get(p.id);
    if (banner && banner.until > world.tick)
      centered(ctx, banner.text, x0 + slotW / 2, mainCanvasSize.y * 0.12, 1);
    if (world.outcome) drawGameOver(ctx, world, p, x0, slotW, keys);
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

/** The end of the game: who won, why, and how to play again. The full victory sequence is milestone 6. */
function drawGameOver(ctx: Ctx, world: World, p: PlayerState, x0: number, w: number, keys: Bindings): void {
  const o = world.outcome;
  if (!o) return;
  const h = mainCanvasSize.y;
  ctx.fillStyle = 'rgba(0, 0, 0, .55)';
  ctx.fillRect(x0, 0, w, h);
  const title = o.winner === 'draw' ? 'DRAW' : o.winner === p.id ? 'VICTORY!' : 'DEFEAT';
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 48px monospace';
  ctx.fillStyle = o.winner === p.id ? '#f2d43a' : o.winner === 'draw' ? '#ddd' : '#d44';
  ctx.fillText(title, x0 + w / 2, h * 0.4);
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#eee';
  ctx.fillText(REASONS[o.reason], x0 + w / 2, h * 0.4 + 46);
  if (world.tick - o.tick > GAME_OVER_TICKS) {
    ctx.font = '16px monospace';
    ctx.fillText(`${keyLabel(keys.fireGround[0])} TO PLAY AGAIN`, x0 + w / 2, h * 0.4 + 84);
  }
  ctx.restore();
}

function drawBunker(ctx: Ctx, p: PlayerState, x0: number, w: number, keys: Bindings): void {
  const h = mainCanvasSize.y;
  ctx.fillStyle = 'rgba(12, 16, 14, .82)';
  ctx.fillRect(x0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#dcd6b8';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(`${p.id} BUNKER`, x0 + w / 2, h * 0.22);

  const slotW = Math.min(150, (w - 40) / 4);
  const box = slotW - 12;
  const left = x0 + w / 2 - slotW * 2;
  const sy = h * 0.35;
  VEHICLE_ORDER.forEach((type, i) => {
    const sx = left + i * slotW + 6;
    const count = p.stock[type];
    const selected = i === p.selected;
    ctx.fillStyle = selected ? '#4a5a2a' : '#22261e';
    ctx.fillRect(sx, sy, box, box);
    ctx.strokeStyle = selected ? '#e8d23a' : '#555';
    ctx.lineWidth = selected ? 3 : 1;
    ctx.strokeRect(sx, sy, box, box);
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = count ? '#eee' : '#666';
    ctx.fillText(VEHICLE_NAMES[type], sx + box / 2, sy + box / 2 - 8);
    ctx.fillText(count ? `x${count}` : 'EMPTY', sx + box / 2, sy + box / 2 + 12);
    if (!count) {
      // a type with no stock left shows as an empty slot (SPEC §9.2)
      ctx.strokeStyle = '#a33';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx + 6, sy + 6);
      ctx.lineTo(sx + box - 6, sy + box - 6);
      ctx.stroke();
    }
  });

  ctx.font = '14px monospace';
  ctx.fillStyle = '#bbb';
  const choose = `${keyLabel(keys.left[0])}/${keyLabel(keys.right[0])} choose`;
  ctx.fillText(`${choose}   ${keyLabel(keys.fireGround[0])} deploy`, x0 + w / 2, sy + slotW + 20);
}

function drawField(ctx: Ctx, world: World, p: PlayerState, x0: number, w: number, keys: Bindings): void {
  const v = p.vehicle;
  const h = mainCanvasSize.y;
  if (v?.state !== 'active') {
    const lost = v?.state === 'abandoned' ? 'OUT OF FUEL - DRIVER BAILED OUT' : 'VEHICLE LOST';
    // the laughing skull goes here in milestone 6
    centered(ctx, lost, x0 + w / 2, h / 2, p.lostTimer / BUNKER.lostDelay);
    return;
  }

  const y = h - 84;
  const extra = vehicleExtras(world, p);
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fillRect(x0 + 12, y - 16, BAR_W + 100, 74 + (extra ? 16 : 0));
  ctx.fillStyle = '#fff';
  ctx.fillText(`${p.id} ${VEHICLE_NAMES[v.type]}`, x0 + 20, y - 4);
  bar(ctx, x0 + 84, y + 14, 'ARMOR', v.hp / v.tuning.hp, '#d33');
  bar(ctx, x0 + 84, y + 28, 'FUEL', v.fuel / v.tuning.fuel, '#db3');
  bar(ctx, x0 + 84, y + 42, 'AMMO', v.ammo / v.tuning.ammo, '#7c4');
  if (extra) {
    ctx.fillStyle = '#ccc';
    ctx.fillText(extra, x0 + 20, y + 58);
  }
  if (v.type === 'jeep') drawBeacon(ctx, jeepBeacon(world, v), x0 + BAR_W + 92, y - 4);
  if (v.resupplying) centered(ctx, 'RESUPPLYING', x0 + w / 2, h * 0.2, 1);
  const warning = dangerWarning(world, p);
  if (warning) centered(ctx, warning, x0 + w / 2, h * 0.3, (world.tick >> 4) % 2 ? 1 : 0.5);
  if (v.onBunker)
    centered(ctx, `BUNKER LIGHT ON - ${keyLabel(keys.fireGround[0])} TO GO DOWN`, x0 + w / 2, h * 0.2, 1);
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

function vehicleExtras(world: World, p: PlayerState): string | undefined {
  const v = p.vehicle;
  if (!v) return undefined;
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

function bar(ctx: Ctx, x: number, y: number, label: string, value: number, color: string) {
  ctx.fillStyle = '#ccc';
  ctx.fillText(label, x - 64, y);
  ctx.fillStyle = '#222';
  ctx.fillRect(x, y - BAR_H / 2, BAR_W, BAR_H);
  ctx.fillStyle = color;
  ctx.fillRect(x, y - BAR_H / 2, BAR_W * Math.max(0, Math.min(1, value)), BAR_H);
}
