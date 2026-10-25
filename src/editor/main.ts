// The level editor page (SPEC §10.5): paint terrain, place structures, set stock, validate, play
// the map straight away, and export it as JSON for assets/levels. Served at /editor/.

import { LEVELS } from '../levels';
import { generateDuel, generateLevel, type Layout } from '../levels/generate';
import { type EntityType, type Level, validateLevel } from '../levels/schema';
import { Tile, type TileChar } from '../sim/terrain';
import type { PlayerId, Team, VehicleType } from '../sim/types';
import { MAP_TILE_CSS, TEAM_CSS } from '../ui/palette';
import { CUSTOM_KEY } from './custom';
import { EditorModel } from './model';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('map');
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

let model = new EditorModel();
type Tool = { kind: 'tile'; tile: TileChar } | { kind: 'entity'; type: EntityType; variant?: string };
let tool: Tool = { kind: 'tile', tile: Tile.Grass };
let team: Team = 'CPU';
let cell = 14;

const TILE_NAMES: [TileChar, string][] = [
  [Tile.Grass, 'grass'],
  [Tile.Road, 'road'],
  [Tile.Sand, 'sand'],
  [Tile.Shallow, 'shallow'],
  [Tile.Deep, 'deep'],
  [Tile.Forest, 'forest'],
  [Tile.Wall, 'wall'],
  [Tile.Bridge, 'bridge'],
  [Tile.Rubble, 'rubble'],
];
const ENTITY_TOOLS: [EntityType, string | undefined, string][] = [
  ['bunker', undefined, 'bunker'],
  ['flagTower', undefined, 'flag tower'],
  ['building', 'house', 'house'],
  ['building', 'barracks', 'barracks'],
  ['building', 'hangar', 'hangar'],
  ['building', 'tower', 'tower block'],
  ['building', 'saloon', 'saloon'],
  ['building', 'pod', 'alien pod'],
  ['turret', 'gun', 'gun turret'],
  ['turret', 'missile', 'missile turret'],
  ['fuelDepot', undefined, 'fuel depot'],
  ['ammoTent', undefined, 'ammo tent'],
  ['droneSpawn', undefined, 'drone spawn'],
];
const LETTER: Record<EntityType, string> = {
  bunker: 'B',
  flagTower: 'F',
  building: 'h',
  turret: 'T',
  fuelDepot: 'f',
  ammoTent: 'a',
  droneSpawn: 'd',
};

function button(parent: HTMLElement, label: string, onClick: () => void, swatch?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.innerHTML = swatch ? `<span class="swatch" style="background:${swatch}"></span>${label}` : label;
  b.onclick = () => {
    for (const x of parent.querySelectorAll('button')) x.classList.remove('on');
    b.classList.add('on');
    onClick();
  };
  parent.append(b);
  return b;
}

/** Clear the highlight from every button in a tool box. */
function deselect(box: string) {
  for (const x of $(box).querySelectorAll('button')) x.classList.remove('on');
}

function buildPalette() {
  const tiles = $('tiles');
  for (const [t, name] of TILE_NAMES) {
    const b = button(
      tiles,
      name,
      () => {
        tool = { kind: 'tile', tile: t };
        deselect('entities');
      },
      MAP_TILE_CSS[t],
    );
    if (t === Tile.Grass) b.classList.add('on');
  }
  for (const [type, variant, name] of ENTITY_TOOLS) {
    button($('entities'), name, () => {
      tool = { kind: 'entity', type, variant };
      deselect('tiles');
    });
  }
  for (const t of ['P1', 'P2', 'CPU', 'NEUTRAL'] as Team[]) {
    const b = button($('teams'), t, () => (team = t), TEAM_CSS[t]);
    if (t === team) b.classList.add('on');
  }
  for (const p of ['P1', 'P2'] as PlayerId[]) {
    const box = $(`stock${p}`);
    for (const v of ['tank', 'asv', 'heli', 'jeep'] as VehicleType[]) {
      const label = document.createElement('label');
      label.innerHTML = `${v} <input type="number" min="0" max="9" data-player="${p}" data-vehicle="${v}" />`;
      box.append(label);
    }
  }
  const levels = $<HTMLSelectElement>('levels');
  for (const id of Object.keys(LEVELS)) levels.add(new Option(`${id} - ${LEVELS[id]?.name}`, id));
}

// --- properties panel <-> model ---

function showProps() {
  const l = model.level;
  $<HTMLInputElement>('id').value = l.id;
  $<HTMLInputElement>('name').value = l.name;
  $<HTMLSelectElement>('mode').value = l.mode;
  $<HTMLSelectElement>('players').value = String(l.players);
  $<HTMLSelectElement>('theme').value = l.theme;
  $<HTMLInputElement>('tier').value = String(l.tier ?? '');
  $<HTMLInputElement>('w').value = String(model.w);
  $<HTMLInputElement>('h').value = String(model.h);
  $<HTMLInputElement>('inset').value = String(l.bounds.x);
  for (const input of document.querySelectorAll<HTMLInputElement>('input[data-player]')) {
    const s = l.stock[input.dataset.player as PlayerId];
    input.value = String(s?.[input.dataset.vehicle as VehicleType] ?? '');
  }
}

