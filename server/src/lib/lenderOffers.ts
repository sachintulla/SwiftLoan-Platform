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
import { getPanVerificationForOffers, type PanVerificationForOffers } from './panVerification.js';

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
 * Last raw Aurix eligible_offers response per applicationId, so the prequalify
 * route can surface it to the app (debug alert). Keyed by applicationId (unique
 * per run); the reader takes-and-clears to avoid unbounded growth.
 */
const aurixDebugByApp = new Map<string, unknown>();
export function takeAurixDebug(applicationId: string): unknown {
  const v = aurixDebugByApp.get(applicationId);
  aurixDebugByApp.delete(applicationId);
  return v ?? null;
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
    utmSource: process.env.AURIX_UTM_SOURCE || cfg.utmSource,
    utmMedium: process.env.AURIX_UTM_MEDIUM || cfg.utmMedium,
    utmCampaign: process.env.AURIX_UTM_CAMPAIGN || cfg.utmCampaign,
  };
}

/**
 * Generate an X-Aurix-Token. `partnerCustomerId` is the SwiftLoan User.id per
 * the integration decision (mapped to Aurix's PartnerCustomerID). Exported so
 * auth.routes.ts can pre-generate + cache the token at OTP verify.
 */
export async function generateAurixToken(cfg: AurixApiConfig, partnerCustomerId: string, mobileNumber?: string): Promise<string> {
  if (!cfg.audienceSecretCode) throw new Error('AURIX_AUDIENCE_SECRET_CODE is not set');
  console.log(`[aurix-req] POST ${cfg.authBaseUrl}/api/generate_token PartnerCustomerID=${partnerCustomerId}`);
  // v1.2 of the Single Offers API makes MobileNumber mandatory in the token body.
  const body: Record<string, string> = { PartnerCustomerID: partnerCustomerId };
  if (mobileNumber) body.MobileNumber = mobileNumber;
  const result = await httpJson(
    `${cfg.authBaseUrl}/api/generate_token`,
    'POST',
    { Accept: 'application/json', 'K-Aurix-Version': 'v3', 'K-Aurix-AudienceSecretCode': cfg.audienceSecretCode },
    body,
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
export async function generateAurixTokenFromEnv(partnerCustomerId: string, mobileNumber?: string): Promise<string> {
  return generateAurixToken(resolveAurixConfig({ apiConfig: null } as LenderPartner), partnerCustomerId, mobileNumber);
}

/**
 * The user's cached X-Aurix-Token (minted at OTP verify), refreshed when
 * missing/expired. PartnerCustomerId is always the User.id, so a token is
 * per-user and shared by every Aurix call made for them.
 */
export async function ensureAurixToken(cfg: AurixApiConfig, user: Pick<User, 'id' | 'phone' | 'aurixToken' | 'aurixTokenExpiresAt'>): Promise<string> {
  const token = user.aurixToken ?? '';
  const expired = !user.aurixTokenExpiresAt || user.aurixTokenExpiresAt.getTime() < Date.now();
  if (token && !expired) return token;
  const fresh = await generateAurixToken(cfg, user.id, user.phone);
  await prisma.user.update({
    where: { id: user.id },
    // Aurix hasn't documented token TTL; assume ~30 min and refresh eagerly.
    data: { aurixToken: fresh, aurixTokenExpiresAt: new Date(Date.now() + 30 * 60_000) },
  }).catch(() => {});
  return fresh;
}

/**
 * Aurix PAN Comprehensive (`POST /api/pan_comprehensive`). PAID per call — the
 * only caller is lib/panVerification.ts, which answers from the PanRecord
 * cache first and calls this solely for a PAN it has never seen.
 *
 * PartnerCustomerId must be the same one later sent to eligible_offers (the
 * User.id), and the token must be v3 from generate_token. Returns the raw
 * HTTP result; the caller decides verified / invalid / transient failure.
 */
export async function callAurixPanComprehensive(
  user: Pick<User, 'id' | 'phone' | 'aurixToken' | 'aurixTokenExpiresAt'>,
  pan: string,
): Promise<{ ok: boolean; status: number; body: any; error?: string }> {
  const cfg = resolveAurixConfig({ apiConfig: null } as LenderPartner);
  if (!cfg.audienceSecretCode) throw new Error('Aurix is not configured (AURIX_AUDIENCE_SECRET_CODE missing)');
  const token = await ensureAurixToken(cfg, user);
  const baseUrl = process.env.AURIX_PAN_BASE_URL || cfg.offersBaseUrl;
  console.log(`[aurix-req] POST ${baseUrl}/api/pan_comprehensive user=${user.id} pan=******${pan.slice(-4)}`);
  const result = await httpJson(
    `${baseUrl}/api/pan_comprehensive`,
    'POST',
    {
      Accept: 'application/json',
      'K-Aurix-Version': 'v3',
      'X-Aurix-Token': token,
      // Same header set eligible_offers needs on this gateway; harmless extras if unused.
      'K-Aurix-Token': token,
      'K-Aurix-PartnerCustomerId': user.id,
    },
    { PanNumber: pan, PartnerCustomerId: user.id },
    20_000,
  );
  // Status + shape only — the body is the person's identity data, never logged.
  console.log(`[aurix-res] pan_comprehensive HTTP ${result.status} ok=${result.ok} success=${(result.body?.Result ?? result.body)?.Meta?.Success ?? '?'}`);
  return result;
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
export function aurixProductType(loanType: LoanApplication['loanType']): string {
  // v1.2 master values: PersonalLoan | UnSecBusinessLoan.
  return loanType === 'business' ? 'UnSecBusinessLoan' : 'PersonalLoan';
}

/** Wrap Aurix's raw base64 lender logo into a data URI RN <Image> can render. */
function aurixLogoUri(logo?: string | null): string | null {
  if (!logo) return null;
  if (/^(https?:|data:)/.test(logo)) return logo;
  return `data:image/png;base64,${logo}`;
}

/** Map free-form app qualification text → Aurix v1.2 master value. */
function aurixQualification(q?: string | null): string {
  if (!q) return '';
  const s = q.toLowerCase();
  if (s.includes('phd') || s.includes('doctor')) return 'Doctorate / PhD';
  if (s.includes('post') || s.includes('master') || s.includes('pg')) return "Postgraduate / Master's Degree";
  if (s.includes('under') || s.includes('bachelor') || s.includes('graduate') || s.includes('degree')) return "Undergraduate / Bachelor's Degree";
  if (s.includes('diploma')) return 'Diploma';
  if (s.includes('12') || s.includes('higher sec') || s.includes('intermediate')) return '12th Pass / Higher Secondary';
  if (s.includes('10') || s.includes('secondary') || s.includes('ssc')) return '10th Pass / Secondary School';
  return 'Others';
}

/** Map free-form app loan-purpose text → Aurix v1.2 PersonalLoan master value. */
function aurixLoanPurpose(p?: string | null): string {
  if (!p) return 'Other Reason';
  const s = p.toLowerCase();
  if (s.includes('renov') || s.includes('home') || s.includes('repair')) return 'Home Renovation/Repair';
  if (s.includes('medical')) return 'Medical Expense';
  if (s.includes('wedding') || s.includes('marriage')) return 'Wedding Expense';
  if (s.includes('travel') || s.includes('vacation')) return 'Travel & Vacation';
  if (s.includes('debt') || s.includes('consolid')) return 'Debt Consolidation';
  if (s.includes('vehicle') || s.includes('car') || s.includes('bike')) return 'Vehicle Purchase';
  if (s.includes('gadget') || s.includes('appliance')) return 'Gadget/ Appliance Purchase';
  if (s.includes('emergency')) return 'Emergency Expense';
  if (s.includes('festival') || s.includes('event') || s.includes('celebrat')) return 'Festival/Event Celebrations';
  if (s.includes('business')) return 'Business Expense';
  if (s.includes('large') || s.includes('purchase')) return 'Large Purchases';
  return 'Other Reason';
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
function buildEligibleOffersPayload(
  user: User,
  application: LoanApplication,
  panVerification: PanVerificationForOffers | null = null,
): Record<string, unknown> {
  const pan = application.panNumber || user.panNumber || '';
  const first = user.firstName || (user.fullName ? user.fullName.trim().split(/\s+/)[0] : '') || '';
  const last = user.lastName || (user.fullName ? user.fullName.trim().split(/\s+/).slice(-1)[0] : '') || '';
  const monthly = user.monthlyIncome ?? application.monthlyIncome ?? 0;
  const nowIso = new Date().toISOString();
  const isBusiness = application.loanType === 'business';
  // Aurix rejects any mobile that isn't a 10-digit Indian number starting 6-9.
  // Only forward the alternate mobile when it's actually valid — junk optional
  // data must not fail the whole offers call.
  const validMobile = (m?: string | null) => !!m && /^[6-9]\d{9}$/.test(m);
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
      ...(validMobile(user.alternateMobile) ? { AlternateMobile: user.alternateMobile } : {}),
      ...(user.email ? { Email: user.email } : {}),
      ...(user.alternateEmail ? { AlternateEmail: user.alternateEmail } : {}),
      Pan: pan,
      Aadhaar: '',
      Dob: user.dob ? user.dob.toISOString() : null,
      Age: ageFromDob(user.dob),
      Gender: aurixGender(user.gender),
      MaritalStatus: user.maritalStatus ?? '',
      Qualification: aurixQualification(user.qualification),
    },
    EmploymentDetails: {
      // v1.2 added EntityType (Individual | NonIndividual), mandatory for all loans.
      EntityType: isBusiness ? 'NonIndividual' : 'Individual',
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
    // From PAN Comprehensive when this PAN has been verified; otherwise the
    // previous assumed values (PAN not yet run through pan_comprehensive).
    PanVerificationDTO: panVerification
      ? {
          VerificationDone: true,
          Verified: panVerification.verified,
          VerificationDate: (panVerification.verifiedAt ?? new Date()).toISOString(),
          PanNumber: pan,
          Category: panVerification.category ?? 'Individual',
          AadhaarLinked: panVerification.aadhaarLinked ?? false,
        }
      : {
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
      LoanPurpose: aurixLoanPurpose(user.loanPurpose || application.purpose),
      // LoanApplication.amount is already in RUPEES (app convention — see
      // client.ts), and Aurix RequestedAmount is in rupees. No /100.
      RequestedAmount: application.amount,
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
        // v1.2 ConsentType master naming uses underscores.
        ConsentType: 'Bureau_Check',
        ConsentDescription: 'I hereby authorize the lender to pull my credit information from CIBIL/Experian.',
        ConsentTimestamp: nowIso,
        ConsentExpiry: null,
        IsConsentGiven: true,
      },
      {
        ConsentType: 'Terms_And_Conditions',
        ConsentDescription: 'I agree to the privacy policy and digital lending terms.',
        ConsentTimestamp: nowIso,
        ConsentExpiry: null,
        IsConsentGiven: true,
      },
    ],
    BureauInformation: {
      BureauVendor: 'Experian',
      BureauPulled: false,
      BureauDate: nowIso,
      // v1.2 documents Payload as a JSON object, but the live UAT DTO still
      // binds it as a string — sending an object triggers "Request body cannot
      // be null" (whole-body deserialization failure). Keep it stringified.
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
  Lender?: { Id?: string | number | null; DisplayName?: string; LenderLogo?: string | null };
  PartnerId?: string | number;
}

/** Map one Aurix offer into our RawLenderOffer (amounts → paise; EMI computed when 0). Exported for tests. */
export function mapAurixOffer(o: AurixOfferRaw): RawLenderOffer {
  // Aurix LoanAmount is in rupees; Offer.amount is also rupees (app convention). No *100.
  const amount = Math.round(o.LoanAmount ?? 0);
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
    // Aurix returns LenderLogo as a raw base64 PNG (no data: prefix); RN <Image>
    // needs a data URI. Pass through http(s)/data URIs untouched.
    lenderLogoUrl: aurixLogoUri(o.Lender?.LenderLogo),
    // Aurix sends Lender.Id (string|null) and a top-level PartnerId (often the
    // number 0); externalPartnerId is a String column, so coerce to string.
    externalPartnerId: o.Lender?.Id != null ? String(o.Lender.Id) : (o.PartnerId != null ? String(o.PartnerId) : null),
    rawOffer: o,
  };
}

class AurixOfferProvider implements LenderOfferProvider {
  /** Single Aurix call returns MANY offers (one per real lender). */
  async getOffers(partner: LenderPartner, application: LoanApplication): Promise<RawLenderOffer[]> {
    // No mock/sample short-circuit and no offer caching: every prequalify makes a
    // fresh eligible_offers call to Aurix (the prequalify route also deletes the
    // application's prior offers before this runs, so nothing stale is reused).
    const cfg = resolveAurixConfig(partner);
    if (!cfg.audienceSecretCode) {
      throw new Error('Aurix is not configured (AURIX_AUDIENCE_SECRET_CODE missing)');
    }

    const user = await prisma.user.findUnique({ where: { id: application.userId } });
    if (!user) throw new Error(`Aurix offers: user ${application.userId} not found`);

    // Prefer the token cached at OTP verify; refresh if missing/expired.
    const token = await ensureAurixToken(cfg, user);

    // Best-effort UTM registration — only when a valid UTMSource is configured
    // (Aurix rejects unknown sources with "Invalid UTMSource"; offers work
    // without it). Set AURIX_UTM_SOURCE once Aurix confirms accepted values.
    if (cfg.utmSource) await registerAurixUtm(cfg, application.userId, user.phone);

    // Real PanVerificationDTO from the PAN Comprehensive result (DB only —
    // never re-calls the paid PAN API here).
    const pan = application.panNumber || user.panNumber || '';
    const panVerification = pan ? await getPanVerificationForOffers(pan) : null;
    const payload = buildEligibleOffersPayload(user, application, panVerification);
    // Full request/response logging for integration analysis (PAN masked).
    const maskedPayload = JSON.stringify(payload).replace(/("Pan(?:Number)?":")[A-Z0-9]{6}/g, '$1******');
    console.log(`[aurix-req] POST ${cfg.offersBaseUrl}/api/eligible_offers user=${application.userId} app=${application.id} payload=${maskedPayload}`);
    // eligible_offers is a real bureau/BRE call and can be slow — allow 30s
    // rather than the default 15s so a legitimately slow decision doesn't time out.
    const result = await httpJson(
      `${cfg.offersBaseUrl}/api/eligible_offers`,
      'POST',
      // v1.2 headers: K-Aurix-Token + K-Aurix-PartnerCustomerId. X-Aurix-Token
      // kept for backward-compat with the currently-deployed UAT gateway.
      // K-Aurix-Version MUST be v3 to match the token minted by generate_token —
      // v1 here caused eligible_offers to reject the (valid) token with HTTP 401
      // (confirmed against Aurix's own Postman collection).
      {
        Accept: 'application/json',
        'K-Aurix-Version': 'v3',
        'K-Aurix-Token': token,
        'X-Aurix-Token': token,
        'K-Aurix-PartnerCustomerId': application.userId,
      },
      payload,
      30_000,
    );
    console.log(`[aurix-res] HTTP ${result.status} body=${JSON.stringify(result.body)}`);
    // Stash the raw Aurix response so the app can surface it (debug alert).
    aurixDebugByApp.set(application.id, { httpStatus: result.status, response: result.body });
    if (!result.ok) throw new Error(`Aurix eligible_offers failed: ${result.error} (HTTP ${result.status})`);

    // Aurix's response is inconsistent: sometimes wrapped as { Result: { Data,
    // Meta }, Id, ... } and sometimes returned bare as { Data, Meta }. Handle
    // both so offers are never missed on the un-wrapped shape.
    const root = result.body?.Result ?? result.body;
    const meta = root?.Meta;
    const success = meta?.Success === true;
    const offers: AurixOfferRaw[] = root?.Data?.Offers ?? [];
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

/**
 * Aurix "Fetch Lead API" (KFT doc v1.1, 10 Sep 2026) — pulls the live
 * status of a lead/application/offer on demand, for the app's "Refresh
 * status" button. UAT ONLY: Aurix has only confirmed this endpoint on their
 * UAT gateway so far, so the base URL is hardcoded/env-overridable here
 * rather than reusing AURIX_OFFERS_BASE_URL (which some environments already
 * point at Aurix's real gateway for eligible_offers) — this must never
 * silently start hitting prod just because that var changes.
 *
 * Auth: the doc's own header set (K-Aurix-Version: v1, AUTHTOKEN: <token>)
 * was tried first and got a clean 401 from UAT even with a token that had
 * just minted fine; switching to v3 alone still 401'd. Both the base URL and
 * K-Aurix-Version in this doc have already turned out to not match live
 * behavior, so this instead sends the EXACT header set proven to work for
 * eligible_offers on this same account (K-Aurix-Token + X-Aurix-Token +
 * K-Aurix-PartnerCustomerId, K-Aurix-Version v3) — AUTHTOKEN is kept
 * alongside it for doc-compliance, in case the gateway checks that too.
 *
 * The success response's record shape (`data: [{...}]`) is undocumented
 * beyond that it's an array — callers should log the raw record and treat
 * status extraction as best-effort until a real UAT response is seen.
 */
const AURIX_FETCH_LEADS_BASE_URL = process.env.AURIX_FETCH_LEADS_BASE_URL || 'https://pt-api-uat.aurix-partner.com';

export interface FetchLeadsIdentifiers {
  partnerCustomerId?: string | null;
  applicationId?: string | null; // Aurix "Lead ID"
  offerCode?: string | null;
  // Despite the doc's Business Rules saying "all filters are optional", a live
  // UAT call without it gets HTTP 400 "ProductType is required." — but the
  // doc's own field name ("productType") never actually bound: Aurix
  // confirmed the real wire key is "loanType" (the validation error names the
  // C#-side property, ProductType, which apparently carries a
  // [JsonPropertyName("loanType")] the doc never mentioned). Confirmed live:
  // sending "loanType" gets a real 200 instead of the validation error.
  productType?: string | null;
}

export interface FetchLeadsResult {
  success: boolean;
  message?: string;
  totalRecords?: number;
  records: Record<string, unknown>[];
}

export async function fetchAurixLeads(ids: FetchLeadsIdentifiers, token: string): Promise<FetchLeadsResult> {
  // Confirmed live (2026-09-22): camelCase identifiers + "loanType" (not
  // "productType"/"ProductType") + PascalCase pagination is the shape that
  // actually gets a 200 instead of "ProductType is required." Mixed casing
  // looks odd but matches the real, working request exactly.
  const body = {
    partnerCustomerId: ids.partnerCustomerId ?? '',
    applicationId: ids.applicationId ?? '',
    offerCode: ids.offerCode ?? '',
    loanType: ids.productType ?? '',
    PageNumber: 1,
    PageSize: 10,
  };
  console.log(`[aurix-req] POST ${AURIX_FETCH_LEADS_BASE_URL}/api/fetch_leads ${JSON.stringify(body)}`);
  const result = await httpJson(
    `${AURIX_FETCH_LEADS_BASE_URL}/api/fetch_leads`,
    'POST',
    {
      Accept: 'application/json',
      'K-Aurix-Version': 'v3',
      AUTHTOKEN: token,
      'K-Aurix-Token': token,
      'X-Aurix-Token': token,
      ...(ids.partnerCustomerId ? { 'K-Aurix-PartnerCustomerId': ids.partnerCustomerId } : {}),
    },
    body,
  );
  console.log(`[aurix-res] fetch_leads HTTP ${result.status} body=${JSON.stringify(result.body)}`);
  if (!result.ok) throw new Error(`Aurix fetch_leads failed: ${result.error} (HTTP ${result.status})`);
  const b = (result.body ?? {}) as Record<string, unknown>;
  return {
    success: b.success !== false,
    message: typeof b.message === 'string' ? b.message : undefined,
    totalRecords: typeof b.totalRecords === 'number' ? b.totalRecords : undefined,
    records: Array.isArray(b.data) ? (b.data as Record<string, unknown>[]) : [],
  };
}

const PROVIDERS: Record<string, LenderOfferProvider> = {
  mock: new MockLenderOfferProvider(),
  aurix: new AurixOfferProvider(),
};

/**
 * LENDER_PROVIDER (env) is the authority on which adapter runs — e.g.
 * "aurix" or "mock" — so switching the whole app between real and mock
 * offers is a deploy-time env change, not a per-row DB edit that a reseed
 * could silently undo. Falls back to the partner's own `provider` column
 * when the env var isn't set, so existing per-partner rows keep working.
 */
export function getLenderOfferProvider(partner: LenderPartner): LenderOfferProvider {
  const key = process.env.LENDER_PROVIDER || partner.provider;
  const provider = PROVIDERS[key];
  if (!provider) {
    throw new Error(`Lender provider "${key}" is not implemented yet (partner: ${partner.name})`);
  }
  return provider;
}
