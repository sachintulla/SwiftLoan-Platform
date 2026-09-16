import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { ok, created, fail } from '../lib/http.js';
import { contextLinks } from '../config/downloads.js';
import { resolveCustomer, recordJourneyEvent, JOURNEY_EVENTS } from '../lib/journey.js';
import { requireAuth } from '../middleware/auth.js';
import { buildUserContext } from '../lib/userContext.js';
import { recordConversation } from '../lib/conversations.js';
import { verifyApiKey } from '../lib/apiKeys.js';
import { scoped } from '../lib/log.js';

const log = scoped('context');

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

// A bare 10-digit Indian mobile, matching website.routes.ts's own OTP
// validator and the client-side check in useLeadCapture.ts — the one field
// this endpoint cannot treat as optional. Every identity in the system (app
// or website) is required to resolve to a real phone number; a Lead created
// without one used to be able to slip through here with nothing to anchor it
// to, silently producing an untrackable, unmergeable record.
const LEAD_PHONE_RE = /^[6-9]\d{9}$/;

// POST /api/context/create
// body: { phone, name?, city?, product?, amount?, summary?, source? }
contextRouter.post('/create', ah(async (req, res) => {
  const b = req.body ?? {};
  if (typeof b.phone !== 'string' || !LEAD_PHONE_RE.test(b.phone)) {
    return fail(res, 400, 'A valid 10-digit mobile number is required');
  }
  let token = shortToken();
  // extremely unlikely collision, but retry once
  if (await prisma.lead.findUnique({ where: { token } })) token = shortToken(10);

  const session = await prisma.lead.create({
    data: {
      token,
      name: b.name ?? null,
      phone: b.phone ?? null,
      city: b.city ?? null,
      productInterest: b.product ?? b.loanType ?? null,
      amount: b.amount != null ? Math.round(Number(b.amount)) : null,
      note: b.summary ?? null,
      source: b.source ?? 'website',
      transcript: b.transcript ?? undefined,
      status: 'new',
      campaignId: b.campaignId ?? b.utmCampaign ?? null,
      referrer: b.referrer ?? null,
    },
  });

  // WS5: this is the first touch of the customer journey. Resolve (or create)
  // the Customer for this phone and open their timeline at `lead_captured`, so
  // the same person is recognisable when they later install the app or get a
  // call.
  //
  // resolveCustomer() is awaited (not fire-and-forget): the website's own
  // onSubmit calls POST /api/website/otp/request immediately after this
  // response comes back, and that endpoint 404s ("No lead found for this
  // number") if the Customer row doesn't exist yet. Awaiting it here closes
  // that race — it's a single fast upsert-style call, not worth losing lead
  // capture over, so still wrapped so a failure here can't fail the response.
  // recordJourneyEvent() stays fire-and-forget: nothing downstream depends on
  // the timeline write landing before this request returns.
  const customer = await resolveCustomer({
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
  }).catch(() => null);

  if (customer) {
    recordJourneyEvent(customer.id, {
      channel: 'website',
      name: JOURNEY_EVENTS.LEAD_CAPTURED,
      metadata: {
        product: session.productInterest,
        amount: session.amount,
        summary: session.note,
        contextToken: session.token,
      },
    }).catch(() => {});
  }

  log.info('lead captured', { token, phone: session.phone, product: session.productInterest, amountPaise: session.amount, source: session.source });
  return created(res, { token, ...contextLinks(token), context: publicContext(session) }, 'Context saved');
}));

// GET /api/context/:token  — the app resolves context on first open.
//
// The pattern is constrained on purpose. As a bare `/:token` this wildcard also
// matched `/me` (declared further down the file, and Express matches in
// registration order), so GET /api/context/me 404'd while looking up a context
// token literally named "me". Tokens are 8–10 chars from an unambiguous
// uppercase alphabet, so a length floor of 6 keeps every real token matching
// while letting short literal paths through.
contextRouter.get('/:token([A-Za-z0-9]{6,12})', ah(async (req, res) => {
  const session = await prisma.lead.findUnique({ where: { token: req.params.token.toUpperCase() } });
  if (!session) return fail(res, 404, 'Context not found or expired');
  if (!session.claimedAt) {
    await prisma.lead.update({ where: { id: session.id }, data: { claimedAt: new Date() } }).catch(() => {});
  }
  return ok(res, publicContext(session), 'Context');
}));

// Only expose what the app needs — never leak more than was captured.
function publicContext(s: {
  token: string; name: string | null; city: string | null; productInterest: string | null;
  amount: number | null; note: string | null; source: string;
}) {
  return {
    token: s.token,
    name: s.name,
    city: s.city,
    product: s.productInterest,
    amount: s.amount, // paise
    summary: s.note,
    source: s.source,
    greeting: buildGreeting(s),
  };
}

