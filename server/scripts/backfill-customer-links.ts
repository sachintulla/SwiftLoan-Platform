/**
 * Backfill Customer ↔ User linkage + display name.
 *
 * Two data gaps surfaced in the admin dashboard:
 *   1. Customer.name blank while the linked/same-phone User has a real name
 *      (the list showed "Unknown" for people we actually know).
 *   2. Customer.userId null or pointing at the wrong/older user, so the 360
 *      view resolved no applications/loans/device.
 *
 * This heals both, matching Customer ↔ User by NORMALISED phone (last 10
 * digits) and only when that phone maps to exactly ONE user (never guesses an
 * ambiguous match). It is idempotent and safe to re-run.
 *
 *   npx tsx scripts/backfill-customer-links.ts           # dry run (default)
 *   npx tsx scripts/backfill-customer-links.ts --apply   # write changes
 *
 * The read path (customers routes) already falls back to a phone match at
 * request time, so this script is about healing the stored data — run it once
 * per environment (dev, prod) after deploying the code fix.
 */
import { prisma } from '../src/lib/prisma.js';

const APPLY = process.argv.includes('--apply');
const norm = (s: string | null | undefined) => (s || '').replace(/\D/g, '').slice(-10);
const nameOf = (u: { fullName: string | null; firstName: string | null; lastName: string | null }) =>
  (u.fullName || [u.firstName, u.lastName].filter(Boolean).join(' ')).trim() || null;

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, phone: true, fullName: true, firstName: true, lastName: true } });
  const byPhone = new Map<string, typeof users>();
  for (const u of users) {
    const n = norm(u.phone);
    if (!n) continue;
    (byPhone.get(n) ?? byPhone.set(n, []).get(n)!).push(u);
  }

  const customers = await prisma.customer.findMany({ select: { id: true, name: true, phone: true, userId: true } });
  // Customer.userId is unique — a user can back at most one customer.
  const takenUserIds = new Set(customers.map((c) => c.userId).filter(Boolean) as string[]);

  let nameFix = 0, linkFix = 0, relinkSkipped = 0, ambiguous = 0, errors = 0;
  const nameSamples: string[] = [];
  const linkSamples: string[] = [];

  for (const c of customers) {
    const n = norm(c.phone);
    if (!n) continue;
    const arr = byPhone.get(n);
    if (!arr || !arr.length) continue;
    if (arr.length > 1) { ambiguous++; continue; } // never auto-fix an ambiguous phone
    const u = arr[0];
    const nm = nameOf(u);

    const data: { name?: string; userId?: string } = {};
    if ((!c.name || !c.name.trim()) && nm) data.name = nm;
    if (u.id !== c.userId) {
      if (takenUserIds.has(u.id)) relinkSkipped++;   // real user already backs another customer
      else data.userId = u.id;
    }
    if (!Object.keys(data).length) continue;

    if (data.name && nameSamples.length < 8) nameSamples.push(`${c.phone} → ${data.name}`);
    if (data.userId && linkSamples.length < 8) linkSamples.push(`${c.phone}: ${c.userId ?? 'null'} → ${data.userId}`);

    if (APPLY) {
      try {
        await prisma.customer.update({ where: { id: c.id }, data });
        if (data.name) nameFix++;
        if (data.userId) { linkFix++; takenUserIds.add(data.userId); }
      } catch { errors++; }
    } else {
      if (data.name) nameFix++;
      if (data.userId) linkFix++;
    }
  }

  console.log(`[backfill-customer-links] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(JSON.stringify({ totalCustomers: customers.length, nameFix, linkFix, relinkSkipped, ambiguous, errors }, null, 2));
  if (nameSamples.length) console.log('name samples:', nameSamples);
  if (linkSamples.length) console.log('link samples:', linkSamples);
  if (!APPLY) console.log('\nDry run only. Re-run with --apply to write these changes.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
