import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { ok, pageParams, paginate } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requireAdmin, requireActiveAdmin } from '../middleware/adminAuth.js';
import { downloads, stores } from '../config/downloads.js';
import { detectPlatform, formatClipboard, parseClipboard, parsePlayReferrer, storeUrl, maskName } from '../lib/attribution.js';
import { claimInstall, recordClick, redeemReferral, referralSummary, shareLinkFor } from '../lib/referral.js';
import { resumeForToken, resumeToWire } from '../lib/journeyResume.js';
import { dlContentSecurityPolicy, newNonce, renderDlPage } from '../lib/dlPage.js';

// ── GET /dl?ref=CODE[&campaign=slug] — the shareable download link ───────────
// Public. Logs the click (hashed IP/UA only), then sends the visitor to the
// right store. On iOS it shows a one-tap page that first copies the click token
// to the clipboard (Safari only allows that on a user gesture) so the app can
// read it on first launch — the fallback for when the IP match is ambiguous.
export const dlRouter = Router();

dlRouter.get('/dl', ah(async (req, res) => {
  const ua = String(req.headers['user-agent'] ?? '');
  const platform = detectPlatform(ua);
  res.set('Cache-Control', 'no-store');

  if (platform === 'web') return res.redirect(302, stores.web);

  const click = await recordClick({
    ref: typeof req.query.ref === 'string' ? req.query.ref : null,
    campaignId: typeof req.query.campaign === 'string' ? req.query.campaign : null,
    platform,
    ip: req.ip ?? '',
    userAgent: ua,
  });

  if (platform === 'android') return res.redirect(302, storeUrl(stores.android, click));

  const target = storeUrl(stores.ios, click);
  const clip = formatClipboard(click.token);
  const debug = req.query.debug === '1'; // ?debug=1 shows whether the copy worked and holds the page for a few seconds before leaving
  const nonce = newNonce();
  res.setHeader('Content-Security-Policy', dlContentSecurityPolicy(nonce)); // replaces the global one for this page only, see lib/dlPage.ts
  res.type('html').send(renderDlPage({ target, clip, debug, nonce }));
}));

// ── POST /api/attribution/claim — the app, once, on first launch ────────────
// Public (the user has no account yet). Always records exactly one AppDownload,
// matched or not, so the admin install count is right.
export const attributionRouter = Router();

attributionRouter.post(
  '/claim',
  validate(
    z.object({
      platform: z.enum(['android', 'ios']),
      install_referrer: z.string().max(512).nullable().optional(), // Play Install Referrer string
      clipboard: z.string().max(256).nullable().optional(), // raw clipboard text (iOS)
      os_version: z.string().max(32).nullable().optional(),
    }),
  ),
  ah(async (req, res) => {
    const b = req.body as { platform: 'android' | 'ios'; install_referrer?: string | null; clipboard?: string | null; os_version?: string | null };
    const play = parsePlayReferrer(b.install_referrer);
    const clip = parseClipboard(b.clipboard);
    const clickToken = play.clickId ?? clip;
    const result = await claimInstall({
      platform: b.platform,
      ip: req.ip ?? '',
      clickToken,
      via: play.clickId ? 'play_referrer' : 'clipboard',
      osVersion: b.os_version ?? null,
    });
    // A website visitor who followed their own link: hand the app what it needs to offer "continue where you
    // left off". Only for a DETERMINISTIC match (Play referrer / clipboard token): a same-IP guess could be a
    // different person, and this carries a phone number and a name.
    const resume = result.method === 'play_referrer' || result.method === 'clipboard' ? await resumeForToken(result.clickRef) : null;
    // A same-IP match (exactly one candidate click) is a strong guess, not proof: it could be someone else on the same
    // network. So it carries NO phone and NO name: only that the matched link belongs to a fresh website journey and how
    // far it got, which lets the app say "you stopped at step 2" and ask for the number. The real details, and whether the
    // journey is really theirs, come after OTP login (GET /journey/resume, keyed on the signed-in account).
    const networkJourney = result.method === 'ip_window' ? await resumeForToken(result.clickRef) : null;
    const resumeHint = !!networkJourney;
    return ok(res, {
      matched: result.matched,
      method: result.method,
      download_id: result.downloadId,
      source: result.source,
      referral: result.referral && { code: result.referral.code, referrer_name: result.referral.referrerName },
      resume: resumeToWire(resume),
      resume_hint: resumeHint,
      hint_last_step: networkJourney ? networkJourney.lastStep : null,
    }, result.matched ? 'Install attributed' : 'Install recorded');
  }),
);

