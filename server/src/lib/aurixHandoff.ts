/**
 * Aurix (Knight Fintech) lender-page hand-off without a second OTP.
 *
 * Each Aurix offer carries an OfferRedirectionUrl (https://pt.aurix-partner.com/?offer_code=…&utm_code=…). Opened as is,
 * Aurix's page asks the customer for their mobile number and an OTP again, although they already verified with us.
 * Aurix's page also reads an `authtoken` query parameter (seen in its web bundle: `searchParams.get("authtoken")`,
 * case-insensitive): it is the customer's X-Aurix-Token from `/api/generate_token` (PartnerCustomerID = our User.id),
 * and with it the page skips the mobile/OTP screen and goes straight to the application. A token it rejects falls back
 * to its own OTP screen ("Invalid Session"), and the page strips the parameter from the address bar after reading it.
 *
 * The token is added only at the moment the customer taps Apply (applications.routes.ts), to the copy of the link
 * returned to that customer. It is never stored: Offer.redirectionUrl and LenderApplication.redirectionUrl keep the
 * plain link, and API logs already redact `redirectionUrl` (lib/apiLog.ts).
 */

/** Only Aurix's own pages get the token (never another lender's link, even if Aurix returned it). */
export function isAurixPartnerUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'aurix-partner.com' || u.hostname.endsWith('.aurix-partner.com'));
  } catch {
    return false;
  }
}

/**
 * The link with `authtoken=<token>` set (replacing any existing authtoken, whatever its case). Returns the link
 * unchanged when it is not an Aurix page or there is no token, so the customer simply gets Aurix's OTP screen.
 */
export function withAurixAuthToken(url: string | null | undefined, token: string | null | undefined): string | null {
  if (!url) return url ?? null;
  if (!token || !isAurixPartnerUrl(url)) return url;
  const u = new URL(url);
  for (const k of [...u.searchParams.keys()]) if (k.toLowerCase() === 'authtoken') u.searchParams.delete(k);
  u.searchParams.set('authtoken', token);
  return u.toString();
}
