// The title menu and level lists (SPEC §5.1): pick Training, Tournament or Two Players, then a
// map. Locked tournament maps open as the one before is won. Controls rebinds keys (SPEC §13.1).

import { isUnlocked, type Progress, type Track, trackIds } from '../game/progress';
import { ACTIONS, type Bindings } from '../input/bindings';
import { getLevel, LEVELS } from '../levels';
import type { Level } from '../levels/schema';
import type { PlayerId } from '../sim/types';
import { keyLabel } from './hud';
import { HUD, MAP_TILE_CSS } from './palette';

export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'select' | 'back';

export interface MenuState {
  screen: 'title' | 'levels' | 'controls';
  /** Highlighted title item, an index into TRACKS, or TRACKS.length for Controls. */
  item: number;
  track: Track;
  /** Highlighted map in the track's list. */
  level: number;
  /** Controls screen: the highlighted action (ACTIONS.length is Reset) and player column. */
  row: number;
  col: number;
  /** Controls screen: waiting for the key to bind to the highlighted action. */
  capturing: boolean;
}

export const CONTROL_PLAYERS: PlayerId[] = ['P1', 'P2'];

export const TRACKS: { track: Track; label: string; blurb: string }[] = [
  { track: 'training', label: 'TRAINING', blurb: 'Six lessons, one for each skill' },
  { track: 'tournament', label: 'TOURNAMENT', blurb: 'Nine tiers of six maps against the CPU' },
  { track: 'duel', label: 'TWO PLAYERS', blurb: 'Split-screen battles on mirrored maps' },
];

export function initialMenu(): MenuState {
  return { screen: 'title', item: 0, track: 'training', level: 0, row: 0, col: 0, capturing: false };
}

/** The level a menu state points at. */
export function selectedLevel(m: MenuState): string | undefined {
  return trackIds(m.track)[m.level];
}

/**
 * Apply one menu action; `start` is set when a map is chosen to play, `reset` when the controls
 * should go back to the defaults.
 */
export function menuInput(
  m: MenuState,
  action: MenuAction,
  progress: Progress,
): { menu: MenuState; start?: string; reset?: boolean } {
  if (m.screen === 'title') {
    const n = TRACKS.length + 1;
    if (action === 'up') return { menu: { ...m, item: (m.item + n - 1) % n } };
    if (action === 'down') return { menu: { ...m, item: (m.item + 1) % n } };
    if (action === 'select' && m.item === TRACKS.length)
      return { menu: { ...m, screen: 'controls', row: 0, col: 0, capturing: false } };
    if (action === 'select') {
      const track = TRACKS[m.item]?.track ?? 'training';
      // open the list on the first map not yet won, so "continue" is one press away
      const ids = trackIds(track);
      const first = ids.findIndex((id) => !progress.won.includes(id) && isUnlocked(progress, track, id));
      return { menu: { ...m, screen: 'levels', track, level: Math.max(0, first) } };
    }
    return { menu: m };
  }
  if (m.screen === 'controls') return controlsInput(m, action);
  const ids = trackIds(m.track);
  const step =
    action === 'up' ? -1 : action === 'down' ? 1 : action === 'left' ? -6 : action === 'right' ? 6 : 0;
  if (step) return { menu: { ...m, level: Math.max(0, Math.min(ids.length - 1, m.level + step)) } };
  if (action === 'back') return { menu: { ...m, screen: 'title' } };
  if (action === 'select') {
    const id = ids[m.level];
    if (id && isUnlocked(progress, m.track, id)) return { menu: m, start: id };
  }
  return { menu: m };
}

function controlsInput(m: MenuState, action: MenuAction): { menu: MenuState; reset?: boolean } {
  const rows = ACTIONS.length + 1;
  if (action === 'up') return { menu: { ...m, row: (m.row + rows - 1) % rows } };
  if (action === 'down') return { menu: { ...m, row: (m.row + 1) % rows } };
  if (action === 'left' || action === 'right') return { menu: { ...m, col: action === 'left' ? 0 : 1 } };
  if (action === 'back') return { menu: { ...m, screen: 'title' } };
  if (action === 'select' && m.row === ACTIONS.length) return { menu: m, reset: true };
  if (action === 'select') return { menu: { ...m, capturing: true } };
  return { menu: m };
}

