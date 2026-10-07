#!/usr/bin/env node
/**
 * Candidate SCROLL sounds, round 4: real "scrolling" sounds — smooth swipes, glides, slides and
 * rolls (continuous motion, not taps or ticks). Writes docs/sound-samples/scroll-swipes/.
 *
 *   node scripts/gen-scroll-samples-swipes.js
 */
const fs = require('fs');
const path = require('path');
const SR = 22050;
const PEAK = 0.25; // gentle — the earlier swipe was too loud

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}
const norm = b => {
  let pk = 0;
  for (const v of b) pk = Math.max(pk, Math.abs(v));
  return b.map(v => (v * PEAK) / (pk || 1));
};
const shape = (p, peakAt) =>
  p < peakAt ? Math.sin((Math.PI / 2) * (p / peakAt)) ** 2 : Math.cos((Math.PI / 2) * ((p - peakAt) / (1 - peakAt))) ** 2;

/**
 * Band-passed noise whose centre frequency moves f0 → f1 (state-variable filter), shaped by a
 * smooth in/out envelope. `q` = damping (low = more whistly, high = broad air); `am` adds a
 * grainy amplitude modulation at that many Hz for a "rolling" texture; `fadeEdge` softens the ends.
 */
function swipe(ms, f0, f1, { q = 0.6, peakAt = 0.35, curve = 1.2, seed = 3, am = 0, amDepth = 0.5 } = {}) {
  const r = rng(seed);
  const n = Math.round((SR * ms) / 1000);
  const out = new Float32Array(n);
  let low = 0;
  let band = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const t = i / SR;
    const fc = f0 + (f1 - f0) * p ** curve;
    const f = 2 * Math.sin((Math.PI * Math.min(Math.max(fc, 60), 9000)) / SR);
    const high = r() - low - q * band;
    band += f * high;
    low += f * band;
    const mod = am ? 1 - amDepth + amDepth * (0.5 + 0.5 * Math.sin(2 * Math.PI * am * t)) : 1;
    out[i] = band * shape(p, peakAt) * mod;
  }
  return out;
}
/** A soft low tone gliding under a little air — a "smooth roll" with some body. */
function glideAir(ms, f0, f1, airMix = 0.6) {
  const air = swipe(ms, 500, 1400, { q: 0.9, peakAt: 0.4, seed: 9 });
  const n = Math.round((SR * ms) / 1000);
  const dur = ms / 1000;
  let airPk = 0;
  for (const v of air) airPk = Math.max(airPk, Math.abs(v));
  return Float32Array.from({ length: n }, (_, i) => {
    const t = i / SR;
    const p = i / n;
    const ph = f0 * t + ((f1 - f0) * t * t) / (2 * dur);
    return Math.sin(2 * Math.PI * ph) * shape(p, 0.4) * (1 - airMix) + (air[i] / (airPk || 1)) * airMix;
  });
}

const samples = [
  ['01-swipe-short', 'Short swipe: a quick, light "suup"', norm(swipe(120, 700, 2600, { q: 0.55, peakAt: 0.35, seed: 3 }))],
  ['02-swipe-medium', 'Medium swipe: a smooth "suuup"', norm(swipe(190, 600, 2400, { q: 0.6, peakAt: 0.4, seed: 5 }))],
  ['03-swipe-long', 'Long glide: a slow, relaxed swipe', norm(swipe(280, 450, 1900, { q: 0.75, peakAt: 0.45, seed: 7 }))],
  ['04-swipe-up', 'Swipe up: the sound rises (scrolling down the page)', norm(swipe(170, 500, 2800, { q: 0.6, peakAt: 0.4, seed: 11 }))],
  ['05-swipe-down', 'Swipe down: the sound falls (scrolling back up)', norm(swipe(170, 2800, 500, { q: 0.6, peakAt: 0.35, seed: 13 }))],
  ['06-finger-slide', 'Finger slide: a dry, glassy slide across a screen', norm(swipe(160, 1800, 3400, { q: 0.35, peakAt: 0.4, seed: 17 }))],
  ['07-cloth-swish', 'Cloth swish: low and soft, like fabric brushing', norm(swipe(190, 280, 1100, { q: 1.0, peakAt: 0.4, seed: 19 }))],
  ['08-paper-slide', 'Paper slide: airy and light, a sheet sliding', norm(swipe(150, 2200, 4800, { q: 0.45, peakAt: 0.35, seed: 23 }))],
  ['09-breeze', 'Breeze: a very soft breath of air', norm(swipe(300, 250, 700, { q: 1.3, peakAt: 0.5, seed: 29 }))],
  ['10-rolling', 'Rolling: a smooth roll with a subtle grain, like a wheel turning', norm(swipe(230, 500, 1600, { q: 0.7, peakAt: 0.4, seed: 31, am: 55, amDepth: 0.55 }))],
  ['11-soft-roll-tone', 'Soft roll with body: a low tone gliding under a little air', norm(glideAir(210, 220, 340, 0.55))],
  ['12-light-whoosh', 'Light whoosh: the agent\'s scroll glide, but lighter', norm(swipe(260, 350, 1500, { q: 0.9, peakAt: 0.42, seed: 77 }))],
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

const dir = path.join(__dirname, '../docs/sound-samples/scroll-swipes');
fs.mkdirSync(dir, { recursive: true });
let rows = '';
for (const [id, desc, buf] of samples) {
  const w = wav(buf);
  fs.writeFileSync(path.join(dir, `scroll-${id}.wav`), w);
  rows += `<div class="row"><button onclick="document.getElementById('${id}').currentTime=0;document.getElementById('${id}').play()">▶ ${id}</button><span>${desc}</span><audio id="${id}" src="data:audio/wav;base64,${w.toString('base64')}"></audio></div>\n`;
  console.log(id.padEnd(20), `${Math.round((buf.length / SR) * 1000)} ms`);
}
fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scroll swipe sounds</title>
<style>body{font:15px system-ui;margin:24px;max-width:780px;color:#0A3F41;background:#F6FBFA}h1{font-size:20px}.row{display:flex;gap:14px;align-items:center;padding:10px 0;border-bottom:1px solid #d9e8e6}button{font:600 14px system-ui;padding:9px 14px;border-radius:10px;border:0;background:#079FA0;color:#fff;min-width:230px;text-align:left;cursor:pointer}button:active{transform:scale(.97)}span{color:#4b6a6a}</style>
<h1>Scroll swipe sounds</h1><p>Real scrolling sounds — smooth swipes, slides and rolls. They are quiet on purpose. In the app one plays per ~260 px of scrolling.</p>
${rows}`);
