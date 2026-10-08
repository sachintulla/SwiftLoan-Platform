#!/usr/bin/env node
/**
 * Writes candidate "click" sounds to docs/sound-samples/ (WAV) plus an index.html with play
 * buttons, so a click can be chosen by ear. Not part of the app bundle.
 *
 *   node scripts/gen-click-samples.js
 */
const fs = require('fs');
const path = require('path');
const SR = 22050;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}
function render(ms, fn) {
  const n = Math.round((SR * ms) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i / n);
  const edge = Math.min(Math.round(SR * 0.001), n >> 1);
  for (let i = 0; i < edge; i++) {
    out[i] *= i / edge;
    out[n - 1 - i] *= i / edge;
  }
  return out;
}
const sine = (f, t) => Math.sin(2 * Math.PI * f * t);
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
const gain = (b, g) => b.map(v => v * g);
function lowpass(b, a) {
  let y = 0;
  return b.map(v => (y += a * (v - y)));
}
function highpass(b, a) {
  const lp = lowpass(Float32Array.from(b), a);
  return b.map((v, i) => v - lp[i]);
}
function normalise(b, peak = 0.5) {
  let pk = 0;
  for (const v of b) pk = Math.max(pk, Math.abs(v));
  return gain(b, peak / (pk || 1));
}
// phase-correct gliding tone
const glide = (f0, f1, ms, k, over = 0) =>
  render(ms, t => {
    const dur = ms / 1000;
    const ph = f0 * t + ((f1 - f0) * t * t) / (2 * dur);
    return (Math.sin(2 * Math.PI * ph) + over * Math.sin(2 * Math.PI * ph * 2.01)) * env(t, k);
  });

const r = rng(9);
const samples = [
  ['01-soft-tock', 'Soft tock (the current tap): a rounded note falling in pitch', normalise(glide(560, 380, 60, 60, 0.15), 0.5)],
  ['02-glass-tap', 'Glass tap: a bright, clean ping — modern and light', normalise(mix(render(46, t => sine(1850, t) * env(t, 95)), render(30, t => sine(3700, t) * env(t, 150) * 0.25)), 0.42)],
  ['03-wood-block', 'Wood block: a warm, dry knock with a tiny transient', normalise(mix(lowpass(render(14, () => r()), 0.5).map(v => v * 0.6), render(70, t => sine(760, t) * env(t, 70) + 0.3 * sine(1520, t) * env(t, 110))), 0.5)],
  ['04-soft-pop', 'Soft pop: a rounded bubble pop, low and friendly', normalise(glide(420, 170, 58, 55, 0), 0.55)],
  ['05-dry-click', 'Dry click: a very short, crisp mechanical click', normalise(mix(highpass(lowpass(render(9, (t) => r() * env(t, 420)), 0.8), 0.3), render(14, t => sine(2600, t) * env(t, 330) * 0.5)), 0.45)],
  ['06-switch', 'Mechanical switch: a quick down-click then a softer up-click', normalise(mix(render(20, t => sine(1450, t) * env(t, 200)), delay(render(22, t => sine(950, t) * env(t, 190) * 0.55), 34)), 0.45)],
  ['07-marimba', 'Marimba tick: a warm mallet tone with a gentle overtone', normalise(render(120, t => (sine(880, t) + 0.35 * sine(3410, t) * env(t, 60)) * env(t, 38)), 0.45)],
  ['08-droplet', 'Water droplet: a quick rising "bloop"', normalise(glide(620, 1250, 52, 48, 0.1), 0.5)],
  ['09-ios-like', 'Keyboard-style tock: short, mid-pitched, very neutral', normalise(mix(render(18, t => sine(1180, t) * env(t, 190)), render(26, t => sine(590, t) * env(t, 120) * 0.6)), 0.45)],
  ['10-bubble-double', 'Double tick: two tiny notes, cheerful and clear', normalise(mix(render(24, t => sine(1320, t) * env(t, 150)), delay(render(30, t => sine(1760, t) * env(t, 130)), 30)), 0.45)],
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

const dir = path.join(__dirname, '../docs/sound-samples');
fs.mkdirSync(dir, { recursive: true });
let rows = '';
for (const [id, desc, buf] of samples) {
  const w = wav(buf);
  fs.writeFileSync(path.join(dir, `click-${id}.wav`), w);
  rows += `<div class="row"><button onclick="document.getElementById('${id}').currentTime=0;document.getElementById('${id}').play()">▶ ${id}</button><span>${desc}</span><audio id="${id}" src="data:audio/wav;base64,${w.toString('base64')}"></audio></div>\n`;
  console.log(id.padEnd(18), `${Math.round((buf.length / SR) * 1000)} ms`);
}
fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Click sound samples</title>
<style>body{font:15px system-ui;margin:24px;max-width:720px;color:#0A3F41;background:#F6FBFA}h1{font-size:20px}.row{display:flex;gap:14px;align-items:center;padding:10px 0;border-bottom:1px solid #d9e8e6}button{font:600 14px system-ui;padding:9px 14px;border-radius:10px;border:0;background:#079FA0;color:#fff;min-width:200px;text-align:left;cursor:pointer}button:active{transform:scale(.97)}span{color:#4b6a6a}</style>
<h1>Click sound samples</h1><p>Tap each one and pick the one you like. Turn your volume to a normal level.</p>
${rows}`);
