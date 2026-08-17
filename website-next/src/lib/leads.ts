/**
 * Website lead submission — the one integration the redesign must not lose.
 *
 * Extracted from the old SiteScripts.tsx so the new React components import a
 * function instead of inheriting a 580-line DOM script. This is the entire
 * contract between the marketing site and the platform:
 *
 *   form submit
 *     -> POST {API_BASE}/api/context/create
 *        -> Customer + Lead rows, journey event `lead_captured`
 *        -> leadAutoCaller picks it up ~1 min later and the voice agent calls
 *     -> returns a landingUrl carrying an opaque context token, so the app can
 *        resume with the details already typed
 *
 * Change the field names here and you change what the agent says on the phone
 * and what the admin dashboard can report on — this is not a display concern.
 */

export interface LeadDetails {
  /** The simplified form no longer collects these — the backend already
   *  treats every field here as optional (POST /api/context/create). */
  name?: string;
  phone: string;
  email?: string;
  city?: string;
  /** "Personal Loan" | "Business Loan" — stored as the lead's productInterest. */
  product: string;
  /** RUPEES. Converted to paise here, since the server stores paise throughout. */
  amountRupees: number;
}

export interface LeadResult {
  token?: string;
  landingUrl?: string;
  deepLink?: string;
}

/**
 * Resolution order matters. `window.SWIFTLOAN_API_BASE` stays first so a
 * deployed page can be repointed without a rebuild; NEXT_PUBLIC_API_BASE is the
 * normal per-environment setting.
 *
 * There is deliberately NO production fallback: a missing env var used to send
 * locally-submitted forms to the shared dev API, so the lead vanished from the
 * local database and no call was ever queued — a genuinely confusing failure.
 * Failing loudly in development is better than crossing environments silently.
 */
export function apiBase(): string {
  const fromWindow =
    typeof window !== 'undefined'
      ? (window as unknown as { SWIFTLOAN_API_BASE?: string }).SWIFTLOAN_API_BASE
      : undefined;
  const base = fromWindow || process.env.NEXT_PUBLIC_API_BASE || '';

  if (!base && typeof window !== 'undefined') {
    console.error(
      '[swiftloan] NEXT_PUBLIC_API_BASE is not set — lead submissions cannot be sent. ' +
        'Set it in website-next/.env.local (local: http://localhost:4000).',
    );
  }
  return base.replace(/\/+$/, '');
}

const ATTRIB_KEY = 'sl_attrib';

/**
 * Campaign attribution, captured on first load while the query string is still
 * present and kept in sessionStorage so it survives in-page navigation.
 * Without this the admin dashboard can never answer "which campaign did this
 * customer come from".
 */
export function attribution(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const out: Record<string, string> = {};
  try {
    const q = new URLSearchParams(window.location.search);
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'campaignId']) {
      const v = q.get(k);
      if (v) out[k] = v;
    }
    if (document.referrer) out.referrer = document.referrer;

    const stored = window.sessionStorage.getItem(ATTRIB_KEY);
    if (Object.keys(out).length > 0) {
      window.sessionStorage.setItem(ATTRIB_KEY, JSON.stringify(out));
      return out;
    }
    if (stored) return JSON.parse(stored) as Record<string, string>;
  } catch {
    /* not fatal — attribution just won't survive an in-page navigation */
  }
  return out;
}

/** A short human-readable reference shown to the user, e.g. SL-4821. */
export function makeRefId(): string {
  return 'SL-' + Math.floor(1000 + Math.random() * 9000);
}

function inr(n: number): string {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}

/**
 * Send the lead. Never throws — a failed submit must not break the success UI
 * the visitor is looking at, and the details are still recoverable from the
 * form. Returns undefined when the post failed, so the caller can hide the
 * app-continue card rather than render a dead link.
 */
export async function submitLead(d: LeadDetails, refId: string): Promise<LeadResult | undefined> {
  const base = apiBase();
  if (!base) return undefined;

  const body = {
    name: d.name,
    phone: d.phone,
    email: d.email,
    city: d.city,
    product: d.product,
    amount: Math.round(d.amountRupees * 100), // paise
    summary: `Interested in a ${inr(d.amountRupees)} ${d.product || 'loan'} — submitted on swiftloan.ai (ref ${refId}).`,
    source: 'website',
    ...attribution(),
  };

  try {
    const res = await fetch(`${base}/api/context/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error('[swiftloan] lead submit failed', res.status);
      return undefined;
    }
    const json = (await res.json()) as { data?: LeadResult };
    return json?.data;
  } catch (e) {
    console.error('[swiftloan] lead submit threw', e);
    return undefined;
  }
}

/**
 * Phone verification (OTP) + callback consent — the step that runs after
 * submitLead() has already saved the lead. Deliberately a separate API
 * surface (/api/website/*) from the app's own OTP login: this never creates
 * a User or issues an app session, it only proves the number on this lead is
 * real before any calling job is allowed to dial it.
 */

export interface OtpRequestResult {
  otpSent: boolean;
  alreadyVerified?: boolean;
  /** Only present outside prod / with no SMS provider configured — see the server's sms.ts dev fallback. */
  devOtp?: string;
}

/** Undefined means a network/server error — never thrown, so the OTP panel can show a retry affordance. */
export async function requestWebsiteOtp(phone: string): Promise<OtpRequestResult | undefined> {
  const base = apiBase();
  if (!base) return undefined;
  try {
    const res = await fetch(`${base}/api/website/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    if (!res.ok) {
      console.error('[swiftloan] otp request failed', res.status);
      return undefined;
    }
    const json = (await res.json()) as { data?: OtpRequestResult };
    return json?.data;
  } catch (e) {
    console.error('[swiftloan] otp request threw', e);
    return undefined;
  }
}

export interface OtpVerifyResult {
  verified: boolean;
  alreadyVerified?: boolean;
}

/**
 * Undefined means a network/server error (generic failure). `{ verified: false }`
 * means the server rejected the code itself (wrong/expired) — the caller can
 * tell these apart to show "try again" vs a hard failure.
 */
export async function verifyWebsiteOtp(phone: string, code: string): Promise<OtpVerifyResult | undefined> {
  const base = apiBase();
  if (!base) return undefined;
  try {
    const res = await fetch(`${base}/api/website/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    });
    if (res.status === 400 || res.status === 404) return { verified: false };
    if (!res.ok) {
      console.error('[swiftloan] otp verify failed', res.status);
      return undefined;
    }
    const json = (await res.json()) as { data?: OtpVerifyResult };
    return json?.data ?? { verified: false };
  } catch (e) {
    console.error('[swiftloan] otp verify threw', e);
    return undefined;
  }
}

/** Fire-and-forget by design (matches upshotEvent/upshotIdentify elsewhere in
 *  this file's callers) — the visitor's own screen never waits on this. */
export async function submitCallbackChoice(phone: string, response: 'yes' | 'no'): Promise<boolean> {
  const base = apiBase();
  if (!base) return false;
  try {
    const res = await fetch(`${base}/api/website/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, response }),
    });
    return res.ok;
  } catch (e) {
    console.error('[swiftloan] callback choice threw', e);
    return false;
  }
}
