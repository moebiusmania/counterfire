// The radar scope (SPEC §9.5): the ground close around the vehicle, other vehicles, drones and
// mines. Up on the scope is north, as in the 3D view.

import type { TileChar } from '../sim/terrain';
import { RADAR } from '../sim/tuning';
import type { Vehicle } from '../sim/vehicles/vehicle';
import type { World } from '../sim/world';
import { radarContacts } from './intel';
import { HUD, MAP_TILE_CSS } from './palette';

type Ctx = CanvasRenderingContext2D;

export function drawRadar(ctx: Ctx, world: World, v: Vehicle, cx: number, cy: number, radius: number): void {
  const k = radius / RADAR.range;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#071510';
  ctx.fill();
  ctx.clip();

  // the ground around, dimmed to a green phosphor glow
  ctx.globalAlpha = 0.45;
  const t = world.terrain;
  const r = RADAR.range;
  // setting fillStyle parses the colour, so it is set only when the tile kind changes
  let last: TileChar | undefined;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const tx = Math.floor(v.x) + dx;
      const ty = Math.floor(v.y) + dy;
      const tile = t.get(tx, ty);
      if (tile === '~') continue;
      if (tile !== last) ctx.fillStyle = MAP_TILE_CSS[tile];
      last = tile;
      ctx.fillRect(cx + (tx - v.x) * k, cy - (ty + 1 - v.y) * k, k + 0.5, k + 0.5);
    }
  }
  ctx.globalAlpha = 1;

  // sweep
  const sweep = (world.tick * 0.06) % (Math.PI * 2);
  ctx.strokeStyle = 'rgba(90, 255, 140, .5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweep) * radius, cy + Math.sin(sweep) * radius);
  ctx.stroke();
  for (const ring of [0.5, 1]) {
    ctx.strokeStyle = 'rgba(90, 255, 140, .25)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius * ring - 1, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const c of radarContacts(world, v)) {
    const x = cx + c.x * k;
    const y = cy - c.y * k;
    if (c.kind === 'mine') {
      ctx.strokeStyle = c.own ? '#9f9' : '#ff3';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 3);
      ctx.lineTo(x + 3, y + 3);
      ctx.moveTo(x + 3, y - 3);
      ctx.lineTo(x - 3, y + 3);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = c.kind === 'friend' ? '#7f7' : '#f44';
    ctx.beginPath();
    ctx.arc(x, y, c.kind === 'drone' ? 2.5 : 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // you, pointing the way you face
  ctx.fillStyle = '#fff';
  ctx.translate(cx, cy);
  ctx.rotate(-v.heading);
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(4, 5);
  ctx.lineTo(-4, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = HUD.edge;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
