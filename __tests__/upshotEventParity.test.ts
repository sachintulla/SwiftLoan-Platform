/// <reference types="node" />
/**
 * Upshot event-name contract — one canonical spelling on every surface.
 *
 * Upshot keeps a SEPARATE event for every distinct spelling, and the SDKs rewrite names
 * (the web SDK strips spaces and keeps case), so "PAN Verified", "PANVerified", "PAN_Verified"
 * and "pan_verified" ended up as four events in the console. This test is the guard:
 *
 *   - CONTRACT below is the single list of events (also written up in docs/UPSHOT_EVENTS.md).
 *   - every `upshotEvent('…')` literal in the app (`src/`) and the website (`website-next/src/`)
 *     is scanned from source and must be exactly the contract — no extra, none missing;
 *   - both catalogues (the dev "seed" lists) must list the same names, with the same
 *     attribute keys and value TYPES for any event they share (Upshot fixes an attribute's
 *     type on first sight, so a string-vs-number slip is permanent);
 *   - the screen labels both surfaces use for the same funnel step must match.
 *
 * Adding or renaming an event? Change the code AND this CONTRACT AND the doc, deliberately.
 */
import fs from 'fs';
import path from 'path';
import { MOBILE_UPSHOT_EVENTS, UPSHOT_SCREEN_LABELS as APP_SCREEN_LABELS } from '../src/analytics/upshot';
import { UPSHOT_EVENTS as WEB_EVENTS } from '../website-next/src/lib/upshotEvents';

interface Contract {
  /** Appears in the app's catalogue (and is emitted by the app if `emitted`). */
  app: boolean;
  /** Appears in the website's catalogue (and is emitted by the website if `emitted`). */
  web: boolean;
  /** Actually sent by a client today. false = catalogue-only (registered so campaigns can target it). */
  emitted: boolean;
}

const CONTRACT: Record<string, Contract> = {
  // website only
  website_visit: { app: false, web: true, emitted: true },
  website_form_started: { app: false, web: true, emitted: true },
  website_lead_submitted: { app: false, web: true, emitted: true },
  emi_calculated: { app: false, web: true, emitted: true },
  // app only
  app_opened: { app: true, web: false, emitted: true },
  loan_disbursed: { app: true, web: false, emitted: true },
  // both surfaces emit
  language_selected: { app: true, web: true, emitted: true },
  otp_requested: { app: true, web: true, emitted: true },
  otp_verified: { app: true, web: true, emitted: true },
  pan_verified: { app: true, web: true, emitted: true },
  eligibility_completed: { app: true, web: true, emitted: true },
  offers_got: { app: true, web: true, emitted: true },
  offer_viewed: { app: true, web: true, emitted: true },
  offer_selected: { app: true, web: true, emitted: true },
  application_submitted: { app: true, web: true, emitted: true },
  // catalogue-only: no client sends these today (lender / server side, or not built yet)
  app_installed: { app: true, web: false, emitted: false },
  kyc_started: { app: true, web: true, emitted: false },
  kyc_completed: { app: true, web: true, emitted: false },
  loan_approved: { app: true, web: true, emitted: false },
  loan_rejected: { app: true, web: true, emitted: false },
  call_completed: { app: true, web: true, emitted: false },
  // server-sent drop-off nudges (stallRules.ts, default push rules) — registered from both catalogues
  swiftloan_otp_not_verified: { app: true, web: true, emitted: false },
  swiftloan_install_not_registered: { app: true, web: true, emitted: false },
  swiftloan_eligibility_incomplete: { app: true, web: true, emitted: false },
  swiftloan_offer_not_selected: { app: true, web: true, emitted: false },
  swiftloan_kyc_incomplete: { app: true, web: true, emitted: false },
  swiftloan_lead_no_install: { app: true, web: true, emitted: false },
};

const ROOT = path.resolve(__dirname, '..');

/**
 * The website's route -> screen-label map, read from source: importing website-next/src/lib/upshot.ts
 * would drag in its `@/` alias, which this (app) Jest config deliberately does not know about.
 */
