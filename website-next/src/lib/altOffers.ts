/**
 * Website client for the alternative-offers (Yubi / YMPL) facility — the SAME
 * endpoints the mobile app uses (server/src/modules/applications.routes.ts
 * `/:id/alt-offer`, `/:id/alt-offer/applied`; config.routes.ts `/features`).
 * Nothing new server-side. Revasure needs no client call at all: the server fires
 * its Create-Lead inside POST /applications/:id/prequalify, which the website's
 * /apply/finding page already calls.
 */
import { apiBase } from './leads';
import { authFetch } from './session';

export interface AltOfferResult {
  available: boolean;
  provider: string;
  status: string;
  redirectUrl: string | null;
  resumeToOffers?: boolean;
  journeyStatus?: string | null;
}

let featuresPromise: Promise<boolean> | null = null;

/** GET /api/config/features → altOffers. Public + cached per page load; any failure means "off". */
export function fetchAltOffersEnabled(): Promise<boolean> {
  if (!featuresPromise) {
    featuresPromise = (async () => {
      try {
        const base = apiBase();
        if (!base) return false;
        const res = await fetch(`${base}/api/config/features`);
        if (!res.ok) return false;
        const body = await res.json().catch(() => ({}));
        return body?.data?.altOffers === true;
      } catch {
        return false;
      }
    })();
  }
  return featuresPromise;
}

/** Test seam: forget the cached flag. */
export function resetAltOffersFeatureCache() {
  featuresPromise = null;
}

/** Mint a fresh partner redirect URL (tokens last ~90s). Always resolves with `available`; throws only on network/auth errors. */
export async function requestAltOffer(applicationId: string): Promise<AltOfferResult> {
  const body = await authFetch(`/api/applications/${applicationId}/alt-offer`, { method: 'POST' });
  return body.altOffer as AltOfferResult;
}

/** Record that the applicant proceeded on the partner's offers page → surfaces in My Applications. */
export async function markAltOfferApplied(applicationId: string, lender?: string) {
  const body = await authFetch(`/api/applications/${applicationId}/alt-offer/applied`, {
    method: 'POST',
    body: JSON.stringify(lender ? { lender } : {}),
  });
  return body as { applied: boolean; appliedAt: string | null; lender: string | null };
}
