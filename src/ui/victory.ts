// The victory celebration (SPEC §9.6): ticker tape raining down the winner's view. The original's
// filmed parade can not be shipped, so this is drawn.

type Ctx = CanvasRenderingContext2D;

const COLORS = ['#f2d43a', '#ffffff', '#e8463a', '#4b84e6', '#7fd45a', '#f29b3a'];

/** Deterministic per-piece noise, so the paper falls the same way each frame. */
function noise(i: number, salt: number): number {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** `t` is seconds since the game was won. */
export function drawTickerTape(
  ctx: Ctx,
  area: { x: number; y: number; w: number; h: number },
  t: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  const count = Math.floor(area.w / 6);
  for (let i = 0; i < count; i++) {
    const speed = 60 + noise(i, 1) * 90;
    const start = noise(i, 2) * 2.5;
    const fall = (t - start) * speed;
    if (fall < 0) continue;
    const y = area.y - 20 + (fall % (area.h + 40));
    const sway = Math.sin(t * (1 + noise(i, 3) * 2) + i) * 18;
    const x = area.x + noise(i, 4) * area.w + sway;
    const spin = t * (2 + noise(i, 5) * 4) + i;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.scale(1, Math.cos(spin * 1.3));
    ctx.fillStyle = COLORS[i % COLORS.length] as string;
    ctx.fillRect(-4, -2, 8, 4);
    ctx.restore();
  }
  ctx.restore();
}
