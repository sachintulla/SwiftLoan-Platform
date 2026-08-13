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
import type { LenderPartner, LoanApplication, User } from '@prisma/client';
import { emi } from '../utils/emi.js';
import { pick } from './integrations.js';
import { prisma } from './prisma.js';

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
  // Aurix passthrough (undefined for the mock provider). Persisted verbatim on
  // the Offer row so a later step can surface them without another round-trip.
  offerCode?: string | null;
  offerType?: string | null;
  roi?: number | null;
  offerLikelihood?: string | null;
  redirectionUrl?: string | null;
  lenderName?: string | null;
  lenderLogoUrl?: string | null;
  externalPartnerId?: string | null;
  rawOffer?: unknown;
}

interface LenderOfferProvider {
  getOffer(partner: LenderPartner, application: LoanApplication): Promise<RawLenderOffer>;
  /**
   * Providers whose single API call returns MANY offers (e.g. Aurix returns one
   * per real lender) implement this. Callers should prefer it when present and
   * fall back to `[getOffer(...)]` otherwise.
   */
  getOffers?(partner: LenderPartner, application: LoanApplication): Promise<RawLenderOffer[]>;
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

    // Mirrors MarketLoanOffer's rateAtApproval/amountAtApproval pattern (e.g.
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
  audienceSecretCode: string;
  tokenResponsePath?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

/**
 * Config resolves from env FIRST (AURIX_*), then the partner's apiConfig. The
 * AudienceSecretCode is a real credential and is intended to live only in env
 * (never the DB/APK). PartnerCustomerId is NOT config — it is the SwiftLoan
 * User.id, passed per request (see generateAurixToken / buildEligibleOffersPayload).
 */
function resolveAurixConfig(partner: LenderPartner): AurixApiConfig {
  const cfg = (partner.apiConfig ?? {}) as Partial<AurixApiConfig>;
  return {
    authBaseUrl: process.env.AURIX_AUTH_BASE_URL || cfg.authBaseUrl || 'https://pt-auth-api-uat.aurix-partner.com',
    offersBaseUrl: process.env.AURIX_OFFERS_BASE_URL || cfg.offersBaseUrl || 'https://pt-api-uat.aurix-partner.com',
    audienceSecretCode: process.env.AURIX_AUDIENCE_SECRET_CODE || cfg.audienceSecretCode || '',
    // Confirmed against a live UAT generate_token response: { "Data": { "Token": "...", "TokenValidTill": "...", "RefreshToken": "..." }, "Meta": {...} }
    tokenResponsePath: process.env.AURIX_TOKEN_RESPONSE_PATH || cfg.tokenResponsePath || 'Data.Token',
    utmSource: cfg.utmSource,
    utmMedium: cfg.utmMedium,
    utmCampaign: cfg.utmCampaign,
  };
}

/**
 * Generate an X-Aurix-Token. `partnerCustomerId` is the SwiftLoan User.id per
 * the integration decision (mapped to Aurix's PartnerCustomerID). Exported so
 * auth.routes.ts can pre-generate + cache the token at OTP verify.
 */
export async function generateAurixToken(cfg: AurixApiConfig, partnerCustomerId: string): Promise<string> {
  if (!cfg.audienceSecretCode) throw new Error('AURIX_AUDIENCE_SECRET_CODE is not set');
  console.log(`[aurix-req] POST ${cfg.authBaseUrl}/api/generate_token PartnerCustomerID=${partnerCustomerId}`);
  const result = await httpJson(
    `${cfg.authBaseUrl}/api/generate_token`,
    'POST',
    { Accept: 'application/json', 'K-Aurix-Version': 'v3', 'K-Aurix-AudienceSecretCode': cfg.audienceSecretCode },
    { PartnerCustomerID: partnerCustomerId },
  );
  // Response logged with the token itself masked (a live credential).
  console.log(`[aurix-res] generate_token HTTP ${result.status} ok=${result.ok} body=${JSON.stringify(result.body).replace(/("Token":")[^"]+/g, '$1***').replace(/("RefreshToken":")[^"]+/g, '$1***')}`);
  if (!result.ok) throw new Error(`Aurix generate_token failed: ${result.error} (HTTP ${result.status})`);
  const path = cfg.tokenResponsePath ?? 'token';
  const token = pick(result.body, path);
  if (!token) {
    throw new Error(
      `Aurix generate_token succeeded but no token at response path "${path}". Raw: ${JSON.stringify(result.body)}`,
    );
  }
  return String(token);
}

/** Env-resolved token helper for callers that only have a User.id (e.g. OTP verify). */
export async function generateAurixTokenFromEnv(partnerCustomerId: string): Promise<string> {
  return generateAurixToken(resolveAurixConfig({ apiConfig: null } as LenderPartner), partnerCustomerId);
}

/**
 * Marketing-attribution / UTM registration (Aurix `/api/utm_generation`). This
 * mints the utm_code that appears in each offer's OfferRedirectionUrl. Strictly
 * best-effort — a failure never blocks offer generation. Logged like the others.
 */
async function registerAurixUtm(cfg: AurixApiConfig, partnerCustomerId: string, mobileNumber: string): Promise<void> {
  try {
    console.log(`[aurix-req] POST ${cfg.authBaseUrl}/api/utm_generation PartnerCustomerId=${partnerCustomerId} mobile=${mobileNumber}`);
    const res = await httpJson(
      `${cfg.authBaseUrl}/api/utm_generation`,
      'POST',
      { Accept: 'application/json', 'K-Aurix-Version': 'v3', 'X-Aurix-PartnerCustomerId': partnerCustomerId },
      {
        UTMSource: cfg.utmSource ?? 'SwiftLoanApp',
        UTMMedium: cfg.utmMedium ?? 'App',
        UTMCampaign: cfg.utmCampaign ?? 'Default',
        MobileNumber: mobileNumber,
      },
    );
    console.log(`[aurix-res] utm_generation HTTP ${res.status} body=${JSON.stringify(res.body)}`);
  } catch (e) {
    console.warn(`[aurix] utm_generation failed (non-blocking): ${(e as Error).message}`);
  }
}

/* ── Aurix enum/value mappers (SwiftLoan → Aurix vocab) ── */
function aurixGender(g: User['gender']): string {
  return g === 'male' ? 'Male' : g === 'female' ? 'Female' : g ? 'Other' : '';
}
function aurixEmploymentType(e: User['employment']): string {
  switch (e) {
    case 'salaried': return 'Salaried';
    case 'self_employed': return 'Self-Employed';
    case 'business_owner': return 'Self-Employed';
    case 'gig_worker': return 'Self-Employed';
    default: return e ? 'Other' : '';
  }
}
function aurixProductType(loanType: LoanApplication['loanType']): string {
  return loanType === 'business' ? 'BusinessLoan' : 'PersonalLoan';
}
function ageFromDob(dob: Date | null): number {
  if (!dob) return 0;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

/** Build the eligible_offers request body from the applicant + application. */
function buildEligibleOffersPayload(user: User, application: LoanApplication): Record<string, unknown> {
  const pan = application.panNumber || user.panNumber || '';
  const first = user.firstName || (user.fullName ? user.fullName.trim().split(/\s+/)[0] : '') || '';
  const last = user.lastName || (user.fullName ? user.fullName.trim().split(/\s+/).slice(-1)[0] : '') || '';
  const monthly = user.monthlyIncome ?? application.monthlyIncome ?? 0;
  const nowIso = new Date().toISOString();
  const isBusiness = application.loanType === 'business';
  return {
    PartnerCustomerId: application.userId,
    PersonalInformation: {
      CustomerFullName: user.fullName || `${first} ${last}`.trim(),
      FirstName: first,
      MiddleName: '',
      LastName: last,
      MobileNumber: user.phone,
      // Aurix runs format validators on these and rejects "" — so optional
      // email/mobile fields are OMITTED when blank rather than sent empty.
      ...(user.alternateMobile ? { AlternateMobile: user.alternateMobile } : {}),
      ...(user.email ? { Email: user.email } : {}),
      ...(user.alternateEmail ? { AlternateEmail: user.alternateEmail } : {}),
      Pan: pan,
      Aadhaar: '',
      Dob: user.dob ? user.dob.toISOString() : null,
      Age: ageFromDob(user.dob),
      Gender: aurixGender(user.gender),
      MaritalStatus: user.maritalStatus ?? '',
      Qualification: user.qualification ?? '',
    },
    EmploymentDetails: {
      EmploymentType: aurixEmploymentType(user.employment ?? application.employment),
      EmployerName: user.company ?? '',
      ...(user.companyEmail ? { CompanyEmail: user.companyEmail } : {}),
      ...(user.businessEmail ? { BusinessEmail: user.businessEmail } : {}),
      BusinessName: isBusiness ? (user.company ?? '') : '',
      ForBusinessLoan: isBusiness,
      ProfessionalType: user.professionalType ?? '',
    },
    IncomeInformation: {
      MonthlyIncome: monthly,
      AnnualIncome: monthly * 12,
      SalaryMode: user.salaryMode ?? '',
      MonthlyObligations: user.monthlyObligations ?? 0,
    },
    PanVerificationDTO: {
      VerificationDone: !!pan,
      Verified: !!pan,
      VerificationDate: nowIso,
      PanNumber: pan,
      Category: 'Individual',
      AadhaarLinked: false,
    },
    BusinessDetailsDTO: {},
    ProductDetails: {
      ProductType: aurixProductType(application.loanType),
      LoanPurpose: user.loanPurpose || application.purpose || '',
      // Aurix RequestedAmount is in rupees; our amount column is paise.
      RequestedAmount: Math.round(application.amount / 100),
    },
    Addresses: [
      {
        AddressType: 'Current',
        AddressLine1: user.addressLine1 ?? '',
        AddressLine2: user.addressLine2 ?? '',
        Landmark: user.landmark ?? '',
        City: user.city ?? '',
        District: user.district ?? '',
        State: user.state ?? '',
        Pincode: user.pincode ?? '',
        IsCurrent: true,
        IsPermanent: true,
      },
    ],
    Consents: [
      {
        ConsentType: 'TermsAndConditions',
        ConsentDescription: 'User agrees to credit assessment rules.',
        ConsentTimestamp: nowIso,
        IsConsentGiven: true,
      },
    ],
    BureauInformation: {
      BureauVendor: 'CIBIL',
      BureauPulled: true,
      BureauDate: nowIso,
      Payload: JSON.stringify({ score: user.creditScore, status: 'Success' }),
    },
  };
}

interface AurixOfferRaw {
  OfferCode?: string;
  OfferType?: string;
  LoanAmount?: number; // rupees
  ROI?: number;
  Tenure?: number;
  EMI?: number;
  ProcessingFee?: number; // percent
  OfferLikelihood?: string;
  OfferRedirectionUrl?: string;
  Lender?: { Id?: string | null; DisplayName?: string; LenderLogo?: string | null };
  PartnerId?: string;
}

/** Map one Aurix offer into our RawLenderOffer (amounts → paise; EMI computed when 0). Exported for tests. */
export function mapAurixOffer(o: AurixOfferRaw): RawLenderOffer {
  const amount = Math.round((o.LoanAmount ?? 0) * 100); // rupees → paise
  const apr = o.ROI ?? 0;
  const tenureMonths = o.Tenure ?? 0;
  const pfPercent = o.ProcessingFee ?? 0;
  const processingFeeAmount = Math.round(amount * (pfPercent / 100));
  const gstOnProcessingFee = Math.round(processingFeeAmount * GST_RATE);
  const netDisbursalAmount = amount - processingFeeAmount - gstOnProcessingFee;

  // Aurix returns EMI: 0 in UAT — compute it ourselves when a tenure is known
  // so the existing tiles/handoff keep working off a real figure.
  const monthlyEmi = o.EMI && o.EMI > 0 ? o.EMI : (tenureMonths > 0 ? emi(amount, tenureMonths, apr) : 0);
  const emiOptions: EmiOptionResult[] = tenureMonths > 0 ? [{
    tenureMonths,
    monthlyEmi,
    totalInterestPayable: monthlyEmi * tenureMonths - amount,
    totalRepaymentAmount: monthlyEmi * tenureMonths,
    recommended: true,
  }] : [];

  return {
    amount,
    apr,
    processingFeeAmount,
    gstOnProcessingFee,
    netDisbursalAmount,
    // Tile badge left to the caller (kept clean for now); OfferType is preserved
    // in the dedicated offerType column below for the later tile step.
    badgeText: null,
    emiOptions,
    offerCode: o.OfferCode ?? null,
    offerType: o.OfferType ?? null,
    roi: o.ROI ?? null,
    offerLikelihood: o.OfferLikelihood ?? null,
    redirectionUrl: o.OfferRedirectionUrl ?? null,
    lenderName: o.Lender?.DisplayName ?? null,
    lenderLogoUrl: o.Lender?.LenderLogo ?? null,
    externalPartnerId: o.PartnerId ?? null,
    rawOffer: o,
  };
}

class AurixOfferProvider implements LenderOfferProvider {
  /** Single Aurix call returns MANY offers (one per real lender). */
  async getOffers(partner: LenderPartner, application: LoanApplication): Promise<RawLenderOffer[]> {
    const cfg = resolveAurixConfig(partner);
    if (!cfg.audienceSecretCode) {
      throw new Error('Aurix is not configured (AURIX_AUDIENCE_SECRET_CODE missing)');
    }

    const user = await prisma.user.findUnique({ where: { id: application.userId } });
    if (!user) throw new Error(`Aurix offers: user ${application.userId} not found`);

    // Prefer the token cached at OTP verify; refresh if missing/expired.
    let token = user.aurixToken ?? '';
    const expired = !user.aurixTokenExpiresAt || user.aurixTokenExpiresAt.getTime() < Date.now();
    if (!token || expired) {
      token = await generateAurixToken(cfg, application.userId);
      await prisma.user.update({
        where: { id: user.id },
        // Aurix hasn't documented token TTL; assume ~30 min and refresh eagerly.
        data: { aurixToken: token, aurixTokenExpiresAt: new Date(Date.now() + 30 * 60_000) },
      }).catch(() => {});
    }

    // Best-effort UTM registration (mints the utm_code in offer redirect URLs).
    await registerAurixUtm(cfg, application.userId, user.phone);

    const payload = buildEligibleOffersPayload(user, application);
    // Full request/response logging for integration analysis (PAN masked).
    const maskedPayload = JSON.stringify(payload).replace(/("Pan(?:Number)?":")[A-Z0-9]{6}/g, '$1******');
    console.log(`[aurix-req] POST ${cfg.offersBaseUrl}/api/eligible_offers user=${application.userId} app=${application.id} payload=${maskedPayload}`);
    // eligible_offers is a real bureau/BRE call and can be slow — allow 30s
    // rather than the default 15s so a legitimately slow decision doesn't time out.
    const result = await httpJson(
      `${cfg.offersBaseUrl}/api/eligible_offers`,
      'POST',
      { Accept: 'application/json', 'K-Aurix-Version': 'v1', 'X-Aurix-Token': token },
      payload,
      30_000,
    );
    console.log(`[aurix-res] HTTP ${result.status} body=${JSON.stringify(result.body)}`);
    if (!result.ok) throw new Error(`Aurix eligible_offers failed: ${result.error} (HTTP ${result.status})`);

    const meta = result.body?.Result?.Meta;
    const success = meta?.Success === true;
    const offers: AurixOfferRaw[] = result.body?.Result?.Data?.Offers ?? [];
    if (!success || offers.length === 0) {
      // e.g. "No data found", "PAN verification failed", "Bureau verification
      // failed" — a legitimate zero-offers outcome, not a crash. Log and return
      // none; the offers screen renders its existing empty state.
      console.warn(`[aurix] eligible_offers returned no offers: ${meta?.Message ?? 'unknown'} (code ${meta?.StatusCode ?? '?'})`);
      return [];
    }
    return offers.map(mapAurixOffer);
  }

  /** Interface fallback: first offer only (callers should prefer getOffers). */
  async getOffer(partner: LenderPartner, application: LoanApplication): Promise<RawLenderOffer> {
    const list = await this.getOffers(partner, application);
    if (list.length === 0) throw new Error('Aurix returned no eligible offers');
    return list[0];
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
