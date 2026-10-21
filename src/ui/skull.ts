// The laughing skull shown when a player's vehicle is destroyed (SPEC §9.6), drawn in vector so it
// scales with the view. The jaw chatters while it laughs.

type Ctx = CanvasRenderingContext2D;

/** `t` is seconds since the vehicle was lost. */
export function drawSkull(ctx: Ctx, cx: number, cy: number, size: number, t: number): void {
  const grow = Math.min(1, t * 3);
  const s = (size / 100) * (0.6 + 0.4 * grow);
  const jaw = Math.abs(Math.sin(t * 14)) * 9; // ha-ha-ha
  const tilt = Math.sin(t * 7) * 0.08;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.scale(s, s);
  ctx.globalAlpha = Math.min(1, t * 4);
  ctx.fillStyle = '#efe8d4';
  ctx.strokeStyle = '#2b2620';
  ctx.lineWidth = 3;

  // cranium
  ctx.beginPath();
  ctx.ellipse(0, -10, 46, 44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // cheeks and upper teeth
  ctx.beginPath();
  ctx.roundRect(-28, 18, 56, 22, 6);
  ctx.fill();
  ctx.stroke();
  // jaw, dropping as it laughs
  ctx.beginPath();
  ctx.roundRect(-26, 40 + jaw, 52, 20, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#1a1612';
  for (const x of [-18, 18]) {
    ctx.beginPath();
    ctx.ellipse(x, -8, 13, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // eye glints
  ctx.fillStyle = '#d33';
  for (const x of [-18, 18]) {
    ctx.beginPath();
    ctx.arc(x, -6, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#1a1612';
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.lineTo(6, 16);
  ctx.lineTo(-6, 16);
  ctx.closePath();
  ctx.fill();
  // teeth lines
  ctx.lineWidth = 2;
  for (let x = -20; x <= 20; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, 28);
    ctx.lineTo(x, 40);
    ctx.moveTo(x, 40 + jaw);
    ctx.lineTo(x, 50 + jaw);
    ctx.stroke();
  }
  ctx.restore();
}
