#!/usr/bin/env node
/**
 * Candidate SCROLL sounds, round 5: NOT air-swipes and NOT single taps — motion made of several
 * tiny events or a pure tonal glide: wheel rolls, ratchets, soft harp glissandos, tonal slides.
 * Writes docs/sound-samples/scroll-rolls/.
 *
 *   node scripts/gen-scroll-samples-rolls.js
 */
const fs = require('fs');
const path = require('path');
const SR = 22050;
const PEAK = 0.25;

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
const norm = b => {
  let pk = 0;
  for (const v of b) pk = Math.max(pk, Math.abs(v));
  return b.map(v => (v * PEAK) / (pk || 1));
};
/** Lay several events on a timeline: events = [[atMs, buffer, gain], ...]. */
function timeline(events) {
  const end = Math.max(...events.map(([at, b]) => Math.round((SR * at) / 1000) + b.length));
  const out = new Float32Array(end);
  for (const [at, b, g = 1] of events) {
    const o = Math.round((SR * at) / 1000);
    for (let i = 0; i < b.length; i++) out[o + i] += b[i] * g;
  }
  return out;
}
const tick = (f, ms, k) => render(ms, t => sin(f, t) * env(t, k));
const note = (f, ms, k, over = 0.12) =>
  render(ms, t => {
    const a = Math.min(1, t / 0.004);
    return (sin(f, t) + over * sin(f * 2.01, t)) * (0.5 - 0.5 * Math.cos(Math.PI * a)) * env(t, k);
  });
const glideTone = (f0, f1, ms, { over = 0, peakAt = 0.4 } = {}) => {
  const dur = ms / 1000;
  return render(ms, (t, p) => {
    const ph = f0 * t + ((f1 - f0) * t * t) / (2 * dur);
    const e = p < peakAt ? Math.sin((Math.PI / 2) * (p / peakAt)) ** 2 : Math.cos((Math.PI / 2) * ((p - peakAt) / (1 - peakAt))) ** 2;
    return (Math.sin(2 * Math.PI * ph) + over * Math.sin(2 * Math.PI * ph * 2)) * e;
  });
};

// spacing in ms between events, e.g. decelerating = gaps growing
const roll = (n, firstGap, growth, f, evMs, k, fall = 0.9) => {
  const events = [];
  let at = 0;
  let gap = firstGap;
  let g = 1;
  for (let i = 0; i < n; i++) {
    events.push([at, tick(f, evMs, k), g]);
    at += gap;
    gap *= growth;
    g *= fall;
  }
  return timeline(events);
};
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0]; // C5 D5 E5 G5 A5

const samples = [
  ['01-wheel-roll', 'Wheel roll: a few soft detent clicks slowing down, like a mouse wheel', norm(roll(5, 22, 1.22, 700, 20, 200))],
  ['02-freewheel', 'Freewheel: quick ratchet clicks that decelerate and fade', norm(roll(8, 13, 1.28, 880, 14, 260, 0.84))],
  ['03-zip-roll', 'Zip roll: tiny ticks rising in pitch, like a zipper', norm(timeline(Array.from({ length: 8 }, (_, i) => [i * 17, tick(520 + i * 85, 12, 300), 1 - i * 0.05])))],
  ['04-dial-detents', 'Dial detents: three low, soft clicks like turning a knob', norm(roll(3, 48, 1.1, 280, 30, 120, 0.9))],
  ['05-harp-up', 'Harp up: a soft glissando of five notes rising', norm(timeline(PENTA.map((f, i) => [i * 30, note(f, 140, 26), 1 - i * 0.04])))],
  ['06-harp-down', 'Harp down: the same glissando falling', norm(timeline([...PENTA].reverse().map((f, i) => [i * 30, note(f, 140, 26), 1 - i * 0.04])))],
  ['07-marimba-roll', 'Marimba roll: three quick warm notes', norm(timeline([[0, note(880, 100, 40, 0.25)], [34, note(988, 100, 40, 0.25), 0.9], [68, note(1175, 130, 36, 0.25), 0.8]]))],
  ['08-bubble-stream', 'Bubble stream: a few tiny pops rising', norm(timeline([400, 480, 570, 690].map((f, i) => [i * 30, glideTone(f, f * 0.55, 24, { peakAt: 0.12 }), 1 - i * 0.08])))],
  ['09-slide-whistle', 'Slide whistle: a soft pure tone gliding up', norm(glideTone(400, 920, 150, { over: 0.1, peakAt: 0.45 }))],
  ['10-fader', 'Fader: a low, smooth tonal slide, like moving a volume slider', norm(glideTone(180, 340, 130, { over: 0.35, peakAt: 0.5 }))],
  ['11-pluck-glide', 'Pluck glide: a plucked string bending down slightly', norm(render(110, t => sin(620 * (1 - 0.1 * (t / 0.11)) + 0, t) * env(t, 38) + 0.3 * sin(1240, t) * env(t, 60)))],
  ['12-pulse-roll', 'Pulse roll: soft low pulses, like a gentle rumble rolling by', norm(render(190, (t, p) => sin(300, t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 48 * t)) * Math.sin(Math.PI * p) ** 1.5))],
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

const dir = path.join(__dirname, '../docs/sound-samples/scroll-rolls');
fs.mkdirSync(dir, { recursive: true });
let rows = '';
for (const [id, desc, buf] of samples) {
  const w = wav(buf);
  fs.writeFileSync(path.join(dir, `scroll-${id}.wav`), w);
  rows += `<div class="row"><button onclick="document.getElementById('${id}').currentTime=0;document.getElementById('${id}').play()">▶ ${id}</button><span>${desc}</span><audio id="${id}" src="data:audio/wav;base64,${w.toString('base64')}"></audio></div>\n`;
  console.log(id.padEnd(20), `${Math.round((buf.length / SR) * 1000)} ms`);
}
fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scroll roll sounds</title>
<style>body{font:15px system-ui;margin:24px;max-width:800px;color:#0A3F41;background:#F6FBFA}h1{font-size:20px}.row{display:flex;gap:14px;align-items:center;padding:10px 0;border-bottom:1px solid #d9e8e6}button{font:600 14px system-ui;padding:9px 14px;border-radius:10px;border:0;background:#079FA0;color:#fff;min-width:210px;text-align:left;cursor:pointer}button:active{transform:scale(.97)}span{color:#4b6a6a}</style>
<h1>Scroll roll sounds</h1><p>No air swipes, no single taps — rolls, ratchets, soft glissandos and tonal slides. Quiet on purpose. In the app one plays per ~260 px of scrolling.</p>
${rows}`);
