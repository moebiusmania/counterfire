import { expect, test } from 'bun:test';
import { emptyProgress, isUnlocked, nextLevel, recordWin, trackIds, trackOf } from '../src/game/progress';

test('the tournament opens one map at a time', () => {
  const ids = trackIds('tournament');
  let p = emptyProgress();
  expect(isUnlocked(p, 'tournament', ids[0] as string)).toBe(true);
  expect(isUnlocked(p, 'tournament', ids[1] as string)).toBe(false);
  p = recordWin(p, ids[0] as string);
  expect(isUnlocked(p, 'tournament', ids[1] as string)).toBe(true);
  expect(isUnlocked(p, 'tournament', ids[2] as string)).toBe(false);
});

test('training and two-player maps are always open', () => {
  const p = emptyProgress();
  for (const id of trackIds('training')) expect(isUnlocked(p, 'training', id)).toBe(true);
  for (const id of trackIds('duel')) expect(isUnlocked(p, 'duel', id)).toBe(true);
});

test('next map and track lookup', () => {
  expect(nextLevel('tournament', 't1-1')).toBe('t1-2');
  expect(nextLevel('tournament', 't1-6')).toBe('t2-1');
  expect(nextLevel('tournament', 't9-6')).toBeUndefined();
  expect(trackOf('training-03')).toBe('training');
  expect(trackOf('duel-05')).toBe('duel');
  expect(trackOf('t4-2')).toBe('tournament');
});

test('a win is recorded once', () => {
  const p = recordWin(recordWin(emptyProgress(), 't1-1'), 't1-1');
  expect(p.won).toEqual(['t1-1']);
});
