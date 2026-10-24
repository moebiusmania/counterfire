// The music (SPEC §11.2): the original's classical pieces, our own short arrangements of the
// public-domain scores, written as note lists for the synth in music.ts. Each is a loop of the
// best-known passage, simplified to a melody, a harmony line and a bass.
//
// A voice is a string of notes: `<name><octave>:<steps>`, like `f#4:2` or `bb3:1`, or `r:<steps>`
// for a rest; a note without `:<steps>` keeps the previous length, and `|` marks bars for the
// reader only. Each track says how many steps make a quarter note.

export type TrackName = 'heli' | 'tank' | 'asv' | 'jeep' | 'flagCaptured' | 'victory';

export interface Voice {
  wave: OscillatorType;
  /** Loudness before the music volume, about .05 to .2. */
  gain: number;
  notes: string;
}

export interface Track {
  title: string;
  /** Quarter notes a minute. */
  bpm: number;
  stepsPerQuarter: number;
  /** Loop for as long as it is wanted; otherwise play once and go on to `next`, or stop. */
  loop: boolean;
  next?: TrackName;
  voices: Voice[];
}

export interface Note {
  /** Start and length in steps; frequency in Hz, 0 for a rest. */
  at: number;
  steps: number;
  freq: number;
}

const SEMITONES: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** Frequency of a note name like `c#4` or `bb3`, equal temperament with A4 at 440 Hz. */
export function noteFreq(name: string): number {
  const m = /^([a-g])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note '${name}'`);
  const [, letter, accidental, octave] = m;
  const semis =
    (SEMITONES[letter as string] as number) + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
  const midi = 12 * (Number(octave) + 1) + semis;
  return 440 * 2 ** ((midi - 69) / 12);
}

/** A voice's notes with their start steps. */
export function parseVoice(notes: string): Note[] {
  const out: Note[] = [];
  let at = 0;
  let steps = 1;
  for (const token of notes.split(/\s+/)) {
    if (!token || token === '|') continue;
    const [name, len] = token.split(':');
    if (len !== undefined) steps = Number(len);
    if (!(steps > 0)) throw new Error(`bad length in '${token}'`);
    out.push({ at, steps, freq: name === 'r' ? 0 : noteFreq(name as string) });
    at += steps;
  }
  return out;
}

/** A voice's length in steps. */
export function voiceSteps(notes: string): number {
  const parsed = parseVoice(notes);
  const last = parsed[parsed.length - 1];
  return last ? last.at + last.steps : 0;
}

const lead = (notes: string, gain = 0.11): Voice => ({ wave: 'square', gain, notes });
const pad = (notes: string, gain = 0.09): Voice => ({ wave: 'triangle', gain, notes });
const bass = (notes: string, gain = 0.12): Voice => ({ wave: 'sawtooth', gain, notes });

export const TRACKS: Record<TrackName, Track> = {
  // Wagner, Ride of the Valkyries: the horn call in 9/8, B minor then D major. 18 steps a bar.
  heli: {
    title: 'Ride of the Valkyries',
    bpm: 150,
    stepsPerQuarter: 4,
    loop: true,
    voices: [
      lead(`
        f#3:2 b3:3 f#3:1 b3:2 d4:10 | b3:3 d4:1 b3:2 d4:3 f#4:1 d4:2 f#4:6 |
        d4:3 f#4:1 d4:2 f#4:3 a4:1 f#4:2 a4:6 | f#4:18 |
        a3:2 d4:3 a3:1 d4:2 f#4:10 | d4:3 f#4:1 d4:2 f#4:3 a4:1 f#4:2 a4:6 |
        f#4:3 a4:1 f#4:2 a4:3 d5:1 a4:2 d5:6 | a4:12 c#5:6`),
      // the strings' rushing trill, a semitone shake on the chord
      pad(
        `${'f#4:1 g4:1 '.repeat(18)}| ${'f#4:1 g4:1 '.repeat(9)}${'a4:1 bb4:1 '.repeat(9)}|
         ${'f#4:1 g4:1 '.repeat(18)}| ${'e4:1 f4:1 '.repeat(9)}${'a4:1 bb4:1 '.repeat(9)}`,
        0.045,
      ),
      bass(`
        b1:6 b1 b1 | b1 b1 b1 | b1 b1 b1 | f#1 f#1 f#1 |
        d2:6 d2 d2 | d2 d2 d2 | d2 d2 d2 | a1 a1 a1`),
    ],
  },
  // Holst, Mars from The Planets: the 5/4 ostinato on G under a slow chromatic brass line.
  // 12 steps a quarter, so the ostinato's triplets fit: 60 steps a bar.
  tank: {
    title: 'Mars, the Bringer of War',
    bpm: 140,
    stepsPerQuarter: 12,
    loop: true,
    voices: [
      lead(`
        r:60 | g4:36 ab4:12 g4:12 | d5:36 db5:24 | c5:24 b4:12 bb4:24 |
        g4:36 ab4:12 g4:12 | eb5:36 d5:24 | db5:24 c5:12 b4:24 | g4:60`),
      pad(`
        d4:60 | d4:60 | f4:60 | eb4:60 |
        d4:60 | g4:60 | f4:60 | d4:60`),
      bass(`${'g2:4 g2 g2 g2:12 g2 g2:6 g2 g2:12 '.repeat(8)}`, 0.14),
    ],
  },
  // Grieg, In the Hall of the Mountain King: the creeping theme in B minor, then in F sharp.
  // Eighth notes: 8 steps a bar.
  asv: {
    title: 'In the Hall of the Mountain King',
    bpm: 132,
    stepsPerQuarter: 2,
    loop: true,
    voices: [
      lead(`
        b3:1 c#4 d4 e4 f#4 d4 f#4:2 | f4:1 c#4 f4:2 e4:1 c4 e4:2 |
        b3:1 c#4 d4 e4 f#4 d4 f#4 b4 | a4 f#4 d4 f#4 a4:4 |
        f#4:1 g#4 a#4 b4 c#5 a#4 c#5:2 | d5:1 a#4 d5:2 c#5:1 a#4 c#5:2 |
        f#4:1 g#4 a#4 b4 c#5 a#4 c#5:2 | d5:1 a#4 d5:2 c#5:4`),
      pad(`
        f#3:8 | f3:4 e3:4 | f#3:8 | f#3:8 |
        c#4:8 | d4:4 c#4:4 | c#4:8 | d4:4 c#4:4`),
      bass(`
        b2:1 r f#2 r b2 r f#2 r | c#3 r c#3 r c3 r c3 r |
        b2 r f#2 r b2 r f#2 r | f#2 r d2 r f#2 r a2 r |
        f#2 r c#3 r f#2 r c#3 r | b2 r b2 r f#2 r f#2 r |
        f#2 r c#3 r f#2 r c#3 r | b2 r b2 r f#2 r f#2 r`),
    ],
  },
  // Rimsky-Korsakov, Flight of the Bumblebee: the buzzing chromatic sixteenths in A minor.
  jeep: {
    title: 'Flight of the Bumblebee',
    bpm: 150,
    stepsPerQuarter: 4,
    loop: true,
    voices: [
      lead(
        `
        e5:1 d#5 d5 c#5 d5 c#5 c5 b4 c5 b4 a#4 a4 g#4 g4 f#4 f4 |
        e4 f4 e4 d#4 e4 f4 e4 d#4 e4 f4 e4 d#4 e4 f4 e4 d#4 |
        e4 d#4 d4 c#4 d4 c#4 c4 b3 c4 b3 a#3 a3 g#3 g3 f#3 f3 |
        e3 f3 f#3 g3 g#3 a3 a#3 b3 c4 c#4 d4 d#4 e4 f4 e4 d#4 |
        a4 bb4 a4 g#4 a4 bb4 a4 g#4 a4 bb4 a4 g#4 a4 bb4 a4 g#4 |
        a4 bb4 a4 g#4 g4 c5 b4 bb4 a4 bb4 a4 g#4 g4 c5 b4 bb4 |
        a4 g#4 g4 f#4 g4 f#4 f4 e4 f4 e4 d#4 d4 c#4 c4 b3 bb3 |
        a3 bb3 a3 g#3 a3 bb3 a3 g#3 a3:4 r:4`,
        0.09,
      ),
      bass(`
        a2:2 r a2 r a2 r a2 r | a2 r e2 r a2 r e2 r |
        a2 r a2 r a2 r a2 r | a2 r e2 r a2 r e2 r |
        d3 r d3 r d3 r d3 r | d3 r a2 r d3 r a2 r |
        e2 r e2 r e2 r e2 r | a2 r e2 r a2:4 r:4`),
    ],
  },
  // Rossini, the William Tell Overture: the galop's trumpet call, once, then the victory chorus.
  flagCaptured: {
    title: 'William Tell Overture',
    bpm: 152,
    stepsPerQuarter: 4,
    loop: false,
    next: 'victory',
    voices: [
      lead(
        `
        e4:1 e4 e4:2 e4:1 e4 e4:2 | e4:1 e4 a4:2 b4 c#5 |
        e4:1 e4 e4:2 e4:1 e4 e4:2 | e4:1 e4 a4:2 c#5 b4 |
        e4:1 e4 e4:2 e4:1 e4 e4:2 | e4:1 e4 a4:2 b4 c#5 |
        a4:2 c#5 e5:4 | a5:8`,
        0.12,
      ),
      pad(`
        c#4:8 | c#4:4 e4:4 | c#4:8 | c#4:4 d4:4 |
        c#4:8 | c#4:4 e4:4 | e4:8 | e4:8`),
      bass(`
        a2:2 e3 a2 e3 | a2 e3 a2 e3 | a2 e3 a2 e3 | e2 b2 e2 b2 |
        a2 e3 a2 e3 | a2 e3 a2 e3 | a2 e3 e2 b2 | a2:8`),
    ],
  },
  // Handel, the Hallelujah Chorus: the opening shouts, once, over the ticker tape.
  victory: {
    title: 'Hallelujah Chorus',
    bpm: 96,
    stepsPerQuarter: 4,
    loop: false,
    voices: [
      lead(
        `
        d5:4 a4:3 b4:1 a4:4 r:4 | d5:4 a4:3 b4:1 a4:4 r:4 |
        a4:4 b4 c#5 d5 | e5:4 c#5:4 d5:8`,
        0.12,
      ),
      pad(`
        f#4:4 e4:3 d4:1 e4:4 r:4 | f#4:4 e4:3 d4:1 e4:4 r:4 |
        f#4:4 g4 a4 a4 | a4:4 a4:4 f#4:8`),
      bass(`
        d3:4 a2:4 a2:4 r:4 | d3:4 a2:4 a2:4 r:4 |
        d3:4 g2 f#2 f#2 | a2:4 a2:4 d2:8`),
    ],
  },
};
