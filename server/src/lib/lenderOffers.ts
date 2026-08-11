/**
 * Lender-offer generation, behind an adapter seam.
 *
 * No real lender API is integrated yet — `MockLenderOfferProvider` fabricates
 * a response shaped exactly like a real lender eventually would (multiple
 * EMI/tenure options, a fee breakdown, a net disbursal figure), computed off
 * the existing `LenderPartner` catalog with the same amortization math used
 * elsewhere (`utils/emi.ts`). `LenderPartner.provider` selects the adapter, so
 * wiring a real lender later is a config change (seed/admin-edit the
 * partner's `provider` + `apiConfig`) plus one new provider class here, not a
 * rewrite of `/prequalify`.
 */
import type { LenderPartner, LoanApplication } from '@prisma/client';
import { emi } from '../utils/emi.js';
import { pick } from './integrations.js';

const DEFAULT_TIMEOUT_MS = 15_000;

async function httpJson(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ ok: boolean; status: number; body: any; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: any = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* provider returned non-JSON */ }
    return { ok: res.ok, status: res.status, body: parsed, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e: any) {
    const aborted = e?.name === 'AbortError';
    return { ok: false, status: 0, body: null, error: aborted ? `timed out after ${timeoutMs}ms` : String(e?.message ?? e) };
  } finally {
    clearTimeout(timer);
  }
}

export interface EmiOptionResult {
  tenureMonths: number;
  monthlyEmi: number;
  totalInterestPayable: number;
  totalRepaymentAmount: number;
  recommended: boolean;
}

export interface RawLenderOffer {
  amount: number;
  apr: number;
  processingFeeAmount: number;
  gstOnProcessingFee: number;
  netDisbursalAmount: number;
  badgeText: string | null;
  emiOptions: EmiOptionResult[];
}

interface LenderOfferProvider {
  getOffer(partner: LenderPartner, application: LoanApplication): Promise<RawLenderOffer>;
}

// Standard GST rate on loan processing fees in India.
const GST_RATE = 0.18;

/** Requested tenure plus its two nearest standard neighbors, so the user always sees a small, sensible spread. */
function tenureCandidates(requestedMonths: number): number[] {
  const standard = [12, 24, 36, 48, 60];
  const set = new Set([requestedMonths, ...standard.filter(t => Math.abs(t - requestedMonths) <= 24)]);
  return Array.from(set).sort((a, b) => a - b).slice(0, 3);
}

class MockLenderOfferProvider implements LenderOfferProvider {
  async getOffer(partner: LenderPartner, application: LoanApplication): Promise<RawLenderOffer> {
    const amount = Math.min(
      Math.max(application.amount, partner.minAmount ?? application.amount),
      partner.maxAmount ?? application.amount,
    );
    const apr = partner.baseApr;

    const processingFeeAmount = partner.processingFeePercent != null
      ? Math.round(amount * (partner.processingFeePercent / 100))
      : partner.processingFee;
    const gstOnProcessingFee = Math.round(processingFeeAmount * GST_RATE);
    const netDisbursalAmount = amount - processingFeeAmount - gstOnProcessingFee;

    // Mirrors PreApprovedPlan's rateAtApproval/amountAtApproval pattern (e.g.
    // real-world UnitySFB/MoneyView don't disclose a computed EMI upfront) —
    // configured per mock partner via apiConfig so this is a real, seedable
    // case rather than a hypothetical the UI never actually has to render.
    const emiAtApproval = !!(partner.apiConfig as { emiAtApproval?: boolean } | null)?.emiAtApproval;

    const emiOptions: EmiOptionResult[] = emiAtApproval ? [] : tenureCandidates(application.tenureMonths).map(tenureMonths => {
      const monthlyEmi = emi(amount, tenureMonths, apr);
      const totalRepaymentAmount = monthlyEmi * tenureMonths;
      return {
        tenureMonths,
        monthlyEmi,
        totalInterestPayable: totalRepaymentAmount - amount,
        totalRepaymentAmount,
        recommended: tenureMonths === application.tenureMonths,
      };
    });
    // Guarantee exactly one recommended option even if the requested tenure
    // fell outside the candidate spread for some reason.
    if (emiOptions.length > 0 && !emiOptions.some(o => o.recommended)) emiOptions[0].recommended = true;

    return {
      amount,
      apr,
      processingFeeAmount,
      gstOnProcessingFee,
      netDisbursalAmount,
      badgeText: partner.tagline ?? null,
      emiOptions,
    };
  }
}

