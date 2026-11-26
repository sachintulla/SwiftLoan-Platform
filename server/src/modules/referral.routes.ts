import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../middleware/error.js';
import { ok } from '../lib/http.js';
import { validate } from '../middleware/validate.js';
import { downloads, stores } from '../config/downloads.js';
import { adCampaignFromReferrer, detectPlatform, formatClipboard, MAX_PLAY_REFERRER, parseClipboard, parsePlayReferrer, storeUrl } from '../lib/attribution.js';
import { claimInstall, recordClick } from '../lib/referral.js';
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
      // Play Install Referrer string. Meta-ad installs send ~1,100 characters: the old 512 limit refused every one of them
      // (142 in a day on 23 Nov 2026, so none was recorded). A long one is cut, never refused.
      install_referrer: z.string().transform((s) => s.slice(0, MAX_PLAY_REFERRER)).nullable().optional(),
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
      adCampaign: adCampaignFromReferrer(b.install_referrer),
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
      referral: null, // friend referrals were removed; the key stays so installed app versions keep parsing the answer
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
