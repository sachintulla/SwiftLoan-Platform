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

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
  res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/><title>Get SwiftLoan</title>
<style>body{margin:0;font-family:-apple-system,sans-serif;background:linear-gradient(160deg,#0A3F41,#079FA0);min-height:100vh;display:grid;place-items:center;padding:22px}
.c{background:#fff;border-radius:20px;max-width:380px;width:100%;padding:28px 24px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.35)}
h1{font-size:21px;margin:0 0 8px;color:#0A3F41}p{color:#5b6b6b;font-size:14px;line-height:1.5;margin:0 0 20px}
a{display:block;background:#079FA0;color:#fff;text-decoration:none;font-weight:700;padding:14px;border-radius:12px}small{display:block;color:#8a9a9a;margin-top:14px;font-size:11px}</style></head>
<body><div class="c"><h1>Get the SwiftLoan app</h1><p>Install it, then open it — we'll pick up your invite automatically.</p>
<a id="go" href="${esc(target)}">Continue to install</a><small>SwiftLoan • Fast · Fair · Secure</small></div>
<script>
(function(){var go=document.getElementById('go'),clip=${JSON.stringify(clip)},url=${JSON.stringify(target)};
go.addEventListener('click',function(e){e.preventDefault();
function next(){location.href=url}
try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(clip).then(next,next);return}}catch(_){}
try{var t=document.createElement('textarea');t.value=clip;document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t)}catch(_){}
next()})})();
</script></body></html>`);
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
    return ok(res, {
      matched: result.matched,
      method: result.method,
      download_id: result.downloadId,
      source: result.source,
      referral: result.referral && { code: result.referral.code, referrer_name: result.referral.referrerName },
    }, result.matched ? 'Install attributed' : 'Install recorded');
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

