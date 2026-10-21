import { expect, test } from 'bun:test';
import { emptyProgress, recordWin, trackIds } from '../src/game/progress';
import { initialMenu, menuInput, selectedLevel } from '../src/ui/menu';

test('title: choose a track and open its list', () => {
  let m = initialMenu();
  m = menuInput(m, 'down', emptyProgress()).menu;
  expect(m.item).toBe(1);
  m = menuInput(m, 'select', emptyProgress()).menu;
  expect(m.screen).toBe('levels');
  expect(m.track).toBe('tournament');
  expect(selectedLevel(m)).toBe('t1-1');
});

test('the list opens on the first map not yet won', () => {
  const progress = recordWin(recordWin(emptyProgress(), 't1-1'), 't1-2');
  const m = menuInput({ ...initialMenu(), item: 1 }, 'select', progress).menu;
  expect(selectedLevel(m)).toBe('t1-3');
});

test('locked maps can not be started; open ones can', () => {
  const m = { ...initialMenu(), screen: 'levels' as const, track: 'tournament' as const, level: 3 };
  expect(menuInput(m, 'select', emptyProgress()).start).toBeUndefined();
  expect(menuInput({ ...m, level: 0 }, 'select', emptyProgress()).start).toBe('t1-1');
});

test('paging and going back', () => {
  const m = { ...initialMenu(), screen: 'levels' as const, track: 'tournament' as const, level: 0 };
  expect(menuInput(m, 'right', emptyProgress()).menu.level).toBe(6);
  expect(menuInput(m, 'left', emptyProgress()).menu.level).toBe(0);
  const last = trackIds('tournament').length - 1;
  expect(menuInput({ ...m, level: last }, 'down', emptyProgress()).menu.level).toBe(last);
  expect(menuInput(m, 'back', emptyProgress()).menu.screen).toBe('title');
});