// ── POST /api/attribution/resume — the app was opened from the visitor's own link ───
// swiftloan://onboard?token=<the link's reference ID>. Public (nobody is signed in yet); the reference ID is
// the capability, the same one the /dl link and the Play referrer carry. Always 200 with the same shape, so
// an unknown or stale ID cannot be told apart from "nothing to resume". Rate-limited per IP in app.ts.
attributionRouter.post(
  '/resume',
  validate(z.object({ token: z.string().min(6).max(12) })),
  ah(async (req, res) => {
    const resume = await resumeForToken(req.body.token);
    return ok(res, { resume: resumeToWire(resume) }, resume ? 'Journey found' : 'Nothing to resume');
  }),
);

// ── /api/referrals — the signed-in user's own referral code + friends ───────
export const referralRouter = Router();
referralRouter.use(requireAuth);

referralRouter.get('/me', ah(async (req, res) => {
  const s = await referralSummary(req.user!.sub);
  return ok(res, { ...s, shareUrl: shareLinkFor(s.code, downloads.publicBase) }, 'Referral');
}));

referralRouter.post(
  '/redeem',
  validate(z.object({ code: z.string().max(32), download_id: z.string().max(64).nullable().optional(), match_method: z.string().max(32).nullable().optional() })),
  ah(async (req, res) => {
    const r = await redeemReferral(req.user!.sub, req.body.code, { downloadId: req.body.download_id, matchMethod: req.body.match_method });
    if (!r.ok) {
      // 200 with ok:false for the expected "no" cases — the app treats a refused
      // code as a quiet no-op, not an error to surface.
      return ok(res, { redeemed: false, reason: r.reason }, 'Referral not applied');
    }
    return ok(res, { redeemed: true, referrer_name: r.referrerName }, 'Referral applied');
  }),
);

// ── /api/admin/referrals ────────────────────────────────────────────────────
export const adminReferralsRouter = Router();
adminReferralsRouter.use(requireAdmin);
adminReferralsRouter.use(requireActiveAdmin);

adminReferralsRouter.get('/', ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query);
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
  const where = status ? { status } : {};

  const [rows, total, all, byStatus, topRaw, installs, matched] = await Promise.all([
    prisma.friendReferral.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.friendReferral.count({ where }),
    prisma.friendReferral.count(),
    prisma.friendReferral.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.friendReferral.groupBy({ by: ['referrerId'], _count: { _all: true }, orderBy: { _count: { referrerId: 'desc' } }, take: 5 }),
    prisma.appDownload.count(),
    prisma.appDownload.count({ where: { clickId: { not: null } } }),
  ]);

  const ids = [...new Set([...rows.flatMap((r) => [r.referrerId, r.refereeId]), ...topRaw.map((t) => t.referrerId)])];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, firstName: true, phone: true } });
  const u = new Map(users.map((x) => [x.id, x]));
  const label = (id: string) => ({ id, name: maskName(u.get(id)?.fullName ?? u.get(id)?.firstName, u.get(id)?.phone), phone: u.get(id)?.phone ?? null });
  const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));

  return ok(res, {
    stats: {
      total: all,
      signedUp: counts.signed_up ?? 0,
      applied: counts.applied ?? 0,
      disbursed: counts.disbursed ?? 0,
      installs,
      attributedInstalls: matched,
      attributionRate: installs ? Math.round((matched / installs) * 100) : 0,
    },
    topReferrers: topRaw.map((t) => ({ ...label(t.referrerId), referrals: t._count._all })),
    items: rows.map((r) => ({
      id: r.id, code: r.code, status: r.status, matchMethod: r.matchMethod, rewardStatus: r.rewardStatus,
      createdAt: r.createdAt, appliedAt: r.appliedAt, disbursedAt: r.disbursedAt,
      referrer: label(r.referrerId), referee: label(r.refereeId),
    })),
  }, 'Referrals', paginate(page, pageSize, total));
}));