function webScreenLabels(): string[] {
  const text = fs.readFileSync(path.join(ROOT, 'website-next/src/lib/upshot.ts'), 'utf8');
  const start = text.indexOf('export const UPSHOT_SCREEN_LABELS');
  const body = text.slice(start, text.indexOf('};', start));
  return [...body.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]!);
}

/** Every source file under `dir` (ts/tsx), skipping tests, dev pages and build output. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', 'dev', '__tests__', 'build'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

/** Event names passed as a string LITERAL to upshotEvent(...) — what actually goes on the wire. */
function emittedNames(dir: string): string[] {
  const names = new Set<string>();
  const re = /\bupshotEvent\(\s*(['"`])([^'"`]+)\1/g;
  for (const file of sourceFiles(dir)) {
    const text = fs.readFileSync(file, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) names.add(m[2]!);
  }
  return [...names].sort();
}

const want = (pick: (c: Contract) => boolean) =>
  Object.entries(CONTRACT)
    .filter(([, c]) => pick(c))
    .map(([n]) => n)
    .sort();

describe('Upshot event names: one canonical spelling everywhere', () => {
  it('every name in the contract is lowercase snake_case (letters, digits, _ only)', () => {
    for (const name of Object.keys(CONTRACT)) expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('the app emits exactly the contract events, nothing else', () => {
    expect(emittedNames(path.join(ROOT, 'src'))).toEqual(want((c) => c.app && c.emitted));
  });

  it('the website emits exactly the contract events, nothing else', () => {
    expect(emittedNames(path.join(ROOT, 'website-next/src'))).toEqual(want((c) => c.web && c.emitted));
  });

  it('no old spelling survives anywhere an event name can be written', () => {
    const files = [...sourceFiles(path.join(ROOT, 'src')), ...sourceFiles(path.join(ROOT, 'website-next/src'))];
    const banned = /['"`](PAN[ _]Verified|PANVerified|Offers[ _]Got|OffersGot)['"`]/;
    // Comments may explain the old spellings; only live code counts.
    const code = (f: string) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const f of files) expect([f, banned.test(code(f))]).toEqual([f, false]);
  });

  it('the app catalogue lists exactly the contract events for the app', () => {
    expect(MOBILE_UPSHOT_EVENTS.map((e) => e.name).sort()).toEqual(want((c) => c.app));
  });

  it('the website catalogue lists exactly the contract events for the website', () => {
    expect(WEB_EVENTS.map((e) => e.name).sort()).toEqual(want((c) => c.web));
  });

  it('an event both surfaces know has the same attribute keys and value types on each', () => {
    const typeOf = (v: unknown) => typeof v;
    const shape = (a: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(a)
          // `platform` is the surface label itself (iOS/Android/Web) and `seeded` a dev marker: values differ by design
          .filter(([k]) => k !== 'platform' && k !== 'seeded')
          .map(([k, v]) => [k, typeOf(v)])
          .sort(([a], [b]) => String(a).localeCompare(String(b))),
      );
    const mismatches: string[] = [];
    for (const m of MOBILE_UPSHOT_EVENTS) {
      const w = WEB_EVENTS.find((e) => e.name === m.name);
      if (!w) continue;
      const a = JSON.stringify(shape(m.attributes));
      const b = JSON.stringify(shape(w.attributes));
      if (a !== b) mismatches.push(`${m.name}: app ${a}  vs  web ${b}`);
    }
    expect(mismatches).toEqual([]);
  });

  it('the same funnel step has the same screen label on the app and the website', () => {
    const app = new Set(Object.values(APP_SCREEN_LABELS));
    const web = new Set(webScreenLabels());
    for (const label of [
      'Get Started',
      'PAN Verification Step 1',
      'Basic Details Step 2',
      'More Details Step 3',
      'Finding Loader',
      'My Offers',
      'Compare Offers',
      'My Loans',
    ]) {
      expect([label, app.has(label), web.has(label)]).toEqual([label, true, true]);
    }
  });
});
