/**
 * One-time backfill for the ContextSession + AnonymousLead -> Lead merge
 * (see prisma/migrations/20260818165009_merge_lead_model). Run once, against
 * a database that still has both old tables (they haven't been dropped yet),
 * after the new `Lead` table has been created.
 *
 * The two old tables were always created in the same request from the same
 * fields but never linked by a foreign key, so they're joined here by
 * phone + closest createdAt. Each AnonymousLead is claimed by at most one
 * ContextSession (closest match wins) so two old rows never collapse into
 * one Lead by accident.
 *
 * Not part of the replayable migration.sql on purpose: a fresh environment
 * applying that migration has no old rows to carry forward.
 */
import { randomBytes } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';

interface OldContextSession {
  id: string;
  token: string;
  name: string | null;
  phone: string | null;
  city: string | null;
  product: string | null;
  amount: number | null;
  summary: string | null;
  source: string;
  transcript: unknown;
  claimedAt: Date | null;
  createdAt: Date;
}

interface OldAnonymousLead {
  id: string;
  name: string | null;
  phone: string | null;
  city: string | null;
  productInterest: string | null;
  amount: number | null;
  source: string;
  campaignId: string | null;
  referrer: string | null;
  status: string;
  convertedUserId: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function shortToken(len = 10): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function main() {
  const sessions = await prisma.$queryRaw<OldContextSession[]>`
    SELECT id, token, name, phone, city, product, amount, summary, source, transcript, "claimedAt", "createdAt"
    FROM "ContextSession" ORDER BY "createdAt" ASC
  `;
  const leads = await prisma.$queryRaw<OldAnonymousLead[]>`
    SELECT id, name, phone, city, "productInterest", amount, source, "campaignId", referrer, status, "convertedUserId", note, "createdAt", "updatedAt"
    FROM "AnonymousLead" ORDER BY "createdAt" ASC
  `;

  const claimed = new Set<string>();
  const FIVE_MIN_MS = 5 * 60_000;

  let mergedCount = 0;
  for (const s of sessions) {
    // Best unclaimed AnonymousLead match: same phone, closest createdAt, within 5 minutes.
    let best: OldAnonymousLead | null = null;
    let bestDelta = Infinity;
    if (s.phone) {
      for (const l of leads) {
        if (claimed.has(l.id) || l.phone !== s.phone) continue;
        const delta = Math.abs(l.createdAt.getTime() - s.createdAt.getTime());
        if (delta < bestDelta && delta <= FIVE_MIN_MS) {
          best = l;
          bestDelta = delta;
        }
      }
    }
    if (best) claimed.add(best.id);

    await prisma.lead.create({
      data: {
        id: s.id, // keep the ContextSession id stable — nothing external references AnonymousLead ids by FK
        token: s.token,
        name: s.name ?? best?.name ?? null,
        phone: s.phone ?? best?.phone ?? null,
        city: s.city ?? best?.city ?? null,
        productInterest: best?.productInterest ?? s.product ?? null,
        amount: s.amount ?? best?.amount ?? null,
        note: best?.note ?? s.summary ?? null,
        source: best?.source ?? s.source,
        campaignId: best?.campaignId ?? null,
        referrer: best?.referrer ?? null,
        status: (best?.status as any) ?? 'new',
        convertedUserId: best?.convertedUserId ?? null,
        transcript: (s.transcript as any) ?? undefined,
        claimedAt: s.claimedAt,
        createdAt: s.createdAt,
        updatedAt: best?.updatedAt ?? s.createdAt,
      },
    });
    if (best) mergedCount++;
  }

  // AnonymousLead rows with no matching ContextSession (e.g. seeded data) —
  // still need a Lead row, but there is no real deep-link token behind them,
  // so synthesize one. Nothing depends on it resolving to anything.
  const orphanLeads = leads.filter((l) => !claimed.has(l.id));
  for (const l of orphanLeads) {
    await prisma.lead.create({
      data: {
        id: l.id,
        token: shortToken(),
        name: l.name,
        phone: l.phone,
        city: l.city,
        productInterest: l.productInterest,
        amount: l.amount,
        note: l.note,
        source: l.source,
        campaignId: l.campaignId,
        referrer: l.referrer,
        status: l.status as any,
        convertedUserId: l.convertedUserId,
        claimedAt: null,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      },
    });
  }

  const totalLeadRows = await prisma.lead.count();
  console.log('Backfill complete', {
    contextSessions: sessions.length,
    anonymousLeads: leads.length,
    mergedPairs: mergedCount,
    orphanAnonymousLeadsAdded: orphanLeads.length,
    totalLeadRows,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
