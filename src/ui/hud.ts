// Per-player HUD: damage, fuel and ammo (SPEC §9.4). Layout and art are [VERIFY] against the original.

import { mainCanvasSize, mainContext } from 'littlejsengine';
import type { PlayerId } from '../sim/types';
import type { Vehicle } from '../sim/vehicles/vehicle';

const BAR_W = 140;
const BAR_H = 10;

export interface HudSlot {
  player: PlayerId;
  vehicle?: Vehicle;
  /** Message shown in the middle of this player's view. */
  message?: string;
}

/** Draw each slot over its share of the screen, left to right. */
export function drawHud(slots: HudSlot[]): void {
  const ctx = mainContext;
  const slotW = mainCanvasSize.x / slots.length;
  slots.forEach((slot, i) => {
    const x0 = i * slotW;
    ctx.save();
    ctx.font = 'bold 14px monospace';
    ctx.textBaseline = 'middle';
    const v = slot.vehicle;
    const y = mainCanvasSize.y - 70;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(x0 + 12, y - 16, BAR_W + 100, 74);
    ctx.fillStyle = '#fff';
    ctx.fillText(`${slot.player} ${v ? v.type.toUpperCase() : 'IN BUNKER'}`, x0 + 20, y - 4);
    if (v) {
      bar(ctx, x0 + 80, y + 14, 'ARMOR', v.hp / v.tuning.hp, '#d33');
      bar(ctx, x0 + 80, y + 28, 'FUEL', v.fuel / v.tuning.fuel, '#db3');
      bar(ctx, x0 + 80, y + 42, 'AMMO', v.ammo / v.tuning.ammo, '#7c4');
    }
    if (slot.message) {
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#000';
      ctx.fillText(slot.message, x0 + slotW / 2 + 2, mainCanvasSize.y / 2 + 2);
      ctx.fillStyle = '#fff';
      ctx.fillText(slot.message, x0 + slotW / 2, mainCanvasSize.y / 2);
    }
    ctx.restore();
  });
  if (slots.length > 1) {
    ctx.fillStyle = '#000';
    ctx.fillRect(mainCanvasSize.x / 2 - 1, 0, 2, mainCanvasSize.y);
  }
}

function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  value: number,
  color: string,
) {
  ctx.fillStyle = '#ccc';
  ctx.fillText(label, x - 64, y);
  ctx.fillStyle = '#222';
  ctx.fillRect(x, y - BAR_H / 2, BAR_W, BAR_H);
  ctx.fillStyle = color;
  ctx.fillRect(x, y - BAR_H / 2, BAR_W * Math.max(0, Math.min(1, value)), BAR_H);
}
