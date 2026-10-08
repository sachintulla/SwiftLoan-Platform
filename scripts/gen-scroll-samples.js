#!/usr/bin/env node
/**
 * Writes candidate SCROLL sounds to docs/sound-samples/scroll/ (WAV) plus an index.html with play
 * buttons, so one can be chosen by ear. Not part of the app bundle.
 *
 *   node scripts/gen-scroll-samples.js
 *
 * Every sample is normalised to the same gentle peak, so they compare fairly; the app then plays
 * the chosen one at its own (lower) volume.
 */
const fs = require('fs');
const path = require('path');
const SR = 22050;
const PEAK = 0.3;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}
function render(ms, fn) {
  const n = Math.round((SR * ms) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i / n);
  const edge = Math.min(Math.round(SR * 0.002), n >> 1);
  for (let i = 0; i < edge; i++) {
    out[i] *= i / edge;
    out[n - 1 - i] *= i / edge;
  }
  return out;
}
const env = (t, k) => Math.exp(-t * k);
const mix = (...b) => {
  const n = Math.max(...b.map(x => x.length));
  const o = new Float32Array(n);
  for (const x of b) for (let i = 0; i < x.length; i++) o[i] += x[i];
  return o;
};
const delay = (b, ms) => {
  const pad = Math.round((SR * ms) / 1000);
  const o = new Float32Array(b.length + pad);
  o.set(b, pad);
  return o;
};
const norm = b => {
  let pk = 0;
  for (const v of b) pk = Math.max(pk, Math.abs(v));
  return b.map(v => (v * PEAK) / (pk || 1));
};
const bell = (p, peakAt = 0.35) =>
  p < peakAt ? Math.sin((Math.PI / 2) * (p / peakAt)) ** 2 : Math.cos((Math.PI / 2) * ((p - peakAt) / (1 - peakAt))) ** 2;

/** Band-passed air whose centre frequency moves from f0 to f1 (Chamberlin state-variable filter). */
function sweep(ms, f0, f1, { q = 0.55, peakAt = 0.35, curve = 1.3, seed = 1 } = {}) {
  const r = rng(seed);
  const n = Math.round((SR * ms) / 1000);
  const out = new Float32Array(n);
  let low = 0;
  let band = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const fc = f0 + (f1 - f0) * p ** curve;
    const f = 2 * Math.sin((Math.PI * Math.min(fc, 9000)) / SR);
    const high = r() - low - q * band;
    band += f * high;
    low += f * band;
    out[i] = band * bell(p, peakAt);
  }
  return out;
}
const glideTone = (f0, f1, ms, { over = 0, peakAt = 0.3 } = {}) =>
  render(ms, (t, p) => {
    const dur = ms / 1000;
    const ph = f0 * t + ((f1 - f0) * t * t) / (2 * dur);
    return (Math.sin(2 * Math.PI * ph) + over * Math.sin(2 * Math.PI * ph * 2.01)) * bell(p, peakAt);
  });
const pop = (f0, f1, ms, k) => {
  const dur = ms / 1000;
  return render(ms, t => Math.sin(2 * Math.PI * (f0 * t + ((f1 - f0) * t * t) / (2 * dur))) * env(t, k));
};

const samples = [
  ['01-suup-swipe', 'Suup swipe (current): a quick airy swipe that rises', norm(sweep(170, 650, 2550))],
  ['02-soft-air', 'Soft air: a longer, breathier, lower glide', norm(sweep(230, 380, 1500, { q: 0.9, peakAt: 0.4, seed: 4 }))],
  ['03-quick-swish', 'Quick swish: short and light, like a flick', norm(sweep(95, 900, 3200, { q: 0.5, peakAt: 0.3, seed: 6 }))],
  ['04-silk-fall', 'Silk fall: a smooth "shhh" that settles downward', norm(sweep(200, 2400, 500, { q: 0.8, peakAt: 0.25, curve: 1, seed: 8 }))],
  ['05-hush', 'Hush: very gentle, round, almost a breath', norm(sweep(200, 300, 900, { q: 1.2, peakAt: 0.45, seed: 12 }))],
  ['06-glass-slide', 'Glass slide: a soft tonal glide (no air)', norm(glideTone(700, 1500, 130, { over: 0.15 }))],
  ['07-whisper-up', 'Whisper up: a low, quiet "whooop" rising', norm(glideTone(300, 640, 150, { over: 0.1, peakAt: 0.4 }))],
  ['08-pop-roll', 'Pop roll: three tiny soft pops in a row (like the click)', norm(mix(pop(420, 170, 40, 70), delay(pop(450, 180, 40, 70), 55).map(v => v * 0.8), delay(pop(480, 190, 40, 70), 110).map(v => v * 0.6)))],
  ['09-wheel', 'Picker wheel: two quick soft detent ticks', norm(mix(render(22, t => Math.sin(2 * Math.PI * 980 * t) * env(t, 190)), delay(render(22, t => Math.sin(2 * Math.PI * 880 * t) * env(t, 190)).map(v => v * 0.8), 45)))],
  ['10-paper-flick', 'Paper flick: a short, dry, airy flick', norm(sweep(70, 1800, 4200, { q: 0.4, peakAt: 0.2, seed: 21 }))],
];

function wav(b) {
  const data = Buffer.alloc(b.length * 2);
  for (let i = 0; i < b.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const dir = path.join(__dirname, '../docs/sound-samples/scroll');
fs.mkdirSync(dir, { recursive: true });
let rows = '';
for (const [id, desc, buf] of samples) {
  const w = wav(buf);
  fs.writeFileSync(path.join(dir, `scroll-${id}.wav`), w);
  rows += `<div class="row"><button onclick="document.getElementById('${id}').currentTime=0;document.getElementById('${id}').play()">▶ ${id}</button><span>${desc}</span><audio id="${id}" src="data:audio/wav;base64,${w.toString('base64')}"></audio></div>\n`;
  console.log(id.padEnd(18), `${Math.round((buf.length / SR) * 1000)} ms`);
}
fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scroll sound samples</title>
<style>body{font:15px system-ui;margin:24px;max-width:760px;color:#0A3F41;background:#F6FBFA}h1{font-size:20px}.row{display:flex;gap:14px;align-items:center;padding:10px 0;border-bottom:1px solid #d9e8e6}button{font:600 14px system-ui;padding:9px 14px;border-radius:10px;border:0;background:#079FA0;color:#fff;min-width:210px;text-align:left;cursor:pointer}button:active{transform:scale(.97)}span{color:#4b6a6a}</style>
<h1>Scroll sound samples</h1><p>Tap each one and pick your favourite. They are all at the same gentle level; in the app they play a little quieter and only once per ~260 px of scrolling.</p>
${rows}`);
