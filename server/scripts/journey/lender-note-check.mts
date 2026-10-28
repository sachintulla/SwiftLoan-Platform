// End-to-end check of the admin-only lender note (throwaway DB + a local server on PORT, nothing real is called).
//   node --import tsx scripts/journey/lender-note-check.mts      (DATABASE_URL must be swiftloan_journey_test, server up on :4020)
import assert from 'node:assert/strict';
const ROOT = decodeURIComponent(new URL('../../src', import.meta.url).pathname);
assert.ok(/swiftloan_journey_test/.test(process.env.DATABASE_URL ?? ''), 'throwaway DB only');
const { prisma } = await import(`${ROOT}/lib/prisma.js`);
const { attachLenderNotes } = await import(`${ROOT}/lib/lenderNote.js`);
const BASE = process.env.BASE ?? 'http://127.0.0.1:4020';
let n = 0; const ok = (m: string) => console.log(`PASS ${++n} ${m}`);

// Seed: the PREFR application from the real report (lead 20164056), already "applied / handoff".
await prisma.loanApplication.deleteMany({ where: { leadId: '20164056' } }); await prisma.user.deleteMany({ where: { phone: '9400000099' } });
const user = await prisma.user.create({ data: { phone: '9400000099', phoneVerified: true } });
const app = await prisma.loanApplication.create({ data: { userId: user.id, amount: 20000000, tenureMonths: 24, status: 'handoff', leadId: '20164056', ref: 'SL-NOTE-TEST' } as any });
const partner = await prisma.lenderPartner.upsert({ where: { name: 'Lender Note Test Partner' }, update: {}, create: { name: 'Lender Note Test Partner', baseApr: 18 } as any });
const offer = await prisma.offer.create({ data: { applicationId: app.id, partnerId: partner.id, lenderName: 'PREFR', amount: 20000000, apr: 18, emi: 1000000, tenureMonths: 24, processingFee: 0, applied: true, appliedAt: new Date(), lenderStatus: 'handoff' } as any });
const la = await prisma.lenderApplication.create({ data: { applicationId: app.id, offerId: offer.id, lenderName: 'PREFR', amount: 20000000, status: 'handoff' } as any });

const post = async (body: unknown) => (await fetch(`${BASE}/api/webhooks/aurix`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json() as any;
// The event exactly as reported.
const EVENT = { journey: { state: 'lender_selection', status: 'LSPE202610270418060000', reason: 'Unknown error.', lead_id: '20164056', partner_customer_id: user.id, action: 'lenderselection' }, data: { lead_id: '20164056', Message: '', lender_name: 'PREFR' } };
const read = () => prisma.lenderApplication.findFirstOrThrow({ where: { id: la.id }, select: { status: true, failureReason: true, lenderNote: true, lenderNoteAt: true } });

let r = await post(EVENT);
assert.equal(r.data.matched, true); ok('the pasted event matches the application by lead id');
let row = await read();
assert.equal(row.lenderNote, 'Unknown error. (at lender selection)'); ok('the lender\'s reason is stored with the step it happened at');
assert.equal(row.status, 'handoff'); assert.equal(row.failureReason, null); ok('status is still handoff and failureReason (the customer-facing field) stays empty');
const t1 = row.lenderNoteAt!.getTime();

await new Promise((res) => setTimeout(res, 50));
await post(EVENT);
row = await read(); assert.equal(row.lenderNoteAt!.getTime(), t1); ok('the same push again does not move the note time');

// Customer-facing reads never carry it (default omit), including through nested includes.
const plain = await prisma.lenderApplication.findFirstOrThrow({ where: { id: la.id } });
assert.ok(!('lenderNote' in plain) && !('lenderNoteAt' in plain)); ok('a plain lender-application query has no lenderNote');
const nested: any = await prisma.loanApplication.findFirstOrThrow({ where: { id: app.id }, include: { lenderApplications: true, offers: true } });
assert.ok(!('lenderNote' in nested.lenderApplications[0])); ok('the customer app\'s include { lenderApplications: true } has no lenderNote');
assert.ok(!JSON.stringify(nested).includes('Unknown error')); ok('nothing in a customer-facing payload mentions the lender\'s text');

// Admin read: the note rides on the applied offer.
const [withNote] = await attachLenderNotes([offer]);
assert.equal(withNote!.lenderNote, 'Unknown error. (at lender selection)'); ok('the admin read attaches the note to the applied offer');

// A later, different reason replaces it; an empty reason leaves it; the lender moving on clears it.
await post({ ...EVENT, journey: { ...EVENT.journey, reason: 'Lender API timeout' } });
assert.equal((await read()).lenderNote, 'Lender API timeout (at lender selection)'); ok('a new reason replaces the old one');
await post({ ...EVENT, journey: { ...EVENT.journey, reason: '' } });
assert.equal((await read()).lenderNote, 'Lender API timeout (at lender selection)'); ok('an event with no reason leaves the note alone');
await post({ journey: { state: 'application_submitted', status: 'success', reason: '', lead_id: '20164056', partner_customer_id: user.id }, data: { lead_id: '20164056', lender_name: 'PREFR', application_id: 'KFT-1' } });
row = await read(); assert.equal(row.status, 'under_review'); assert.equal(row.lenderNote, null); assert.equal(row.lenderNoteAt, null); ok('once the lender moves on (under review) the note is cleared');

// An event that matches nothing must not fail the webhook (KFT would retry forever).
r = await post({ journey: { state: 'lender_selection', status: 'x', reason: 'Boom', lead_id: 'NOPE' }, data: { lender_name: 'PREFR' } });
assert.equal(r.data.matched, false); ok('an unknown lead is still answered 200 matched:false');

await prisma.lenderApplication.deleteMany({ where: { applicationId: app.id } }); await prisma.offer.deleteMany({ where: { applicationId: app.id } });
await prisma.loanApplication.delete({ where: { id: app.id } }); await prisma.user.delete({ where: { id: user.id } }); await prisma.lenderPartner.deleteMany({ where: { name: 'Lender Note Test Partner' } });
await prisma.$disconnect();
console.log(`\nLENDER NOTE CHECK: ${n}/${n} passed`);