// A ready-to-speak continuation line for the in-app agent.
function buildGreeting(s: { name: string | null; productInterest: string | null; amount: number | null }): string {
  const who = s.name ? `Hi ${s.name}! ` : 'Welcome back! ';
  const amt = s.amount ? `₹${(s.amount / 100).toLocaleString('en-IN')}` : '';
  const prod = s.productInterest ? s.productInterest.toLowerCase() : 'loan';
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

/**
 * POST /api/context/lookup
 *
 * The Ello-callable twin of GET /api/context/me — same buildUserContext()
 * payload, for a caller with no signed-in user session at all (Ello's
 * tool-calling servers, same as get_customer_history in
 * conversations.routes.ts). /me derives its phone from the caller's own
 * access token; a third-party tool call has none, so this takes `phone` in
 * the body instead and authenticates with the same shared x-api-key secret
 * conversations.routes.ts uses, for the identical reason: no admin/user
 * session to present.
 *
 * SECURITY: exactly like conversations.routes.ts's /context, this returns a
 * person's full profile and loan status for any phone number given to it —
 * the secret is the only thing standing between a caller and that lookup, so
 * this is NEVER allowed to run unauthenticated, including in development.
 *
 * On its OWN router (not contextRouter) so app.ts can give it a rate limit
 * sized for an agent-facing tool call (like /api/conversations's 120/min),
 * not leadLimiter's 5/min — this was accidentally inheriting that 5/min from
 * being mounted under /api/context alongside /create (real per-call
 * telephony cost, correctly strict), and rejected a real Ello call within
 * a minute of normal use. Confirmed live: 429 "Too many submissions" on the
 * 6th call in under 60 seconds.
 */
// Shared by every Ello-callable route in this file (no user session to
// present, so a shared secret stands in for one — same secret/headers
// conversations.routes.ts and webhooks.routes.ts each check independently;
// kept local to this file rather than a project-wide middleware since the
// "not configured" vs "wrong key" messaging is specific to this pair of routes).
async function checkEloApiKey(req: { headers: Record<string, unknown>; path: string }):
  Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const provided =
    String(req.headers['x-api-key'] ?? '') ||
    String(req.headers['x-webhook-secret'] ?? '');
  const legacySecret = process.env.CONVERSATION_API_KEY || process.env.ELLO_WEBHOOK_SECRET || '';
  const authed = !!provided && (!!(await verifyApiKey(provided)) || (!!legacySecret && provided === legacySecret));
  if (authed) return { ok: true };
  if (!legacySecret && (await prisma.apiKey.count({ where: { revokedAt: null } })) === 0) {
    log.error('no admin-issued API key and no CONVERSATION_API_KEY / ELLO_WEBHOOK_SECRET set — refusing', { path: req.path });
    return { ok: false, status: 503, message: 'Context API is not configured' };
  }
  log.warn('rejected — invalid or missing API key', { path: req.path });
  return { ok: false, status: 401, message: 'Invalid or missing API key' };
}

export const contextLookupRouter = Router();
contextLookupRouter.post('/', ah(async (req, res) => {
  const auth = await checkEloApiKey(req);
  if (!auth.ok) return fail(res, auth.status, auth.message);

  // Accept either key: Ello resolves a tool's request-body property by
  // matching its NAME against its own context variables (confirmed live —
  // renaming this tool's property from `phone` to `phone_number` was what
  // actually got a real number resolved, where `phone` with `{phone_number}`
  // in the description never did), so whichever property name a given tool
  // config ends up using should still reach a real user here.
  const raw = req.body?.phone ?? req.body?.phone_number ?? '';
  const phone = String(raw).replace(/\D/g, '').slice(-10);
  if (phone.length !== 10) return fail(res, 400, 'phone is required');

  const user = await prisma.user.findFirst({ where: { phone } });
  const ctx = await buildUserContext(phone, user?.id);
  return ok(res, ctx, ctx.hasHistory ? 'Context found' : 'No prior context');
}));

// Everything a warm-up conversation can gather before a real LoanApplication
// exists — the same set users.routes.ts's `profilePatch` writes to (name/dob
// plus every applicantDraft field), minus panNumber (never collected by
// voice — see the core prompt's Sensitive Data rule) and the notification/
// language settings (unrelated to this). `loanAmount` is the voice-friendly
// name for the `draftLoanAmount` column, same alias the app's own
// toServerProfilePatch (store.ts) uses on its side of this same write path.
const CONTEXT_SAVE_KEY_MAP: Record<string, string> = { loanAmount: 'draftLoanAmount' };
const contextSaveFields = z.object({
  fullName: z.string().optional(),
  email: z.string().email().optional(),
  // Deliberately looser than profilePatch's `z.string().datetime()` — a voice
  // tool is far more likely to produce a bare "1995-05-20" than a full
  // ISO-8601 timestamp; normalized with `new Date()` below instead.
  dob: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  pincode: z.string().regex(/^\d{6}$/).optional(),
  residenceType: z.enum(['own', 'rented', 'family', 'company']).optional(),
  employment: z.enum(['salaried', 'self_employed', 'business_owner', 'gig_worker', 'student', 'retired', 'other']).optional(),
  monthlyIncome: z.number().int().nonnegative().optional(),
  company: z.string().optional(),
  qualification: z.string().optional(),
  maritalStatus: z.string().optional(),
  alternateMobile: z.string().optional(),
  alternateEmail: z.string().email().optional(),
  loanPurpose: z.string().optional(),
  loanAmount: z.number().int().nonnegative().optional(),
  salaryMode: z.string().optional(),
  professionalType: z.string().optional(),
  companyEmail: z.string().email().optional(),
  businessEmail: z.string().email().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  landmark: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  state: z.string().optional(),
  monthlyObligations: z.number().int().nonnegative().optional(),
}).strict();

