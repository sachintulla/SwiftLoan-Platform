#!/usr/bin/env node
/**
 * Synthesises the app's UI sound effects and writes them to
 * src/feedback/soundData.ts as base64 WAV strings (22.05 kHz, 16-bit mono).
 *
 * They are embedded and handed to the native UiSound module at start-up, so there
 * are no binary assets to link on either platform. Re-run after tuning:
 *
 *   node scripts/gen-sounds.js
 */
const fs = require('fs');
const path = require('path');

const SR = 22050;

/** Seeded PRNG so the output is byte-for-byte reproducible. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296 * 2 - 1;
  };
}

function render(ms, fn) {
  const n = Math.round((SR * ms) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i / n);
  // 1.5 ms fade in / out so no sound starts or ends with a click.
  const edge = Math.min(Math.round(SR * 0.0015), n >> 1);
  for (let i = 0; i < edge; i++) {
    const g = i / edge;
    out[i] *= g;
    out[n - 1 - i] *= g;
  }
  return out;
}

const sine = (f, t) => Math.sin(2 * Math.PI * f * t);
const env = (t, decay) => Math.exp(-t * decay);

/** One-pole low-pass over a buffer, for softening noise. */
function lowpass(buf, a) {
  let y = 0;
  for (let i = 0; i < buf.length; i++) {
    y += a * (buf[i] - y);
    buf[i] = y;
  }
  return buf;
}

function mix(...bufs) {
  const n = Math.max(...bufs.map(b => b.length));
  const out = new Float32Array(n);
  for (const b of bufs) for (let i = 0; i < b.length; i++) out[i] += b[i];
  return out;
}

function delay(buf, ms) {
  const pad = Math.round((SR * ms) / 1000);
  const out = new Float32Array(buf.length + pad);
  out.set(buf, pad);
  return out;
}

function gain(buf, g) {
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}

/**
 * Typing tick: one clean, soft "tok" — a short sine with a quick pitch drop and fast decay.
 * No noise layer, no resonance: it should read as a plain, unobtrusive key click.
 */
function key(f, amp) {
  return gain(render(22, t => sine(f - 5000 * t, t) * env(t, 190)), amp);
}

/**
 * A soft, rounded note: raised-cosine attack (so there is never a hard onset), exponential decay,
 * and an optional quiet overtone for a glassy, "designed" timbre. All the cues are built from
 * these, pitched inside C major pentatonic, so they sound like one family.
 */
function note(f, ms, { decay = 30, attack = 5, over = 0, glide = 0, amp = 1 } = {}) {
  const dur = ms / 1000;
  return render(ms, t => {
    // phase is the INTEGRAL of the gliding frequency, so the sweep is clean (no chirp artefacts)
    const ph = f * (t + (0.5 * glide * t * t) / dur);
    const a = Math.min(1, t / (attack / 1000));
    const att = 0.5 - 0.5 * Math.cos(Math.PI * a);
    const tone = Math.sin(2 * Math.PI * ph) + over * Math.sin(2 * Math.PI * ph * 2.01);
    return tone * att * env(t, decay) * amp;
  });
}

/**
 * "Soft pop" — the chosen button sound: a rounded, low, friendly bubble pop (phase-correct downward
 * glide f0 → f1 over 58 ms), normalised to a fixed peak. tap/select use the base pitch; the toggle
 * on/off cues are the SAME pop a little higher / lower so the direction still reads.
 */
function softPop(f0, f1, peak = 0.55) {
  const dur = 0.058;
  const b = render(58, t => Math.sin(2 * Math.PI * (f0 * t + ((f1 - f0) * t * t) / (2 * dur))) * env(t, 55));
  let pk = 0;
  for (const v of b) pk = Math.max(pk, Math.abs(v));
  return gain(b, peak / (pk || 1));
}

const sounds = {
  // Typing: the same simple tick, nudged a few percent in pitch so it doesn't sound mechanical.
  tick1: key(1250, 0.42),
  tick2: key(1300, 0.42),
  tick3: key(1200, 0.42),
  // Backspace: the same sound, lower.
  del: key(800, 0.36),
  // Buttons / taps / selected options: the soft pop (chosen from the click samples).
  tap: softPop(420, 170),
  select: softPop(420, 170),
  // Toggles: the same pop, higher for ON and lower for OFF.
  toggleOn: softPop(520, 215),
  toggleOff: softPop(330, 135),
  // Slider detent.
  slide: gain(render(26, t => sine(1250, t) * env(t, 170)), 0.42),
  // Scrolling (the user's and the agent's): "pulse roll" — soft low pulses, like a gentle rumble
  // rolling by (chosen from the scroll samples). A 300 Hz tone amplitude-modulated at 48 Hz under a
  // smooth in/out envelope. Mastered LOUD (peak 0.8 vs the soft pop's 0.55): a low rumble reads far
  // quieter than a pop on a phone speaker, so it needs the extra level to sound as present as taps.
  scroll: (() => {
    const b = render(190, (t, p) => sine(300, t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 48 * t)) * Math.sin(Math.PI * p) ** 1.5);
    let pk = 0;
    for (const v of b) pk = Math.max(pk, Math.abs(v));
    return gain(b, 0.8 / (pk || 1));
  })(),
  error: gain(
    mix(
      render(70, t => sine(220, t) * env(t, 28)),
      delay(render(90, t => sine(196, t) * env(t, 22)), 85),
    ),
    0.5,
  ),
  // Moving to another screen.
  nav: gain(render(80, t => sine(420 + 1300 * t, t) * env(t, 38)), 0.34),
};

function toWav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

const lines = [];
let total = 0;
for (const [name, samples] of Object.entries(sounds)) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak > 0.95) throw new Error(`${name} clips (peak ${peak.toFixed(2)})`);
  const wav = toWav(samples);
  total += wav.length;
  lines.push(`  ${name}: '${wav.toString('base64')}',`);
  console.log(`${name.padEnd(10)} ${String(Math.round((samples.length / SR) * 1000)).padStart(4)} ms  peak ${peak.toFixed(2)}  ${wav.length} B`);
}

const out = `// GENERATED by scripts/gen-sounds.js — do not edit by hand.
// 22.05 kHz, 16-bit mono WAV, base64. Handed to the native UiSound module at start-up.

export const SOUND_DATA = {
${lines.join('\n')}
} as const;

export type SoundName = keyof typeof SOUND_DATA;
`;
fs.mkdirSync(path.join(__dirname, '../src/feedback'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '../src/feedback/soundData.ts'), out);
// The website plays the same clips (WebAudio), and website-next is a separate app that cannot import
// from ../src, so it keeps its own copy — written here so the two can never drift.
fs.writeFileSync(path.join(__dirname, '../website-next/src/feedback/soundData.ts'), out);
console.log(`\nwrote src/feedback/soundData.ts (${Math.round(total / 1024)} KB of WAV)`);