type Ctx = CanvasRenderingContext2D;

export function drawMenu(
  ctx: Ctx,
  m: MenuState,
  progress: Progress,
  bindings: Record<PlayerId, Bindings>,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 12, 10, .55)';
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  // the title, stencilled
  ctx.font = 'bold 64px monospace';
  ctx.fillStyle = '#000';
  ctx.fillText('COUNTERFIRE', w / 2 + 4, h * 0.14 + 4);
  ctx.fillStyle = '#e8d23a';
  ctx.fillText('COUNTERFIRE', w / 2, h * 0.14);
  if (m.screen === 'title') drawTitle(ctx, m, w, h);
  else if (m.screen === 'controls') drawControls(ctx, m, bindings, w, h);
  else drawLevels(ctx, m, progress, w, h);
  ctx.restore();
}

function drawTitle(ctx: Ctx, m: MenuState, w: number, h: number): void {
  [...TRACKS, { label: 'CONTROLS', blurb: 'Change the keys for each player' }].forEach((t, i) => {
    const y = h * 0.42 + i * 64;
    const on = i === m.item;
    ctx.fillStyle = on ? 'rgba(74, 90, 42, .9)' : 'rgba(20, 24, 16, .8)';
    ctx.fillRect(w / 2 - 210, y - 26, 420, 52);
    ctx.strokeStyle = on ? '#e8d23a' : HUD.edge;
    ctx.lineWidth = on ? 3 : 1;
    ctx.strokeRect(w / 2 - 210, y - 26, 420, 52);
    ctx.fillStyle = on ? '#fff' : HUD.text;
    ctx.font = 'bold 22px monospace';
    ctx.fillText(t.label, w / 2, y - 6);
    ctx.font = '12px monospace';
    ctx.fillStyle = HUD.dim;
    ctx.fillText(t.blurb, w / 2, y + 14);
  });
  ctx.font = '14px monospace';
  ctx.fillStyle = HUD.dim;
  ctx.fillText('W/S or arrows choose   H or Enter select', w / 2, h * 0.42 + (TRACKS.length + 1) * 64 + 20);
}

function drawControls(
  ctx: Ctx,
  m: MenuState,
  bindings: Record<PlayerId, Bindings>,
  w: number,
  h: number,
): void {
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = HUD.text;
  ctx.fillText('CONTROLS', w / 2, h * 0.24);
  const rowH = Math.min(30, (h * 0.56) / (ACTIONS.length + 2));
  const top = h * 0.3;
  const colX = [w / 2 + 40, w / 2 + 200];
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = HUD.dim;
  CONTROL_PLAYERS.forEach((p, c) => {
    ctx.fillText(p === 'P1' ? 'PLAYER 1' : 'PLAYER 2', colX[c] ?? 0, top);
  });
  ACTIONS.forEach(({ action, label }, r) => {
    const y = top + (r + 1) * rowH;
    ctx.textAlign = 'right';
    ctx.fillStyle = r === m.row ? '#fff' : HUD.text;
    ctx.fillText(label, w / 2 - 50, y);
    ctx.textAlign = 'center';
    CONTROL_PLAYERS.forEach((p, c) => {
      const x = colX[c] ?? 0;
      const on = r === m.row && c === m.col;
      if (on) {
        ctx.fillStyle = m.capturing ? 'rgba(160, 120, 20, .9)' : 'rgba(74, 90, 42, .9)';
        ctx.fillRect(x - 70, y - rowH / 2 + 2, 140, rowH - 4);
      }
      ctx.fillStyle = on ? '#fff' : HUD.text;
      ctx.fillText(on && m.capturing ? 'PRESS A KEY' : keyLabel(bindings[p][action][0]), x, y);
    });
  });
  const resetY = top + (ACTIONS.length + 1.5) * rowH;
  if (m.row === ACTIONS.length) {
    ctx.fillStyle = 'rgba(74, 90, 42, .9)';
    ctx.fillRect(w / 2 - 110, resetY - rowH / 2 + 2, 220, rowH - 4);
  }
  ctx.fillStyle = m.row === ACTIONS.length ? '#fff' : HUD.text;
  ctx.fillText('RESET TO DEFAULTS', w / 2, resetY);
  ctx.font = '14px monospace';
  ctx.fillStyle = HUD.dim;
  const hint = m.capturing
    ? 'Press the new key   Esc cancel'
    : 'W/S choose   A/D player   H or Enter change   Esc back';
  ctx.fillText(hint, w / 2, h * 0.92);
}

