import { expect, test } from 'bun:test';
import { noteFreq, parseVoice, TRACKS, voiceSteps } from '../src/audio/score';

test('note names map to equal-tempered frequencies', () => {
  expect(noteFreq('a4')).toBeCloseTo(440);
  expect(noteFreq('a3')).toBeCloseTo(220);
  expect(noteFreq('c4')).toBeCloseTo(261.63, 1);
  expect(noteFreq('f#4')).toBeCloseTo(noteFreq('gb4'));
  expect(() => noteFreq('h4')).toThrow();
});

test('a note without a length keeps the one before', () => {
  const notes = parseVoice('c4:2 d4 | r:4 e4:1');
  expect(notes.map((n) => [n.at, n.steps])).toEqual([
    [0, 2],
    [2, 2],
    [4, 4],
    [8, 1],
  ]);
  expect(notes[2]?.freq).toBe(0);
});

for (const [name, track] of Object.entries(TRACKS)) {
  test(`${name}: every voice parses and lasts the same whole number of bars`, () => {
    const lengths = track.voices.map((v) => voiceSteps(v.notes));
    expect(new Set(lengths).size).toBe(1);
    // whole bars, whatever the metre: at least the quarter note divides the length
    expect((lengths[0] as number) % track.stepsPerQuarter).toBe(0);
    if (track.next) expect(TRACKS[track.next]).toBeDefined();
  });
}
