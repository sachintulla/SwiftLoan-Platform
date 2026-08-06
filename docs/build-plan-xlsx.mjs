/**
 * Rebuild docs/SwiftLoan-Production-Plan.xlsx from docs/plan-csv/*.csv.
 *
 * The CSVs are the source of truth so status edits are reviewable in a diff;
 * the workbook is a generated artefact. Summary is recomputed from the sheets
 * rather than hand-maintained — the counts drifted last time it was edited by
 * hand.
 *
 * Run:  node docs/build-plan-xlsx.mjs
 * (uses the `xlsx` package already present in server/node_modules)
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../server/'));
const XLSX = require('xlsx');

const CSV_DIR = join(here, 'plan-csv');
const OUT = join(here, 'SwiftLoan-Production-Plan.xlsx');

// Sheet order in the workbook — Summary is generated, so it is not read in.
const SHEETS = ['Mobile-App', 'Website', 'Admin-Dashboard', 'Backend-Infra'];
const TITLES = {
  'Mobile-App': 'Mobile App',
  Website: 'Website',
  'Admin-Dashboard': 'Admin Dashboard',
  'Backend-Infra': 'Backend & Infra',
};

/** Minimal RFC 4180 parser — fields may contain commas and escaped quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const src = text.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  row.push(field); rows.push(row);
  return rows;
}

const sheets = Object.fromEntries(
  SHEETS.map((n) => [n, parseCsv(readFileSync(join(CSV_DIR, `${n}.csv`), 'utf8'))]),
);

// ── Recompute Summary from the sheet data ───────────────────────────────
const COL = { status: 3, pct: 4, priority: 5 };
const summary = [
  ['Sheet', 'Total', 'Done', 'In Progress', 'Blocked', 'Not Started', '% Complete', 'P0 Open'],
];
let tot = { total: 0, done: 0, prog: 0, blocked: 0, ns: 0, p0: 0, pct: 0 };

// "% Complete" is the mean of the per-row % column, not done/total — this
// matches the original workbook and gives partial credit to In Progress rows.
const meanPct = (body) => Math.round(body.reduce((a, r) => a + (Number(r[COL.pct]) || 0), 0) / body.length);

for (const name of SHEETS) {
  const body = sheets[name].slice(1).filter((r) => r[0]?.trim());
  const count = (s) => body.filter((r) => r[COL.status]?.trim() === s).length;
  const done = count('Done'), prog = count('In Progress'), blocked = count('Blocked'), ns = count('Not Started');
  // "P0 Open" = a production-blocking item that is not finished. Blocked and
  // In Progress both still count as open — they are not shippable.
  const p0 = body.filter((r) => r[COL.priority]?.trim() === 'P0' && r[COL.status]?.trim() !== 'Done').length;
  summary.push([TITLES[name], body.length, done, prog, blocked, ns, `${meanPct(body)}%`, p0]);
  tot = {
    total: tot.total + body.length, done: tot.done + done, prog: tot.prog + prog,
    blocked: tot.blocked + blocked, ns: tot.ns + ns, p0: tot.p0 + p0,
    // Summed so the TOTAL row is a true mean across all 164 items, not a mean
    // of the four sheet means (which would over-weight the smaller sheets).
    pct: tot.pct + body.reduce((a, r) => a + (Number(r[COL.pct]) || 0), 0),
  };
}

summary.push([]);
summary.push(['TOTAL', tot.total, tot.done, tot.prog, tot.blocked, tot.ns, `${Math.round(tot.pct / tot.total)}%`, tot.p0]);
summary.push([]);
summary.push(['Status vocabulary', 'Done = finished & verified | In Progress = partially done | Blocked = waiting on a third party | Not Started']);
summary.push(['Priority', 'P0 = required for production | P1 = required soon after | P2 = nice to have']);
summary.push(['LEGAL GATES', 'DND scrubbing and call-recording consent can stop a launch — see Backend & Infra > Compliance']);
summary.push([]);
summary.push(['Generated', 'Regenerate with: node docs/build-plan-xlsx.mjs (edit docs/plan-csv/*.csv, not the workbook)']);

// ── Emit the workbook ───────────────────────────────────────────────────
const wb = XLSX.utils.book_new();
const widths = [{ wch: 10 }, { wch: 22 }, { wch: 62 }, { wch: 13 }, { wch: 6 }, { wch: 9 }, { wch: 10 }, { wch: 20 }, { wch: 68 }];

const sSum = XLSX.utils.aoa_to_sheet(summary);
sSum['!cols'] = [{ wch: 20 }, { wch: 9 }, { wch: 9 }, { wch: 12 }, { wch: 10 }, { wch: 13 }, { wch: 12 }, { wch: 10 }];
sSum['!freeze'] = { xSplit: 0, ySplit: 1 };
XLSX.utils.book_append_sheet(wb, sSum, 'Summary');

for (const name of SHEETS) {
  const ws = XLSX.utils.aoa_to_sheet(sheets[name]);
  ws['!cols'] = widths;
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sheets[name].length - 1, c: 8 } }) };
  XLSX.utils.book_append_sheet(wb, ws, TITLES[name]);
}

XLSX.writeFile(wb, OUT);

console.log(`Wrote ${OUT}`);
for (const r of summary.slice(0, SHEETS.length + 3)) if (r.length) console.log('  ' + r.join('\t'));
