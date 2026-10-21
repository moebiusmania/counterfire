// Generate the shipped level set (SPEC §10.2) and the catalog that imports it.
//
//   bun tools/build-levels.ts
//
// training-01 and duel-01 are hand-made and kept as they are. Everything else is rebuilt from
// fixed seeds, so running this again gives the same files. To hand-tune a map, edit its JSON in
// the level editor and take its id off the generated list below.

import { type GenSpec, generateDuel, generateLevel, type Layout } from '../src/levels/generate';
import type { Level } from '../src/levels/schema';
import { Rng } from '../src/sim/rng';

const ROOT = `${import.meta.dir}/..`;

/** Training: one map per lesson (SPEC §10.2). */
const TRAINING: GenSpec[] = [
  {
    id: 'training-02',
    name: 'Turret Drill',
    mode: 'training',
    theme: 'temperate',
    seed: 202,
    tier: 1,
    size: { w: 36, h: 30 },
    towers: 3,
    turrets: 2,
    drones: 0,
    depots: 2,
    targets: 5,
    stock: { tank: 4, asv: 1, heli: 1, jeep: 2 },
  },
  {
    id: 'training-03',
    name: 'Rotor School',
    mode: 'training',
    theme: 'temperate',
    seed: 303,
    tier: 3,
    size: { w: 40, h: 34 },
    towers: 3,
    turrets: 1,
    drones: 0,
    bridges: false,
    stock: { tank: 1, asv: 1, heli: 4, jeep: 2 },
  },
  {
    id: 'training-04',
    name: 'Wet Feet',
    mode: 'training',
    theme: 'temperate',
    seed: 404,
    tier: 3,
    size: { w: 40, h: 34 },
    towers: 3,
    turrets: 1,
    drones: 0,
    lakes: 3,
    bridges: false,
    stock: { tank: 2, asv: 1, heli: 1, jeep: 5 },
  },
  {
    id: 'training-05',
    name: 'Flag Run',
    mode: 'training',
    theme: 'temperate',
    seed: 505,
    tier: 2,
    size: { w: 40, h: 34 },
    towers: 4,
    turrets: 2,
    drones: 1,
    stock: { tank: 3, asv: 2, heli: 2, jeep: 3 },
  },
  {
    id: 'training-06',
    name: 'Deserters',
    mode: 'training',
    theme: 'winter',
    seed: 606,
    tier: 2,
    size: { w: 40, h: 34 },
    towers: 3,
    turrets: 2,
    drones: 0,
    boundsInset: 4,
    stock: { tank: 3, asv: 1, heli: 3, jeep: 3 },
  },
];

const ADJECTIVES = [
  'Iron',
  'Silent',
  'Broken',
  'Red',
  'Grey',
  'Bitter',
  'Long',
  'Cold',
  'Lost',
  'Hollow',
  'Black',
  'Burnt',
  'Twin',
  'Rusty',
  'High',
  'Low',
  'Dead',
  'Last',
  'Stone',
  'Salt',
  'Thunder',
  'Ghost',
  'Copper',
  'Crooked',
];
const NOUNS = [
  'Ridge',
  'Harbour',
  'Crossing',
  'Causeway',
  'Point',
  'Ford',
  'Gate',
  'Reach',
  'Bluff',
  'Shoals',
  'Keep',
  'Hollow',
  'Sound',
  'Narrows',
  'Bay',
  'Spit',
  'Fork',
  'Basin',
  'Watch',
  'Banks',
  'Delta',
  'Rock',
  'Outpost',
  'Strand',
];

/** Unique two-word names, the same every run. */
function nameMaker(seed: number) {
  const rng = new Rng(seed);
  const used = new Set<string>(['First Tracks', 'Twin Bridges', ...TRAINING.map((t) => t.name)]);
  return () => {
    for (;;) {
      const name = `${ADJECTIVES[rng.int(ADJECTIVES.length)]} ${NOUNS[rng.int(NOUNS.length)]}`;
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
  };
}

/** The look of each slot in a tier: mostly grassland, a desert, a winter map and a novelty. */
const SLOT_THEMES: Level['theme'][] = ['temperate', 'temperate', 'desert', 'winter', 'temperate', 'novelty'];

function tournament(name: () => string): GenSpec[] {
  const out: GenSpec[] = [];
  for (let tier = 1; tier <= 9; tier++) {
    for (let slot = 1; slot <= 6; slot++) {
      const theme = SLOT_THEMES[slot - 1] as Level['theme'];
      const layout: Layout | undefined =
        theme === 'novelty' ? (tier % 2 ? 'chessboard' : 'atoll') : undefined;
      out.push({
        id: `t${tier}-${slot}`,
        name: name(),
        mode: 'tournament',
        theme,
        layout,
        seed: tier * 1000 + slot,
        tier,
      });
    }
  }
  return out;
}

function duels(name: () => string): GenSpec[] {
  const themes: Level['theme'][] = ['temperate', 'desert', 'winter'];
  return Array.from({ length: 11 }, (_, i) => ({
    id: `duel-${String(i + 2).padStart(2, '0')}`,
    name: name(),
    mode: 'tournament' as const,
    theme: themes[i % 3] as Level['theme'],
    layout: i % 4 === 3 ? ('chessboard' as const) : undefined,
    seed: 5000 + i,
    tier: 2 + Math.floor((i * 7) / 10),
  }));
}

if (import.meta.main) {
  // one name list for every map, so no two share a name
  const name = nameMaker(1996);
  const specs: [GenSpec, (s: GenSpec) => Level][] = [
    ...TRAINING.map((s) => [s, generateLevel] as [GenSpec, (s: GenSpec) => Level]),
    ...tournament(name).map((s) => [s, generateLevel] as [GenSpec, (s: GenSpec) => Level]),
    ...duels(name).map((s) => [s, generateDuel] as [GenSpec, (s: GenSpec) => Level]),
  ];
  const ids = ['training-01'];
  for (const [spec, make] of specs) {
    const level = make(spec);
    await Bun.write(`${ROOT}/assets/levels/${level.id}.json`, `${JSON.stringify(level)}\n`);
    ids.push(level.id);
  }
  ids.push('duel-01');

  // the catalog: every level in play order, training, tournament, then duels
  const order = (id: string) => (id.startsWith('training') ? 0 : id.startsWith('t') ? 1 : 2);
  const sorted = ids.sort((a, b) => order(a) - order(b) || a.localeCompare(b, 'en', { numeric: true }));
  const ident = (id: string) => `l_${id.replace(/-/g, '_')}`;
  const lines = [
    '// Generated by tools/build-levels.ts: every shipped level, in play order. Do not edit.',
    '',
    "import type { Level } from './schema';",
    ...sorted.map((id) => `import ${ident(id)} from '../../assets/levels/${id}.json';`),
    '',
    `export const CATALOG = [${sorted.map(ident).join(', ')}] as unknown as Level[];`,
    '',
  ];
  await Bun.write(`${ROOT}/src/levels/catalog.ts`, lines.join('\n'));
  console.log(`${sorted.length} levels`);
}
