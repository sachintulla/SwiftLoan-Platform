#!/usr/bin/env node
/**
 * Candidate SCROLL sounds, round 2: plain, simple, "normal" ones — a single short, soft tone or
 * tick, nothing airy or musical. Writes docs/sound-samples/scroll-simple/ (WAV + index.html).
 *
 *   node scripts/gen-scroll-samples-simple.js
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
  const edge = Math.min(Math.round(SR * 0.0015), n >> 1);
  for (let i = 0; i < edge; i++) {
    out[i] *= i / edge;
    out[n - 1 - i] *= i / edge;
  }
  return out;
}
const env = (t, k) => Math.exp(-t * k);
const sin = (f, t) => Math.sin(2 * Math.PI * f * t);
const mix = (...b) => {
  const n = Math.max(...b.map(x => x.length));
  const o = new Float32Array(n);
  for (const x of b) for (let i = 0; i < x.length; i++) o[i] += x[i];
  return o;
};
const norm = b => {
  let pk = 0;
  for (const v of b) pk = Math.max(pk, Math.abs(v));
  return b.map(v => (v * PEAK) / (pk || 1));
};
/** Simple tone: short smooth attack, exponential decay. */
const tone = (f, ms, k, attackMs = 2, over = 0) =>
  render(ms, t => {
    const a = Math.min(1, t / (attackMs / 1000));
    return (sin(f, t) + over * sin(f * 2, t)) * (0.5 - 0.5 * Math.cos(Math.PI * a)) * env(t, k);
  });
const drop = (f0, f1, ms, k) => {
  const dur = ms / 1000;
  return render(ms, t => Math.sin(2 * Math.PI * (f0 * t + ((f1 - f0) * t * t) / (2 * dur))) * env(t, k));
};
/** The buffer shifted later by `ms` and scaled by `g`. */
const delayed = (b, ms, g = 1) => {
  const pad = Math.round((SR * ms) / 1000);
  const o = new Float32Array(b.length + pad);
  o.set(b.map(v => v * g), pad);
  return o;
};
const r = rng(5);
let ly = 0;
const softNoise = (ms, k, a) => render(ms, t => (ly += a * (r() - ly)) * env(t, k));

const samples = [
  ['01-plain-tick', 'Plain tick: one short neutral tick', norm(tone(900, 14, 260))],
  ['02-soft-tick', 'Soft tick: a touch lower and rounder', norm(tone(650, 20, 190, 3))],
  ['03-tiny-pop', 'Tiny pop: a smaller version of the click', norm(drop(380, 170, 30, 90))],
  ['04-light-tap', 'Light tap: a gentle mid-pitch tap', norm(tone(720, 28, 130, 3, 0.1))],
  ['05-high-tick', 'High tick: crisp but quiet', norm(tone(1400, 11, 320))],
  ['06-low-tock', 'Low tock: a small, warm knock', norm(drop(300, 190, 34, 85))],
  ['07-knock', 'Knock: a short wooden-ish knock', norm(mix(softNoise(8, 380, 0.6), tone(520, 26, 150, 1.5, 0.25)))],
  ['08-note', 'Single note: one short soft note', norm(tone(784, 45, 80, 4))],
  ['09-dot', 'Dot: the smallest, most subtle blip', norm(tone(1000, 8, 380, 1.5))],
  ['10-double-tick', 'Quick double tick: two tiny ticks close together', norm(mix(tone(850, 12, 280), delayed(tone(850, 12, 280), 36, 0.8)))],
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

const dir = path.join(__dirname, '../docs/sound-samples/scroll-simple');
fs.mkdirSync(dir, { recursive: true });
let rows = '';
for (const [id, desc, buf] of samples) {
  const w = wav(buf);
  fs.writeFileSync(path.join(dir, `scroll-${id}.wav`), w);
  rows += `<div class="row"><button onclick="document.getElementById('${id}').currentTime=0;document.getElementById('${id}').play()">▶ ${id}</button><span>${desc}</span><audio id="${id}" src="data:audio/wav;base64,${w.toString('base64')}"></audio></div>\n`;
  console.log(id.padEnd(16), `${Math.round((buf.length / SR) * 1000)} ms`);
}
fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Simple scroll sounds</title>
<style>body{font:15px system-ui;margin:24px;max-width:760px;color:#0A3F41;background:#F6FBFA}h1{font-size:20px}.row{display:flex;gap:14px;align-items:center;padding:10px 0;border-bottom:1px solid #d9e8e6}button{font:600 14px system-ui;padding:9px 14px;border-radius:10px;border:0;background:#079FA0;color:#fff;min-width:200px;text-align:left;cursor:pointer}button:active{transform:scale(.97)}span{color:#4b6a6a}</style>
<h1>Simple scroll sounds</h1><p>Plain, short, normal sounds — pick your favourite. In the app one plays per ~260 px of scrolling, a little quieter than here.</p>
${rows}`);
