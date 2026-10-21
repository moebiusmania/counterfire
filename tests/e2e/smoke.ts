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

type Step = { press?: string[]; down?: string[]; up?: string[]; wait?: number };

/** Scripted sessions: each deploys vehicles from the bunker and drives them. */
const scenarios: { name: string; query: string; steps: Step[] }[] = [
  {
    name: 'tank',
    query: '',
    steps: [
      { wait: 1200 },
      { press: ['KeyH'], wait: 1300 },
      { down: ['KeyW', 'KeyE'], wait: 1500 },
      { press: ['KeyH'], up: ['KeyW', 'KeyE'], wait: 300 },
    ],
  },
  {
    name: 'heli',
    query: '',
    steps: [
      { wait: 1200 },
      { press: ['KeyD', 'KeyD', 'KeyH'], wait: 2000 },
      { down: ['KeyW', 'KeyQ'], wait: 1500 },
      { press: ['KeyK', 'KeyH'], up: ['KeyW', 'KeyQ'], wait: 300 },
    ],
  },
  {
    name: 'jeep',
    query: '',
    steps: [
      { wait: 1200 },
      { press: ['KeyA', 'KeyH'], wait: 1300 },
      { press: ['KeyJ'], wait: 800 },
      { down: ['KeyW'], wait: 1500 },
      { up: ['KeyW'], wait: 200 },
    ],
  },
  {
    name: 'split-screen',
    query: '?players=2',
    steps: [
      { wait: 1200 },
      { press: ['KeyD', 'KeyH', 'Numpad6', 'Numpad6', 'NumpadSubtract'], wait: 2000 },
      { down: ['KeyW', 'Numpad8'], wait: 1500 },
      { up: ['KeyW', 'Numpad8'], press: ['KeyH', 'NumpadSubtract'], wait: 300 },
    ],
  },
  {
    name: 'bunker-screen',
    query: '?players=2',
    steps: [{ wait: 1200 }, { press: ['KeyD', 'Numpad4'], wait: 300 }],
  },
  { name: 'showcase', query: '?showcase', steps: [{ wait: 1500 }] },
];

try {
  for (const { name, query, steps } of scenarios) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`${server.url}${query ? `${query}&` : '?'}seed=1`);
    for (const step of steps) {
      for (const k of step.up ?? []) await page.keyboard.up(k);
      for (const k of step.press ?? []) {
        // hold each tap for a couple of frames, as a person would
        await page.keyboard.press(k, { delay: 40 });
        await page.waitForTimeout(40);
      }
      for (const k of step.down ?? []) await page.keyboard.down(k);
      if (step.wait) await page.waitForTimeout(step.wait);
    }
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
