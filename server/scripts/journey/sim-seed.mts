// Seeds the three simulator scenarios into the THROWAWAY database (see docs/JOURNEY_RESUME_TEST_REPORT.md, section 7).
//   9400000011  PAN done on the website, link click TSTSIM00001  (clipboard: swiftloan-ref:TSTSIM00001)
//   9400000012  only OTP done,            link click TSTSIM00002
//   9400000013  PAN done, installs WITHOUT the link (found by phone after login)
import assert from 'node:assert/strict';
const ROOT = decodeURIComponent(new URL('../../src', import.meta.url).pathname);
assert.ok(/swiftloan_journey_test/.test(process.env.DATABASE_URL ?? ''), 'throwaway DB only');
const { prisma } = await import(`${ROOT}/lib/prisma.js`);
const rem = await import(`${ROOT}/lib/installReminder.js`);
const { userPanData } = await import(`${ROOT}/lib/storedPan.js`);
const { encryptJson, panHash } = await import(`${ROOT}/lib/pii.js`);

await prisma.journeyReminder.deleteMany({ where: { phone: { startsWith: '94000000' } } });
await prisma.appClick.deleteMany({ where: { token: { startsWith: 'TSTSIM' } } });
await prisma.user.deleteMany({ where: { phone: { in: ['9400000011', '9400000012', '9400000013', '9400000014'] } } });
await prisma.customer.deleteMany({ where: { phone: { in: ['9400000011', '9400000012', '9400000013', '9400000014'] } } });

async function visitor(phone: string, pan: string | null, first: string | null, click: string | null) {
  const u = await prisma.user.create({ data: { phone, phoneVerified: true } });
  const r = (await rem.armInstallReminder({ id: u.id, phone }))!;
  if (pan) {
    await prisma.panRecord.deleteMany({ where: { panHash: panHash(pan) } });
    await prisma.panRecord.create({ data: { panHash: panHash(pan), status: 'verified', verified: true, category: 'Individual', aadhaarLinked: true, verifiedAt: new Date(), ownerUserId: u.id,
      dataEnc: encryptJson({ prefill: { fullName: `${first} SHARMA`, firstName: first, lastName: 'SHARMA', dob: '1992-04-12', gender: 'female', pincode: '500034', city: 'Hyderabad', state: 'Telangana', addressLine1: '12-3-45 Banjara Hills', district: 'Hyderabad' } }) } });
    await prisma.user.update({ where: { id: u.id }, data: userPanData(pan) });
    await rem.markPanVerified(u.id, first);
  }
  if (click) await prisma.appClick.create({ data: { token: click, ref: r.token, kind: 'campaign', platform: 'ios', ipHash: 'sim', uaHash: 'sim', expiresAt: new Date(Date.now() + 86_400_000) } });
  console.log(JSON.stringify({ phone, token: r.token, lastStep: pan ? 'pan_done' : 'otp_only', click }));
}
await visitor('9400000011', 'ABCPE1234F', 'PRIYA', 'TSTSIM00001'); // SIM-1: PAN done, link click
await visitor('9400000012', null, null, 'TSTSIM00002');            // SIM-2: only OTP done, link click
await visitor('9400000013', 'ABCPE5678G', 'ASHA', null);           // SIM-3: PAN done, installs WITHOUT the link
await prisma.$disconnect();