function drawLevels(ctx: Ctx, m: MenuState, progress: Progress, w: number, h: number): void {
  const ids = trackIds(m.track);
  const label = TRACKS.find((t) => t.track === m.track)?.label ?? '';
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = HUD.text;
  ctx.fillText(label, w / 2, h * 0.24);

  // the list on the left, a window round the selection
  const rows = Math.max(6, Math.floor((h * 0.6) / 26));
  const first = Math.max(0, Math.min(ids.length - rows, m.level - Math.floor(rows / 2)));
  const listX = Math.max(20, w / 2 - 380);
  ctx.textAlign = 'left';
  for (let i = first; i < Math.min(ids.length, first + rows); i++) {
    const id = ids[i] as string;
    const level = LEVELS[id];
    if (!level) continue;
    const y = h * 0.32 + (i - first) * 26;
    const open = isUnlocked(progress, m.track, id);
    const won = progress.won.includes(id);
    if (i === m.level) {
      ctx.fillStyle = 'rgba(74, 90, 42, .9)';
      ctx.fillRect(listX - 8, y - 12, 360, 24);
    }
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = open ? (i === m.level ? '#fff' : HUD.text) : '#666';
    const tier = level.tier ? `T${level.tier} ` : '';
    ctx.fillText(`${tier}${level.name.toUpperCase()}`, listX, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = won ? '#7cc44a' : open ? HUD.dim : '#666';
    ctx.fillText(won ? 'WON' : open ? '' : 'LOCKED', listX + 344, y);
    ctx.textAlign = 'left';
  }

  const id = ids[m.level];
  const level = id ? getLevel(id) : undefined;
  if (level) drawPreview(ctx, level, w / 2 + 10, h * 0.3, Math.min(360, w / 2 - 40), h * 0.5);

  ctx.textAlign = 'center';
  ctx.font = '14px monospace';
  ctx.fillStyle = HUD.dim;
  ctx.fillText('W/S choose   A/D page   H or Enter play   Esc back', w / 2, h * 0.92);
}

/** A small chart of the map with its facts underneath. */
function drawPreview(ctx: Ctx, level: Level, x: number, y: number, maxW: number, maxH: number): void {
  const rows = level.tiles;
  const tw = rows[0]?.length ?? 1;
  const th = rows.length;
  const k = Math.min(maxW / tw, (maxH - 60) / th);
  ctx.fillStyle = '#0b1218';
  ctx.fillRect(x - 4, y - 4, tw * k + 8, th * k + 8);
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      ctx.fillStyle = MAP_TILE_CSS[row[c] as keyof typeof MAP_TILE_CSS] ?? '#000';
      ctx.fillRect(x + c * k, y + r * k, Math.ceil(k), Math.ceil(k));
    }
  });
  const s = level.stock.P1;
  ctx.textAlign = 'left';
  ctx.font = '13px monospace';
  ctx.fillStyle = HUD.text;
  const towers = level.entities.filter((e) => e.type === 'flagTower').length;
  const turrets = level.entities.filter((e) => e.type === 'turret').length;
  ctx.fillText(
    `${level.theme.toUpperCase()}  ${tw}x${th}  TOWERS ${towers}  TURRETS ${turrets}`,
    x,
    y + th * k + 20,
  );
  if (s) ctx.fillText(`TANK ${s.tank}  ASV ${s.asv}  HELI ${s.heli}  JEEP ${s.jeep}`, x, y + th * k + 40);
}
