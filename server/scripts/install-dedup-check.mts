/**
 * Install counting, end to end against a THROWAWAY database (never a real one): one row per phone, retries and
 * reinstalls not counted again, store vs test installs, and linking an install to the person who signs in.
 *   DATABASE_URL=<throwaway> npx tsx scripts/install-dedup-check.mts
 */
import { prisma } from '../src/lib/prisma.js';
import { claimInstall, linkInstallToUser } from '../src/lib/referral.js';
import { deviceKeyFor, classifyInstallSource } from '../src/lib/installDedup.js';

if (!/test|throwaway|tmp/i.test(process.env.DATABASE_URL ?? '')) throw new Error('refusing to run: DATABASE_URL does not look like a throwaway database');

let failed = 0;
const check = (name: string, ok: boolean, info?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + JSON.stringify(info)}`); if (!ok) failed++; };
const count = () => prisma.appDownload.count();
const base = { platform: 'android' as const, ip: '10.0.0.1' };
const phoneA = deviceKeyFor('android', 'aaaa1111bbbb2222');
const phoneB = deviceKeyFor('android', 'cccc3333dddd4444');

await prisma.appDownload.deleteMany({});

const first = await claimInstall({ ...base, installId: 'install-a-0000000001', deviceKey: phoneA, installSource: classifyInstallSource('android', 'com.android.vending'), appVersion: '1.1.13 (37)' });
check('first open on phone A = new install', first.kind === 'new' && (await count()) === 1, first);

const retry = await claimInstall({ ...base, installId: 'install-a-0000000001', deviceKey: phoneA });
check('same report again (lost reply) = retry, still 1 row', retry.kind === 'retry' && retry.downloadId === first.downloadId && (await count()) === 1, retry);

const re = await claimInstall({ ...base, installId: 'install-a-0000000002', deviceKey: phoneA, installSource: 'play_store' });
const rowA = await prisma.appDownload.findUnique({ where: { id: first.downloadId } });
check('uninstall + reinstall on phone A = reinstall, still 1 row', re.kind === 'reinstall' && re.downloadId === first.downloadId && (await count()) === 1, re);
check('reinstall counted on the row', rowA?.reinstallCount === 1 && rowA?.lastInstallId === 'install-a-0000000002' && !!rowA?.lastReinstalledAt, rowA);

const reRetry = await claimInstall({ ...base, installId: 'install-a-0000000002', deviceKey: phoneA });
const rowA2 = await prisma.appDownload.findUnique({ where: { id: first.downloadId } });
check('retry of the reinstall report is not counted twice', reRetry.kind === 'retry' && rowA2?.reinstallCount === 1, rowA2);

const b = await claimInstall({ ...base, installId: 'install-b-0000000001', deviceKey: phoneB, installSource: classifyInstallSource('android', null) });
check('a different phone = new install (2 rows)', b.kind === 'new' && (await count()) === 2, b);
const rowB = await prisma.appDownload.findUnique({ where: { id: b.downloadId } });
check('a sideloaded APK is marked as a test install', rowB?.installSource === 'sideload', rowB);

const ios = await claimInstall({ platform: 'ios', ip: '10.0.0.2', installId: 'install-i-0000000001', deviceKey: deviceKeyFor('ios', 'aaaa1111bbbb2222'), installSource: 'app_store' });
check('same raw id on iOS is a different phone (platform-scoped)', ios.kind === 'new' && (await count()) === 3, ios);

const old1 = await claimInstall({ ...base });
const old2 = await claimInstall({ ...base });
check('an old app (no ids) is counted as before', old1.kind === 'new' && old2.kind === 'new' && (await count()) === 5);

const [r1, r2] = await Promise.all([
  claimInstall({ ...base, installId: 'install-c-0000000001', deviceKey: deviceKeyFor('android', 'eeee5555ffff6666') }),
  claimInstall({ ...base, installId: 'install-c-0000000001', deviceKey: deviceKeyFor('android', 'eeee5555ffff6666') }),
]);
check('two reports from one phone at the same moment = 1 row', (await count()) === 6 && r1.downloadId === r2.downloadId, [r1.kind, r2.kind]);

const user = await prisma.user.create({ data: { phone: '9000000001' } });
const other = await prisma.user.create({ data: { phone: '9000000002' } });
const linked = await linkInstallToUser('install-a-0000000002', user.id);
const rowLinked = await prisma.appDownload.findUnique({ where: { id: first.downloadId } });
check('sign-in links this install (by its latest install id)', !!linked && rowLinked?.matchedUserId === user.id && !!rowLinked?.matchedAt, rowLinked);
const again = await linkInstallToUser('install-a-0000000001', other.id);
const rowStill = await prisma.appDownload.findUnique({ where: { id: first.downloadId } });
check('a second person on the same phone does not take it over', again === null && rowStill?.matchedUserId === user.id);
check('an unknown install id links nothing', (await linkInstallToUser('install-z-9999999999', user.id)) === null);

await prisma.$disconnect();
console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
