import { expect, test } from 'bun:test';
import { EditorModel } from '../src/editor/model';
import { validateLevel } from '../src/levels/schema';

test('a blank map is sea round open ground', () => {
  const m = new EditorModel();
  expect(m.w).toBe(40);
  expect(m.h).toBe(32);
  expect(m.tile(0, 0)).toBe('~');
  expect(m.tile(10, 10)).toBe('.');
});

test('paint, place, replace and erase', () => {
  const m = new EditorModel();
  expect(m.paint(5, 5, 'T')).toBe(true);
  expect(m.tile(5, 5)).toBe('T');
  const e = m.place(8, 6, 'turret', 'CPU', 'missile');
  expect(e?.variant).toBe('missile');
  expect(m.entityAt(8, 6)).toBe(e);
  m.place(8, 6, 'building', 'NEUTRAL');
  expect(m.level.entities.length).toBe(1);
  expect(m.entityAt(8, 6)?.type).toBe('building');
  expect(m.erase(8, 6)).toBe(true);
  expect(m.level.entities.length).toBe(0);
});

test('placing a bunker again moves it', () => {
  const m = new EditorModel();
  m.place(5, 25, 'bunker', 'P1');
  m.place(9, 25, 'bunker', 'P1');
  expect(m.level.entities.filter((e) => e.type === 'bunker').length).toBe(1);
  expect(m.entityAt(9, 25)?.type).toBe('bunker');
});

test('a map made in the editor validates and lists its towers as flag candidates', () => {
  const m = new EditorModel();
  m.place(20, 26, 'bunker', 'P1');
  m.place(15, 6, 'flagTower', 'CPU');
  m.place(25, 6, 'flagTower', 'CPU');
  const level = m.toLevel();
  expect(level.flagCandidates.CPU?.length).toBe(2);
  expect(validateLevel(level)).toEqual([]);
});

test('resizing keeps the top rows and the entities on them', () => {
  const m = new EditorModel();
  m.place(10, 3, 'flagTower', 'CPU');
  m.resize(30, 40);
  expect(m.w).toBe(30);
  expect(m.h).toBe(40);
  expect(m.entityAt(10, 3)?.type).toBe('flagTower');
  expect(m.tile(29, 39)).toBe('~');
});
