// The music layer (SPEC §11.2): plays the tracks of score.ts on a small Web Audio synth, through a
// music bus of its own into the engine's master volume. Notes are scheduled a little ahead on the
// audio clock, so the timing holds even when frames stutter. F2 turns the music off and on.

import { audioContext, audioIsRunning, audioMasterGain } from 'littlejsengine';
import { type Note, parseVoice, TRACKS, type Track, type TrackName, voiceSteps } from './score';

/** Seconds of notes scheduled ahead of the audio clock. */
const LOOKAHEAD = 0.25;
/** Fade when a track stops or gives way to another. */
const FADE = 0.4;
const VOLUME = 0.7;
const SETTING_KEY = 'counterfire.music';

interface Playing {
  name: TrackName;
  track: Track;
  voices: Note[][];
  /** Steps in one pass, the step length in seconds, and when step 0 of the current pass sounds. */
  length: number;
  step: number;
  start: number;
  /** Next note to schedule in each voice, and the bus the notes go through. */
  next: number[];
  bus: GainNode;
}

const parsed = new Map<TrackName, Note[][]>();
let wanted: TrackName | undefined;
let playing: Playing | undefined;
let enabled = loadSetting();

function loadSetting(): boolean {
  try {
    return localStorage.getItem(SETTING_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function musicEnabled(): boolean {
  return enabled;
}

export function setMusicEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(SETTING_KEY, on ? 'on' : 'off');
  } catch {
    // private windows may refuse storage; the setting just isn't remembered
  }
  if (!on) stop();
}

/**
 * Ask for a track, or silence. Asking again for the track already asked for changes nothing, so a
 * one-shot track that has moved on to its `next` is not started over.
 */
export function setMusic(name: TrackName | undefined): void {
  if (name === wanted) return;
  wanted = name;
  stop();
  if (name) begin(name);
}

/** Call once a frame: schedules the next stretch of notes. */
export function updateMusic(): void {
  if (!playing && wanted && enabled) begin(wanted);
  const p = playing;
  if (!p || !audioIsRunning()) return;
  const now = audioContext.currentTime;
  // the clock ran on while audio was suspended: pick up from now
  if (p.start + p.length * p.step < now - 1) restart(p, now);
  const horizon = now + LOOKAHEAD;
  for (;;) {
    let pending = false;
    p.voices.forEach((notes, v) => {
      const voice = p.track.voices[v];
      for (let i = p.next[v] as number; i < notes.length; i++) {
        const note = notes[i] as Note;
        const at = p.start + note.at * p.step;
        if (at >= horizon) {
          pending = true;
          break;
        }
        if (voice && note.freq) sound(p, voice.wave, voice.gain, note.freq, at, note.steps * p.step);
        p.next[v] = i + 1;
      }
    });
    if (pending) return;
    // every voice is scheduled to the end of the pass
    const end = p.start + p.length * p.step;
    if (end >= horizon) return;
    if (p.track.loop) {
      p.start = end;
      p.next = p.voices.map(() => 0);
      continue;
    }
    const next = p.track.next;
    playing = undefined;
    if (next && enabled) begin(next, end);
    return;
  }
}

function begin(name: TrackName, at?: number): void {
  if (!enabled || !audioContext) return;
  const track = TRACKS[name];
  let voices = parsed.get(name);
  if (!voices) {
    voices = track.voices.map((v) => parseVoice(v.notes));
    parsed.set(name, voices);
  }
  const bus = audioContext.createGain();
  bus.gain.value = VOLUME;
  bus.connect(audioMasterGain);
  playing = {
    name,
    track,
    voices,
    length: Math.max(...track.voices.map((v) => voiceSteps(v.notes))),
    step: 60 / track.bpm / track.stepsPerQuarter,
    start: Math.max(at ?? 0, audioContext.currentTime + 0.05),
    next: voices.map(() => 0),
    bus,
  };
}

function restart(p: Playing, now: number): void {
  p.start = now + 0.05;
  p.next = p.voices.map(() => 0);
}

/** Fade out whatever is playing; its scheduled notes die with its bus. */
function stop(): void {
  const p = playing;
  playing = undefined;
  if (!p || !audioContext) return;
  const now = audioContext.currentTime;
  p.bus.gain.cancelScheduledValues(now);
  p.bus.gain.setValueAtTime(p.bus.gain.value, now);
  p.bus.gain.linearRampToValueAtTime(0, now + FADE);
  setTimeout(() => p.bus.disconnect(), (FADE + LOOKAHEAD + 0.1) * 1000);
}

/** One note: an oscillator through a short attack and release, a little detached from the next. */
function sound(
  p: Playing,
  wave: OscillatorType,
  gain: number,
  freq: number,
  at: number,
  length: number,
): void {
  const osc = audioContext.createOscillator();
  osc.type = wave;
  osc.frequency.value = freq;
  const env = audioContext.createGain();
  const end = at + Math.max(0.03, length * 0.9);
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.008);
  env.gain.setValueAtTime(gain * 0.8, Math.max(at + 0.009, end - 0.03));
  env.gain.linearRampToValueAtTime(0, end);
  osc.connect(env).connect(p.bus);
  osc.start(at);
  osc.stop(end + 0.01);
}
