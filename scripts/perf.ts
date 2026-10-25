// Frame-rate check (SPEC §14.3): builds the game, opens a level in Chromium on the real GPU with
// both players driving and firing, and reports frame times and main-thread load.
// Run with `bun run perf [level] [--swiftshader]`; the default is the largest two-player map.
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = join(import.meta.dir, '..');
const out = join(root, 'dist-perf');
const level = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'duel-10';
const software = process.argv.includes('--swiftshader');
const FRAMES = 1200;

// the production condition picks the engine's release build, as `bun run build` ships
const build = await Bun.build({
  entrypoints: [join(root, 'index.html')],
  outdir: out,
  minify: true,
  conditions: ['production'],
});
if (!build.success) throw new AggregateError(build.logs, 'build failed');
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    const file = Bun.file(join(out, path === '/' ? 'index.html' : path));
    return (await file.exists()) ? new Response(file) : new Response('not found', { status: 404 });
  },
});

const browser = await chromium.launch({
  args: software
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : [
        '--enable-gpu',
        '--ignore-gpu-blocklist',
        '--use-angle=vulkan',
        '--enable-features=Vulkan',
        '--disable-frame-rate-limit',
      ],
});
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${server.url}?level=${level}&seed=1`);
  await page.waitForTimeout(2500);
  // both players drive in circles and keep firing
  for (const k of ['KeyW', 'KeyA', 'KeyH', 'Numpad8', 'Numpad4', 'NumpadSubtract'])
    await page.keyboard.down(k);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = async () =>
    Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? String(gl?.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  const before = await metrics();
  const times = await page.evaluate(
    (n) =>
      new Promise<number[]>((resolve) => {
        const t: number[] = [];
        const frame = (now: number) => {
          t.push(now);
          if (t.length < n) requestAnimationFrame(frame);
          else resolve(t);
        };
        requestAnimationFrame(frame);
      }),
    FRAMES,
  );
  const after = await metrics();
  const delta = (name: string) => (after[name] ?? 0) - (before[name] ?? 0);

  const gaps = times.slice(1).map((t, i) => t - (times[i] ?? t));
  const sorted = [...gaps].sort((a, b) => a - b);
  const seconds = ((times.at(-1) ?? 0) - (times[0] ?? 0)) / 1000;
  const pct = (p: number) => (sorted[Math.floor(sorted.length * p)] ?? 0).toFixed(1);
  console.log(`level ${level} on ${gpu}`);
  console.log(
    `  ${(gaps.length / seconds).toFixed(1)} fps, frame ms p50 ${pct(0.5)} p95 ${pct(0.95)} worst ${pct(0.999)}`,
  );
  console.log(`  frames over 33 ms: ${gaps.filter((g) => g > 33.4).length} of ${gaps.length}`);
  console.log(
    `  main thread busy ${((delta('TaskDuration') / seconds) * 100).toFixed(1)}%, script ${((delta('ScriptDuration') / gaps.length) * 1000).toFixed(2)} ms per frame`,
  );
} finally {
  await browser.close();
  server.stop();
}
