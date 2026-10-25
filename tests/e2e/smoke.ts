// Headless smoke test (SPEC §14.1): build, serve, load each mode in Chromium, drive for a
// few seconds and fail on any page error. Screenshots go to SMOKE_OUT (default: ./smoke-out).
// Run with `bun run e2e`; SMOKE_ONLY=tank,heli runs just the scenarios named.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = join(import.meta.dir, '../..');
const out = process.env.SMOKE_OUT ?? join(root, 'smoke-out');
await mkdir(out, { recursive: true });

const build = await Bun.build({
  entrypoints: [join(root, 'index.html'), join(root, 'editor/index.html')],
  outdir: join(root, 'dist'),
});
if (!build.success) throw new AggregateError(build.logs, 'build failed');

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    const page = path.endsWith('/') ? `${path}index.html` : path;
    const file = Bun.file(join(root, 'dist', page));
    return (await file.exists()) ? new Response(file) : new Response('not found', { status: 404 });
  },
});

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = false;

type Step = {
  press?: string[];
  down?: string[];
  up?: string[];
  /** Click a point on the page, in CSS pixels. */
  clickAt?: [number, number];
  /** Hold the mouse on the middle of each element matched, one after another, for `wait` each. */
  hold?: string[];
  wait?: number;
  run?: string;
};