/**
 * Knight Fintech (Aurix platform) — the first real lender integration,
 * embedded-lending partner for the Nukkad Shops project (per the Aug 2026
 * "Embedded Lending Kick-off" email thread). Store per-partner connection
 * details in `LenderPartner.apiConfig`:
 *
 *   {
 *     "authBaseUrl": "https://pt-auth-api-uat.aurix-partner.com",
 *     "offersBaseUrl": "https://pt-api-uat.aurix-partner.com",
 *     "partnerCustomerId": "PT12B5",
 *     "audienceSecretCode": "<the real secret — UAT or prod value>",
 *     "tokenResponsePath": "data.token"   // dotted path into generate_token's
 *                                         // response body — KFT's actual
 *                                         // response shape hasn't been shared
 *                                         // yet, so this defaults to a guess
 *                                         // and must be corrected once known.
 *   }
 *
 * `audienceSecretCode` is a real credential sitting in a plain JSON column
 * (unlike IntegrationConfig's separate enabled/settings/secrets split for
 * Ello/Upshot) — treat apiConfig as sensitive for this partner and avoid
 * logging it; a secrets-split follow-up would match the existing precedent
 * more closely if this becomes the pattern for multiple real lenders.
 */
interface AurixApiConfig {
  authBaseUrl: string;
  offersBaseUrl: string;
  partnerCustomerId: string;
  audienceSecretCode: string;
  tokenResponsePath?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

async function generateAurixToken(cfg: AurixApiConfig): Promise<string> {
  const result = await httpJson(
    `${cfg.authBaseUrl}/api/generate_token`,
    'POST',
    { Accept: 'application/json', 'K-Aurix-Version': 'v3', 'K-Aurix-AudienceSecretCode': cfg.audienceSecretCode },
    { PartnerCustomerID: cfg.partnerCustomerId },
  );
  if (!result.ok) throw new Error(`Aurix generate_token failed: ${result.error} (HTTP ${result.status})`);
  const path = cfg.tokenResponsePath ?? 'token';
  const token = pick(result.body, path);
  if (!token) {
    throw new Error(
      `Aurix generate_token succeeded but no token found at response path "${path}" — ` +
      `set apiConfig.tokenResponsePath to match KFT's actual response shape. Raw response: ${JSON.stringify(result.body)}`,
    );
  }
  return token;
}

/** Best-effort marketing attribution — never blocks offer generation on failure. */
async function registerAurixUtm(cfg: AurixApiConfig, mobileNumber: string): Promise<void> {
  await httpJson(
    `${cfg.authBaseUrl}/api/utm_generation`,
    'POST',
    { Accept: 'application/json', 'K-Aurix-Version': 'v3', 'X-Aurix-PartnerCustomerId': cfg.partnerCustomerId },
    {
      UTMSource: cfg.utmSource ?? 'SwiftLoanApp',
      UTMMedium: cfg.utmMedium ?? 'App',
      UTMCampaign: cfg.utmCampaign ?? 'Default',
      MobileNumber: mobileNumber,
    },
  ).catch(() => {});
}

class AurixOfferProvider implements LenderOfferProvider {
  async getOffer(partner: LenderPartner, application: LoanApplication): Promise<RawLenderOffer> {
    const cfg = partner.apiConfig as unknown as AurixApiConfig | null;
    if (!cfg?.authBaseUrl || !cfg.offersBaseUrl || !cfg.partnerCustomerId || !cfg.audienceSecretCode) {
      throw new Error(`LenderPartner "${partner.name}" has provider "aurix" but apiConfig is missing required fields`);
    }

    // Confirmed against KFT's shared curl examples — safe to run as-is.
    const token = await generateAurixToken(cfg);
    registerAurixUtm(cfg, application.userId).catch(() => {});

    // NOT YET IMPLEMENTED: KFT's "Eligible Offers" request/response body was
    // only shared as a file attachment (never pasted as text), so the actual
    // field names it expects (PAN, income, employment, requested amount/tenure,
    // etc.) and what it returns are still unknown. Wiring this blind would
    // send a real request to KFT's UAT endpoint with guessed field names.
    // Get that sample request+response body, then replace this with:
    //   POST `${cfg.offersBaseUrl}/api/eligible_offers`
    //   header: Authorization: Bearer ${token} (or whatever header KFT expects)
    //   body: { ...customer + application fields KFT's schema requires }
    // then map the response into RawLenderOffer the same way MockLenderOfferProvider does.
    throw new Error(
      `Aurix (Knight Fintech) eligible_offers integration is not implemented yet — ` +
      `the request/response schema for that endpoint hasn't been provided. Token generation succeeded (length ${token.length}).`,
    );
  }
}

const PROVIDERS: Record<string, LenderOfferProvider> = {
  mock: new MockLenderOfferProvider(),
  aurix: new AurixOfferProvider(),
};

export function getLenderOfferProvider(partner: LenderPartner): LenderOfferProvider {
  const provider = PROVIDERS[partner.provider];
  if (!provider) {
    throw new Error(`Lender provider "${partner.provider}" is not implemented yet (partner: ${partner.name})`);
  }
  return provider;
}
