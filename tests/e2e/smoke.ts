// Headless smoke test (SPEC §14.1): build, serve, load each mode in Chromium, drive for a
// few seconds and fail on any page error. Screenshots go to SMOKE_OUT (default: ./smoke-out).
// Run with `bun run e2e`.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = join(import.meta.dir, '../..');
const out = process.env.SMOKE_OUT ?? join(root, 'smoke-out');
await mkdir(out, { recursive: true });

const build = await Bun.build({ entrypoints: [join(root, 'index.html')], outdir: join(root, 'dist') });
if (!build.success) throw new AggregateError(build.logs, 'build failed');

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    const file = Bun.file(join(root, 'dist', path === '/' ? 'index.html' : path));
    return (await file.exists()) ? new Response(file) : new Response('not found', { status: 404 });
  },
});

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = false;
try {
  for (const [name, query] of [
    ['one-player', ''],
    ['split-screen', '?players=2'],
  ] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`${server.url}${query}&seed=1`.replace('/&', '/?'));
    await page.waitForTimeout(1500);
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyE');
    await page.keyboard.press('KeyH');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyE');
    await page.screenshot({ path: join(out, `${name}.png`) });
    console.log(`${name}: ${errors.length ? `FAIL\n  ${errors.join('\n  ')}` : 'ok'}`);
    failed ||= errors.length > 0;
    await page.close();
  }
} finally {
  await browser.close();
  server.stop();
}
process.exit(failed ? 1 : 0);