/** Scripted sessions: each deploys vehicles from the bunker and drives them. */
const scenarios: { name: string; query: string; steps: Step[] }[] = [
  {
    name: 'tank',
    query: '?level=training-01',
    steps: [
      { wait: 1200 },
      { press: ['KeyH'], wait: 1300 },
      { down: ['KeyW', 'KeyE'], wait: 1500 },
      { press: ['KeyH'], up: ['KeyW', 'KeyE'], wait: 300 },
    ],
  },
  {
    name: 'heli',
    query: '?level=training-01',
    steps: [
      { wait: 1200 },
      { press: ['KeyD', 'KeyD', 'KeyH'], wait: 2000 },
      { down: ['KeyW', 'KeyQ'], wait: 1500 },
      { press: ['KeyK', 'KeyH'], up: ['KeyW', 'KeyQ'], wait: 300 },
    ],
  },
  {
    name: 'jeep',
    query: '?level=training-01',
    steps: [
      { wait: 1200 },
      { press: ['KeyA', 'KeyH'], wait: 1300 },
      { press: ['KeyJ'], wait: 800 },
      { down: ['KeyW'], wait: 1500 },
      { up: ['KeyW'], wait: 200 },
    ],
  },
  // down picks the jeep's hobby skin, in the hangar and then on the field
  {
    name: 'hobby-bunker',
    query: '?level=training-01',
    steps: [{ wait: 1200 }, { press: ['KeyA', 'KeyS'], wait: 600 }],
  },
  {
    name: 'pocket-bunker',
    query: '?level=training-01',
    steps: [{ wait: 1200 }, { press: ['KeyS'], wait: 600 }],
  },
  {
    name: 'stinger-bunker',
    query: '?level=training-01',
    steps: [{ wait: 1200 }, { press: ['KeyS', 'KeyS'], wait: 600 }],
  },
  {
    name: 'van-bunker',
    query: '?level=training-01',
    steps: [{ wait: 1200 }, { press: ['KeyD', 'KeyS'], wait: 600 }],
  },
  {
    name: 'stealth-bunker',
    query: '?level=training-01',
    steps: [{ wait: 1200 }, { press: ['KeyD', 'KeyD', 'KeyS'], wait: 600 }],
  },
  {
    name: 'stealth',
    query: '?level=training-01',
    steps: [
      { wait: 1200 },
      { press: ['KeyD', 'KeyD', 'KeyS', 'KeyH'], wait: 2500 },
      { down: ['KeyW'], wait: 600 },
      { up: ['KeyW'], wait: 200 },
    ],
  },
  // flying, so the aim marker shows ahead
  {
    name: 'heli-aim',
    query: '?level=training-01',
    steps: [{ wait: 1200 }, { press: ['KeyD', 'KeyD', 'KeyH'], wait: 7000 }],
  },
  {
    name: 'hobby',
    query: '?level=training-01',
    steps: [
      { wait: 1200 },
      { press: ['KeyA', 'KeyS', 'KeyH'], wait: 2500 },
      { down: ['KeyW'], wait: 500 },
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
  { name: 'menu', query: '', steps: [{ wait: 1500 }] },
  // the corner button turns the on-screen controls on, and the d-pad moves the menu
  {
    name: 'touch-menu',
    query: '',
    steps: [
      { wait: 1200 },
      { clickAt: [1190, 36], wait: 400 },
      { hold: ['.cf-dpad .down'], wait: 300 },
      { wait: 400 },
    ],
  },
  // on in play: A deploys the tank, the d-pad drives it, with the dashboard along the top
  {
    name: 'touch-game',
    query: '?level=training-01',
    steps: [
      { wait: 600, run: `localStorage.setItem('counterfire.touch', 'on'); location.reload();` },
      { wait: 1500 },
      { hold: ['.cf-button.a'], wait: 150 },
      { wait: 1500 },
      { wait: 1500 },
      { hold: ['.cf-dpad .up'], wait: 1500 },
    ],
  },
  { name: 'menu-tournament', query: '', steps: [{ wait: 1200 }, { press: ['KeyS', 'KeyH'], wait: 1000 }] },
  {
    name: 'menu-to-game',
    query: '',
    steps: [{ wait: 1200 }, { press: ['KeyH', 'KeyH'], wait: 1500 }, { press: ['KeyH'], wait: 1500 }],
  },
  // up wraps round to Controls; then bind P1's Forward to Y
  {
    name: 'controls',
    query: '',
    steps: [{ wait: 1200 }, { press: ['KeyW', 'KeyH', 'KeyH', 'KeyY'], wait: 800 }],
  },
  { name: 'showcase', query: '?showcase', steps: [{ wait: 1500 }] },
  { name: 'silhouette', query: '?showcase&silhouette', steps: [{ wait: 1500 }] },
  { name: 'map', query: '?players=2', steps: [{ wait: 1200 }, { press: ['KeyJ'], wait: 600 }] },
  { name: 'desert-map', query: '?level=t4-3', steps: [{ wait: 1200 }, { press: ['KeyJ'], wait: 600 }] },
  { name: 'chessboard-map', query: '?level=t3-6', steps: [{ wait: 1200 }, { press: ['KeyJ'], wait: 600 }] },
  { name: 'winter', query: '?level=t5-4', steps: [{ wait: 1200 }, { press: ['KeyH'], wait: 1500 }] },
  { name: 'desert', query: '?level=t2-3', steps: [{ wait: 1200 }, { press: ['KeyH'], wait: 1500 }] },
  {
    // a tank under radar, an enemy jeep and a mine on the scope
    name: 'radar',
    query: '?players=2&test',
    steps: [
      { wait: 1200 },
      {
        run: `const w = counterfire.world;
          const t = w.spawnVehicle('P1', 'tank');
          const j = w.spawnVehicle('P2', 'jeep'); j.x = t.x + 4; j.y = t.y + 3;
          w.mines.push({ id: 1e6, team: 'P2', x: t.x - 3, y: t.y + 2 });`,
        wait: 800,
      },
    ],
  },
  {
    name: 'skull',
    query: '?level=training-01&test',
    steps: [
      { wait: 1200 },
      { run: `const w = counterfire.world; w.destroyVehicle(w.spawnVehicle('P1', 'tank'));`, wait: 700 },
    ],
  },
  {
    name: 'victory',
    query: '?level=training-01&test',
    steps: [{ wait: 1200 }, { run: `counterfire.world.endGame('P1', 'flagCaptured');`, wait: 1500 }],
  },
];

try {
  const only = process.env.SMOKE_ONLY?.split(',');
  for (const { name, query, steps } of scenarios.filter((s) => !only || only.includes(s.name))) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    // a gamepad plugged into the machine reaches the browser too; the scripted keys must be the only input
    await page.addInitScript(() => Object.defineProperty(navigator, 'getGamepads', { value: () => [] }));
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
      if (step.clickAt) await page.mouse.click(...step.clickAt, { delay: 40 });
      for (const selector of step.hold ?? []) {
        const box = await page.locator(selector).boundingBox();
        if (!box) throw new Error(`${name}: nothing to hold at ${selector}`);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(step.wait ?? 100);
        await page.mouse.up();
      }
      if (step.run) await page.evaluate(step.run);
      if (step.wait && !step.hold) await page.waitForTimeout(step.wait);
    }
    await page.screenshot({ path: join(out, `${name}.png`) });
    console.log(`${name}: ${errors.length ? `FAIL\n  ${errors.join('\n  ')}` : 'ok'}`);
    failed ||= errors.length > 0;
    await page.close();
  }

  // the level editor: rough in a map, check it validates, then play it as the custom level
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`${server.url}editor/`);
    await page.waitForTimeout(500);
    await page.fill('#genTier', '6');
    await page.fill('#genSeed', '42');
    await page.click('#generate');
    await page.click('#validate');
    const verdict = await page.textContent('#errors');
    if (verdict?.trim() !== 'valid') errors.push(`generated map did not validate: ${verdict}`);
    await page.screenshot({ path: join(out, 'editor.png') });
    const level = await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('#play')?.click();
      return localStorage.getItem('counterfire.customLevel');
    });
    if (!level) errors.push('Play did not leave the map for the game');
    await page.goto(`${server.url}?level=custom`);
    await page.waitForTimeout(1500);
    await page.keyboard.press('KeyJ', { delay: 40 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(out, 'editor-play.png') });
    console.log(`editor: ${errors.length ? `FAIL\n  ${errors.join('\n  ')}` : 'ok'}`);
    failed ||= errors.length > 0;
    await page.close();
  }
} finally {
  await browser.close();
  server.stop();
}
process.exit(failed ? 1 : 0);