/**
 * POST /api/context/save
 *
 * The Ello-callable twin of PATCH /api/users/me — same underlying columns,
 * for a caller with no signed-in user session at all. /api/users/me derives
 * the user from the caller's own access token; Ello has none, so this takes
 * `phone`/`phone_number` in the body instead (same tolerant lookup as
 * /api/context/lookup) and authenticates with the same shared API key.
 *
 * Intentionally one endpoint for both "identity" (name/email/dob) and
 * "application draft" (loan purpose, income, company, ...) fields, all
 * optional except the phone — a call in progress may have gathered either
 * subset, or both, by the time it's ready to save.
 */
export const contextSaveRouter = Router();
contextSaveRouter.post('/', ah(async (req, res) => {
  const auth = await checkEloApiKey(req);
  if (!auth.ok) return fail(res, auth.status, auth.message);

  const rawPhone = req.body?.phone ?? req.body?.phone_number ?? '';
  const phone = String(rawPhone).replace(/\D/g, '').slice(-10);
  if (phone.length !== 10) return fail(res, 400, 'phone_number is required');

  // phone/phone_number are the lookup key, not a field this schema owns —
  // strip them before validating so their presence doesn't trip `.strict()`.
  const { phone: _p, phone_number: _pn, ...fields } = req.body ?? {};
  const parsed = contextSaveFields.safeParse(fields);
  if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? 'Invalid field value');

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;
    data[CONTEXT_SAVE_KEY_MAP[key] ?? key] = value;
  }
  if (typeof data.dob === 'string') {
    const d = new Date(data.dob);
    if (Number.isNaN(d.getTime())) return fail(res, 400, 'dob is not a valid date');
    data.dob = d;
  }
  if (Object.keys(data).length === 0) return fail(res, 400, 'No fields to update');

  const user = await prisma.user.findFirst({ where: { phone } });
  if (!user) return fail(res, 404, 'No user found for this phone number');

  try {
    const updated = await prisma.user.update({ where: { id: user.id }, data });
    log.info('applicant details saved via Ello', { phone, userId: user.id, fields: Object.keys(data) });
    return ok(res, { userId: updated.id, updatedFields: Object.keys(data) }, 'Details saved');
  } catch (e: any) {
    if (e?.code === 'P2002') {
      const field = Array.isArray(e?.meta?.target) ? e.meta.target[0] : (e?.meta?.target ?? 'value');
      return fail(res, 409, `This ${field} is already in use by another account.`);
    }
    throw e;
  }
}));

/**
 * POST /api/context/me/conversation
 *
 * The in-app voice agent saving what it just discussed.
 *
 * Separate from POST /api/conversations on purpose: that route needs the shared
 * CONVERSATION_API_KEY, and shipping that secret inside a mobile app would put it
 * in the hands of anyone who unpacks the APK — enough to read any customer's
 * history by phone number. Here the phone comes from the user's own access token,
 * so the app can only ever write against itself and needs no secret at all.
 */
contextRouter.post('/me/conversation', requireAuth, ah(async (req, res) => {
  const phone = req.user?.phone;
  if (!phone) return fail(res, 401, 'No phone on the session');

  const b = (req.body ?? {}) as Record<string, any>;
  const summary = String(b.summary ?? '').trim();
  // A conversation with no summary contributes nothing to the next agent's brief,
  // which is the entire point of storing it.
  if (!summary) return fail(res, 400, 'summary is required');

  const durationSec = Number(b.duration_sec ?? b.durationSec);

  try {
    const row = await recordConversation({
      phone,
      // The only channel this endpoint may write. An app build must not be able to
      // fabricate a phone call that never happened.
      channel: 'mobile_app',
      agentRole: 'companion',
      providerConversationId: b.conversation_id ?? b.providerConversationId ?? null,
      customerId: null,
      summary,
      transcript: b.transcript ?? null,
      // Deliberately no `outcome`: an in-app assistant conversation is not a sales
      // disposition, and letting the client set one would corrupt the funnel that
      // drives outbound calling.
      details: b.details ?? null,
      durationSec: Number.isFinite(durationSec) ? Math.round(durationSec) : null,
      endedAt: new Date(),
    });
    log.info('app conversation saved', { phone, id: row.id });
    return ok(res, { id: row.id, channel: row.channel }, 'Conversation saved');
  } catch (e) {
    log.error('app conversation save failed', { phone, error: (e as Error).message });
    return fail(res, 400, (e as Error).message);
  }
}));
