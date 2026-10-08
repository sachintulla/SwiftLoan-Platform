#!/usr/bin/env node
/**
 * Builds docs/sound-samples/current/: the app's CURRENT sound set as WAV files plus an index.html
 * that lists each sound, where it plays, and a button to hear it. Reads src/feedback/soundData.ts
 * (so it always matches what ships); re-run after changing sounds.
 *
 *   node scripts/gen-sound-catalog.js
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../src/feedback/soundData.ts'), 'utf8');
const data = {};
for (const m of src.matchAll(/^\s{2}(\w+): '([A-Za-z0-9+/=]+)',$/gm)) data[m[1]] = m[2];

// Where each sound plays. who: A = the voice agent, M = the user's own interaction (manual TEST MODE only),
// ALWAYS = the user, in production too.
const GROUPS = [
  ['Buttons & choices', [
    ['tap', 'Soft pop', 'Any button press', ['M: pressing any button', 'A: the agent taps a button']],
    ['select', 'Soft pop (same as tap)', 'Choosing an option', ['M: picking a chip / option (gender, employment…)', 'A: the agent picks an option']],
    ['toggleOn', 'Soft pop, a little higher', 'Switching ON', ['M: toggle or checkbox switched on', 'A: the agent turns something on']],
    ['toggleOff', 'Soft pop, a little lower', 'Switching OFF', ['M: toggle or checkbox switched off', 'A: the agent turns something off']],
  ]],
  ['Typing', [
    ['tick1', 'Typing tick (variant 1)', 'Each character typed', ['M: you type in a field', 'A: the agent types a value, character by character']],
    ['tick2', 'Typing tick (variant 2)', 'Each character typed', ['rotates with the other two so it never sounds mechanical']],
    ['tick3', 'Typing tick (variant 3)', 'Each character typed', ['rotates with the other two']],
    ['del', 'Backspace tick', 'Deleting', ['M: you delete a character', 'A: the agent clears a field before retyping']],
  ]],
  ['Sliders & scrolling', [
    ['slide', 'Slider detent', 'Slider movement', ['M: you drag a slider (amount / tenure / rate)', 'A: the agent walks a slider to its new value, one step at a time']],
    ['scroll', 'Pulse roll', 'Scrolling', ['M: one per ~260 px as you scroll', 'A: the same sound when the page scrolls itself to bring a field/button into view, or the agent scrolls on request']],
  ]],
  ['Problems', [
    ['error', 'Low two-note', 'Something was refused', ['A: an entry was rejected (e.g. a date that is not allowed)']],
  ]],
  ['Menu bar', [
    ['nav', 'Rising glide', 'Switching tab / screen', ['M: you tap Home / My Offers / My Loans / Profile (test mode only)', 'A: the agent switches tab, navigates, or opens a loan']],
  ]],
];

const outDir = path.join(__dirname, '../docs/sound-samples/current');
fs.mkdirSync(outDir, { recursive: true });
const tag = line => {
  const who = line.startsWith('M:') ? ['You (test mode)', 'm'] : line.startsWith('A:') ? ['Agent', 'a'] : line.startsWith('ALWAYS:') ? ['You (always)', 'y'] : ['', ''];
  return who[0] ? `<li><b class="${who[1]}">${who[0]}</b> ${line.replace(/^(M|A|ALWAYS):\s*/, '')}</li>` : `<li class="note">${line}</li>`;
};
let sections = '';
let count = 0;
for (const [title, items] of GROUPS) {
  let rows = '';
  for (const [id, name, when, uses] of items) {
    if (!data[id]) throw new Error('missing sound ' + id);
    const wavBuf = Buffer.from(data[id], 'base64');
    fs.writeFileSync(path.join(outDir, `${id}.wav`), wavBuf);
    const ms = Math.round(((wavBuf.length - 44) / 2 / 22050) * 1000);
    rows += `<tr><td><button onclick="var a=document.getElementById('${id}');a.currentTime=0;a.play()">▶ ${id}</button><audio id="${id}" src="data:audio/wav;base64,${data[id]}"></audio></td><td><div class="n">${name}</div><div class="s">${ms} ms · ${when}</div></td><td><ul>${uses.map(tag).join('')}</ul></td></tr>\n`;
    count++;
  }
  sections += `<h2>${title}</h2><table>${rows}</table>`;
}
fs.writeFileSync(path.join(outDir, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SwiftLoan sounds</title>
<style>
:root{--ink:#0A3F41;--teal:#079FA0;--bg:#F6FBFA;--line:#d9e8e6;--soft:#4b6a6a}
body{font:15px system-ui;margin:24px;max-width:900px;color:var(--ink);background:var(--bg)}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:26px 0 6px;color:var(--teal);text-transform:uppercase;letter-spacing:.06em}
p.lead{color:var(--soft);margin:0 0 6px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden}
td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}tr:last-child td{border-bottom:0}
td:first-child{width:130px;white-space:nowrap}
button{font:600 13px system-ui;padding:8px 12px;border-radius:10px;border:0;background:var(--teal);color:#fff;cursor:pointer}button:active{transform:scale(.96)}
.n{font-weight:600}.s{color:var(--soft);font-size:12.5px;margin-top:2px}
ul{margin:0;padding-left:16px;font-size:13.5px}li{margin:2px 0}li.note{color:var(--soft);list-style:none;margin-left:-16px}
b{font-size:11px;padding:1px 6px;border-radius:6px;margin-right:4px;color:#fff}b.a{background:#2FB183}b.m{background:#7a8f8e}b.y{background:var(--ink)}
.key{margin:8px 0 0;font-size:13px;color:var(--soft)}
</style>
<h1>SwiftLoan sounds</h1>
<p class="lead">${count} sounds in the app right now. Press ▶ to hear each one.</p>
<p class="key"><b class="a">Agent</b> always plays when the voice agent works the screen. <b class="m">You (test mode)</b> plays for your own taps/typing/scrolling only while <code>UI_SOUNDS_MANUAL_TEST_MODE = true</code>. <b class="y">You (always)</b> plays for you even in production. Master switch: <code>UI_SOUNDS_ENABLED</code> (false = no sound at all).</p>
${sections}`);
console.log(`wrote ${count} sounds + index.html to docs/sound-samples/current`);
