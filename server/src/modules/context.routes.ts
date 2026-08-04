import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { ok, created, fail } from '../lib/http.js';
import { contextLinks } from '../config/downloads.js';
import { trackJourney, JOURNEY_EVENTS } from '../lib/journey.js';
import { requireAuth } from '../middleware/auth.js';
import { buildUserContext } from '../lib/userContext.js';

// WS3 context handoff. The website widget / voice agent posts what it learned
// about the visitor here; we mint a short opaque token and return the links the
// visitor uses to download the context app and continue their journey in-app.
export const contextRouter = Router();

// short, URL-safe, human-typable token (no ambiguous chars)
function shortToken(len = 8): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// POST /api/context/create
// body: { name?, phone?, city?, product?, amount?, summary?, source? }
contextRouter.post('/create', ah(async (req, res) => {
  const b = req.body ?? {};
  let token = shortToken();
  // extremely unlikely collision, but retry once
  if (await prisma.contextSession.findUnique({ where: { token } })) token = shortToken(10);

  const session = await prisma.contextSession.create({
    data: {
      token,
      name: b.name ?? null,
      phone: b.phone ?? null,
      city: b.city ?? null,
      product: b.product ?? b.loanType ?? null,
      amount: b.amount != null ? Math.round(Number(b.amount)) : null,
      summary: b.summary ?? null,
      source: b.source ?? 'website',
      transcript: b.transcript ?? undefined,
    },
  });

  // Best-effort: also drop a lead row so it shows in the admin Leads funnel.
  // Campaign/UTM attribution is carried through from the website query string.
  prisma.anonymousLead.create({
    data: {
      name: session.name, phone: session.phone, city: session.city,
      productInterest: session.product, amount: session.amount ?? undefined,
      source: session.source, note: session.summary ?? undefined, status: 'new',
      campaignId: b.campaignId ?? b.utmCampaign ?? null,
      referrer: b.referrer ?? null,
    },
  }).catch(() => {});

  // WS5: this is the first touch of the customer journey. Resolve (or create)
  // the Customer for this phone and open their timeline at `lead_captured`, so
  // the same person is recognisable when they later install the app or get a
  // call. Fire-and-forget — a journey write must never fail lead capture.
  trackJourney(
    {
      phone: session.phone,
      name: session.name,
      email: b.email ?? null,
      city: session.city,
      source: b.campaignId || b.utmCampaign ? 'campaign' : 'website',
      campaignId: b.campaignId ?? b.utmCampaign ?? null,
      utmSource: b.utmSource ?? null,
      utmMedium: b.utmMedium ?? null,
      utmCampaign: b.utmCampaign ?? null,
      referrer: b.referrer ?? null,
    },
    {
      channel: 'website',
      name: JOURNEY_EVENTS.LEAD_CAPTURED,
      metadata: {
        product: session.product,
        amount: session.amount,
        summary: session.summary,
        contextToken: session.token,
      },
    },
  ).catch(() => {});

  return created(res, { token, ...contextLinks(token), context: publicContext(session) }, 'Context saved');
}));

// GET /api/context/:token  — the app resolves context on first open.
contextRouter.get('/:token', ah(async (req, res) => {
  const session = await prisma.contextSession.findUnique({ where: { token: req.params.token.toUpperCase() } });
  if (!session) return fail(res, 404, 'Context not found or expired');
  if (!session.claimedAt) {
    await prisma.contextSession.update({ where: { id: session.id }, data: { claimedAt: new Date() } }).catch(() => {});
  }
  return ok(res, publicContext(session), 'Context');
}));

// Only expose what the app needs — never leak more than was captured.
function publicContext(s: {
  token: string; name: string | null; city: string | null; product: string | null;
  amount: number | null; summary: string | null; source: string;
}) {
  return {
    token: s.token,
    name: s.name,
    city: s.city,
    product: s.product,
    amount: s.amount, // paise
    summary: s.summary,
    source: s.source,
    greeting: buildGreeting(s),
  };
}

// A ready-to-speak continuation line for the in-app agent.
function buildGreeting(s: { name: string | null; product: string | null; amount: number | null }): string {
  const who = s.name ? `Hi ${s.name}! ` : 'Welcome back! ';
  const amt = s.amount ? `₹${(s.amount / 100).toLocaleString('en-IN')}` : '';
  const prod = s.product ? s.product.toLowerCase() : 'loan';
  if (amt) return `${who}As we discussed, you're interested in a ${amt} ${prod}. Let's continue your application from here.`;
  return `${who}Let's continue your ${prod} application from where we left off.`;
}

/**
 * GET /api/context/me
 *
 * Everything we already know about the signed-in user, keyed on their phone.
 *
 * This is the non-deep-link path. A visitor who fills the website form, takes
 * our callback, then installs the app from the Play Store arrives with nothing
 * but a phone number — so the in-app agent used to greet them as a stranger and
 * re-ask what they had already told us twice. This endpoint is what lets it open
 * from where they left off.
 *
 * Authenticated: the phone comes from the access token, never from the query
 * string. Accepting a phone parameter here would turn this into an open lookup
 * of anyone's loan history by number.
 */
contextRouter.get('/me', requireAuth, ah(async (req, res) => {
  const phone = req.user?.phone;
  if (!phone) return fail(res, 401, 'No phone on the session');

  const ctx = await buildUserContext(phone, req.user?.sub);

  // 200 with hasHistory:false rather than 404 — "we know nothing about you" is a
  // normal answer for a brand-new user, not an error the app should log.
  return ok(res, ctx, ctx.hasHistory ? 'Context found' : 'No prior context');
}));
