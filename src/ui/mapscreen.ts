// The bunker map (SPEC §9.3): the whole battlefield as the IGD sees it, terrain as it is now.

import type { Terrain } from '../sim/terrain';
import type { PlayerId } from '../sim/types';
import type { World } from '../sim/world';
import { mapMarkers } from './intel';
import { HUD, MAP_TILE_CSS, TEAM_CSS } from './palette';

type Ctx = CanvasRenderingContext2D;

/** One pixel per tile, redrawn only when the terrain changes. */
let cache: { terrain: Terrain; version: number; canvas: OffscreenCanvas } | undefined;

function terrainImage(t: Terrain): OffscreenCanvas {
  if (cache?.terrain === t && cache.version === t.version) return cache.canvas;
  const canvas = new OffscreenCanvas(t.w, t.h);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        ctx.fillStyle = MAP_TILE_CSS[t.get(x, y)];
        ctx.fillRect(x, t.h - 1 - y, 1, 1);
      }
    }
  }
  cache = { terrain: t, version: t.version, canvas };
  return canvas;
}

export function drawMapScreen(
  ctx: Ctx,
  world: World,
  viewer: PlayerId,
  area: { x: number; y: number; w: number; h: number },
  closeHint: string,
): void {
  const t = world.terrain;
  ctx.save();
  ctx.fillStyle = '#0b1218';
  ctx.fillRect(area.x, area.y, area.w, area.h);
  const scale = Math.floor(Math.min((area.w - 40) / t.w, (area.h - 90) / t.h) * 10) / 10;
  const mw = t.w * scale;
  const mh = t.h * scale;
  const ox = area.x + (area.w - mw) / 2;
  const oy = area.y + 50;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(terrainImage(t), ox, oy, mw, mh);
  ctx.strokeStyle = HUD.edge;
  ctx.lineWidth = 2;
  ctx.strokeRect(ox - 1, oy - 1, mw + 2, mh + 2);

  const px = (x: number) => ox + x * scale;
  const py = (y: number) => oy + (t.h - y) * scale;
  const r = Math.max(3, scale * 0.45);
  const blink = (world.tick >> 4) % 2 === 0;
  for (const m of mapMarkers(world, viewer)) {
    const x = px(m.x);
    const y = py(m.y);
    ctx.fillStyle = TEAM_CSS[m.team];
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    switch (m.kind) {
      case 'bunker':
        ctx.fillRect(x - r * 1.4, y - r * 1.4, r * 2.8, r * 2.8);
        ctx.strokeRect(x - r * 1.4, y - r * 1.4, r * 2.8, r * 2.8);
        break;
      case 'turret':
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y + r);
        ctx.lineTo(x - r, y + r);
        ctx.closePath();
        if (m.destroyed) ctx.stroke();
        else ctx.fill();
        break;
      case 'flagTower':
        if (m.destroyed) {
          ctx.strokeStyle = TEAM_CSS[m.team];
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - r, y - r);
          ctx.lineTo(x + r, y + r);
          ctx.moveTo(x + r, y - r);
          ctx.lineTo(x - r, y + r);
          ctx.stroke();
        } else {
          ctx.fillRect(x - r * 0.6, y - r * 1.2, r * 1.2, r * 2.4);
          ctx.strokeRect(x - r * 0.6, y - r * 1.2, r * 1.2, r * 2.4);
        }
        break;
      case 'flag':
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - 1, y - r * 2.2, 2, r * 2.2);
        ctx.fillStyle = TEAM_CSS[m.team];
        ctx.fillRect(x + 1, y - r * 2.2, r * 1.6, r * 1.1);
        break;
      case 'enemy':
        if (blink) {
          ctx.beginPath();
          ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        break;
    }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = HUD.text;
  ctx.font = 'bold 18px monospace';
  ctx.fillText('INTELLIGENCE MAP', area.x + area.w / 2, area.y + 28);
  ctx.font = '13px monospace';
  ctx.fillStyle = HUD.dim;
  ctx.fillText(closeHint, area.x + area.w / 2, oy + mh + 24);
  ctx.restore();
}