function readProps() {
  const l = model.level;
  l.id = $<HTMLInputElement>('id').value.trim() || 'custom';
  l.name = $<HTMLInputElement>('name').value.trim() || 'Untitled';
  l.mode = $<HTMLSelectElement>('mode').value as Level['mode'];
  l.players = Number($<HTMLSelectElement>('players').value) as 1 | 2;
  l.theme = $<HTMLSelectElement>('theme').value as Level['theme'];
  const tier = Number($<HTMLInputElement>('tier').value);
  l.tier = tier >= 1 && tier <= 9 ? tier : undefined;
  for (const input of document.querySelectorAll<HTMLInputElement>('input[data-player]')) {
    const p = input.dataset.player as PlayerId;
    if (input.value === '') continue;
    l.stock[p] ??= { tank: 0, asv: 0, heli: 0, jeep: 0 };
    (l.stock[p] as Record<VehicleType, number>)[input.dataset.vehicle as VehicleType] = Number(input.value);
  }
  const w = Number($<HTMLInputElement>('w').value);
  const h = Number($<HTMLInputElement>('h').value);
  if (w !== model.w || h !== model.h) model.resize(w, h);
}

function current(): Level {
  readProps();
  return model.toLevel(Number($<HTMLInputElement>('inset').value) || 0);
}

function validate(): boolean {
  const errors = validateLevel(current());
  const list = $('errors');
  list.className = errors.length ? '' : 'ok';
  list.innerHTML = errors.length ? errors.map((e) => `<li>${e}</li>`).join('') : '<li>valid</li>';
  return !errors.length;
}

// --- drawing ---

function draw() {
  cell = Math.max(
    6,
    Math.min(18, Math.floor(Math.min((innerWidth - 520) / model.w, (innerHeight - 70) / model.h))),
  );
  canvas.width = model.w * cell;
  canvas.height = model.h * cell;
  for (let r = 0; r < model.h; r++) {
    for (let c = 0; c < model.w; c++) {
      ctx.fillStyle = MAP_TILE_CSS[model.tile(c, r) ?? Tile.Deep];
      ctx.fillRect(c * cell, r * cell, cell, cell);
    }
  }
  const b = model.level.bounds;
  const inset = Number($<HTMLInputElement>('inset').value) || b.x;
  ctx.strokeStyle = 'rgba(255,80,80,.6)';
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(inset * cell, inset * cell, (model.w - 2 * inset) * cell, (model.h - 2 * inset) * cell);
  ctx.setLineDash([]);
  ctx.font = `bold ${Math.round(cell * 0.75)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const e of model.level.entities) {
    const x = Math.floor(e.x) * cell;
    const y = (model.h - 1 - Math.floor(e.y)) * cell;
    ctx.fillStyle = TEAM_CSS[e.team ?? 'NEUTRAL'];
    ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    ctx.fillStyle = '#000';
    ctx.fillText(
      e.type === 'turret' && e.variant === 'missile' ? 'M' : LETTER[e.type],
      x + cell / 2,
      y + cell / 2 + 1,
    );
  }
}

// --- editing with the mouse ---

let painting = false;
function cellAt(ev: MouseEvent): [number, number] {
  const rect = canvas.getBoundingClientRect();
  return [Math.floor((ev.clientX - rect.left) / cell), Math.floor((ev.clientY - rect.top) / cell)];
}

function apply(ev: MouseEvent) {
  const [c, r] = cellAt(ev);
  if (ev.buttons === 2) model.erase(c, r);
  else if (tool.kind === 'tile') model.paint(c, r, tool.tile);
  else if (!model.entityAt(c, r) || model.entityAt(c, r)?.type !== tool.type)
    model.place(c, r, tool.type, team, tool.variant);
  draw();
}

canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
canvas.addEventListener('mousedown', (ev) => {
  painting = true;
  apply(ev);
});
canvas.addEventListener('mousemove', (ev) => {
  const [c, r] = cellAt(ev);
  const e = model.entityAt(c, r);
  $('status').textContent = `${c},${r} ${model.tile(c, r) ?? ''} ${e ? `${e.id}` : ''}`;
  // entities are placed with a click, terrain is painted with a drag
  if (painting && (tool.kind === 'tile' || ev.buttons === 2)) apply(ev);
});
addEventListener('mouseup', () => {
  painting = false;
});
addEventListener('resize', draw);

// --- the header buttons ---

function load(level: Level) {
  model = new EditorModel(level);
  showProps();
  draw();
  validate();
}

$('load').onclick = () => {
  const level = LEVELS[$<HTMLSelectElement>('levels').value];
  if (level) load(level);
};
$('new').onclick = () => load(EditorModel.blank(40, 32));
$('generate').onclick = () => {
  readProps();
  const l = model.level;
  const spec = {
    id: l.id,
    name: l.name,
    mode: l.mode,
    theme: l.theme,
    seed: Number($<HTMLInputElement>('genSeed').value) || 1,
    tier: Number($<HTMLInputElement>('genTier').value) || 3,
    layout: $<HTMLSelectElement>('genLayout').value as Layout,
  };
  try {
    load(l.players === 2 ? generateDuel(spec) : generateLevel(spec));
  } catch (err) {
    $('status').textContent = String(err);
  }
};
$('validate').onclick = () => validate();
$('play').onclick = () => {
  if (!validate()) return;
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(current()));
  // relative, so it also works under the Pages project path
  open('../?level=custom', '_blank');
};
$('export').onclick = () => {
  const level = current();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(
    new Blob([`${JSON.stringify(level, null, 2)}\n`], { type: 'application/json' }),
  );
  a.download = `${level.id}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};
$<HTMLInputElement>('import').onchange = async (ev) => {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (file) load(JSON.parse(await file.text()) as Level);
};
for (const id of ['id', 'name', 'mode', 'players', 'theme', 'tier', 'w', 'h', 'inset']) {
  $(id).addEventListener('change', () => {
    readProps();
    draw();
    validate();
  });
}

buildPalette();
load(LEVELS['training-01'] ?? EditorModel.blank(40, 32));
