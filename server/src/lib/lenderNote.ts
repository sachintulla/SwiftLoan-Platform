/**
 * The lender's own words about a hiccup, kept for the admin only.
 *
 * KFT's status push carries `journey.reason` ("Unknown error." …). Until now it was dropped unless it contained a
 * decision word, so an application stuck at a lender step looked like a normal "In progress" with no clue why.
 * It is stored in `LenderApplication.lenderNote` (+ `lenderNoteAt`), NOT in `failureReason`: the customer app shows
 * `failureReason` in red, and lender wording must not reach customers. The columns are omitted from every query by
 * default (lib/prisma.ts) and read only through the explicit `select`s below.
 */
import type { ApplicationStatus } from '@prisma/client';
import { prisma } from './prisma.js';

/** A reason that just says it went fine is not worth keeping. */
const BENIGN = /^\s*(success(ful(ly)?)?|ok|okay|done|completed?|n\/?a|none|null|-+)\s*\.?\s*$/i;

/** Statuses that mean the lender is past the point where a stored hiccup is still relevant. */
const MOVED_ON = new Set<string>(['under_review', 'approved', 'disbursed', 'closed']);

export const NOTE_MAX = 300;

export type NoteChange = { set: string } | { clear: true } | null;

/** "lender_selection" → "lender selection". */
const stateLabel = (state: string) => state.replace(/[^a-zA-Z_ ]/g, '').replace(/_/g, ' ').trim().toLowerCase();

/**
 * What an incoming lender event means for the stored note:
 *  - the lender moved on (under review / approved / disbursed / closed): clear it, whatever the reason says;
 *  - a non-empty, non-benign reason: keep it, with the step it happened at;
 *  - otherwise leave it alone.
 */
export function lenderNoteChange(i: { state: string; reason: string; mapped: ApplicationStatus | null }): NoteChange {
  if (i.mapped && MOVED_ON.has(i.mapped)) return { clear: true };
  const reason = (i.reason ?? '').replace(/\s+/g, ' ').trim();
  if (!reason || BENIGN.test(reason)) return null;
  const at = stateLabel(i.state ?? '');
  const text = at ? `${reason} (at ${at})` : reason;
  return { set: text.length > NOTE_MAX ? `${text.slice(0, NOTE_MAX - 1)}…` : text };
}

type Match = { applicationId: string; kftApplicationId?: string | null; offerId?: string | null; lenderName?: string | null };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The lender application an event is about: its KFT id, else the exact offer, else the lender's name (latest first). */
async function findTarget(m: Match): Promise<{ id: string; lenderNote: string | null } | null> {
  const sel = { id: true, lenderNote: true } as const;
  if (m.kftApplicationId) {
    const a = await prisma.lenderApplication.findFirst({ where: { applicationId: m.applicationId, kftApplicationId: m.kftApplicationId }, select: sel });
    if (a) return a;
  }
  if (m.offerId) {
    const a = await prisma.lenderApplication.findFirst({ where: { applicationId: m.applicationId, offerId: m.offerId }, orderBy: { appliedAt: 'desc' }, select: sel });
    if (a) return a;
  }
  if (m.lenderName) {
    const want = norm(m.lenderName);
    const all = await prisma.lenderApplication.findMany({ where: { applicationId: m.applicationId }, orderBy: { appliedAt: 'desc' }, select: { ...sel, lenderName: true } });
    const hit = all.find((a) => a.lenderName && (norm(a.lenderName) === want || norm(a.lenderName).includes(want) || want.includes(norm(a.lenderName))));
    if (hit) return { id: hit.id, lenderNote: hit.lenderNote };
  }
  return null;
}

/** Apply a change to the matching lender application. Never throws (a note must not fail a webhook KFT would retry). */
export async function recordLenderNote(m: Match, change: NoteChange): Promise<'set' | 'cleared' | 'unchanged' | 'no_target'> {
  if (!change) return 'unchanged';
  try {
    const target = await findTarget(m);
    if (!target) return 'no_target';
    if ('clear' in change) {
      if (target.lenderNote == null) return 'unchanged';
      await prisma.lenderApplication.update({ where: { id: target.id }, data: { lenderNote: null, lenderNoteAt: null } });
      return 'cleared';
    }
    if (target.lenderNote === change.set) return 'unchanged'; // a repeat push must not move the time
    await prisma.lenderApplication.update({ where: { id: target.id }, data: { lenderNote: change.set, lenderNoteAt: new Date() } });
    return 'set';
  } catch {
    return 'unchanged';
  }
}

/**
 * Admin reads: put the latest note on each applied offer (offers are what the admin lender timelines are built from),
 * so the UI needs no second lookup. Explicit `select` is the only way to read the omitted columns.
 */
export async function attachLenderNotes<T extends { id: string }>(offers: T[]): Promise<Array<T & { lenderNote: string | null; lenderNoteAt: Date | null }>> {
  if (!offers.length) return [];
  const rows = await prisma.lenderApplication.findMany({
    where: { offerId: { in: offers.map((o) => o.id) }, lenderNote: { not: null } },
    orderBy: { lenderNoteAt: 'desc' },
    select: { offerId: true, lenderNote: true, lenderNoteAt: true },
  });
  const byOffer = new Map<string, { lenderNote: string | null; lenderNoteAt: Date | null }>();
  for (const r of rows) if (!byOffer.has(r.offerId)) byOffer.set(r.offerId, { lenderNote: r.lenderNote, lenderNoteAt: r.lenderNoteAt });
  return offers.map((o) => ({ ...o, lenderNote: byOffer.get(o.id)?.lenderNote ?? null, lenderNoteAt: byOffer.get(o.id)?.lenderNoteAt ?? null }));
}
