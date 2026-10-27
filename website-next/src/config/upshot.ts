/**
 * Upshot identifiers for the WEBSITE.
 *
 * The website is its own app in the Upshot console (separate from the mobile
 * "Swiftloan" / "Swiftloan_prod" apps), so web traffic has its own dashboard,
 * campaigns and segments. All three values are public client identifiers (the
 * browser SDK sends them with every request), not secrets — same as the mobile
 * app, which hard-codes its own pair in `src/analytics/upshot.ts`.
 *
 *   App SDK ID  -> UpshotApplicationID        (this website app)
 *   Account ID  -> UpshotApplicationOwnerID   (the SDK's "Owner ID"; the same
 *                                              account the mobile apps live in)
 *   Enterprise ID                              NOT an SDK init value — the Web SDK
 *                                              has no such parameter. It belongs to
 *                                              Upshot's server-side Enterprise Access
 *                                              API; kept here so it isn't lost.
 *
 * `NEXT_PUBLIC_UPSHOT_*` overrides each one at build time (e.g. to point a
 * staging build at a separate Upshot app).
 */
export const UPSHOT_APP_ID =
  process.env.NEXT_PUBLIC_UPSHOT_APP_ID || '18a089e8-0a20-4510-bb98-2fdb49b7e271';

export const UPSHOT_OWNER_ID =
  process.env.NEXT_PUBLIC_UPSHOT_OWNER_ID || '6cfe2c70-4130-46d5-9202-54252d38e57f';

/** Server-side only (Enterprise Access API). Never passed to the browser SDK. */
export const UPSHOT_ENTERPRISE_ID = '029baddc-eed8-4099-9d51-b4e243fed4d1';

/**
 * Kill switch: `NEXT_PUBLIC_UPSHOT_DISABLED=true` stops the SDK from loading at
 * all (useful for a build that must not report, or when debugging a page).
 */
export const UPSHOT_DISABLED = process.env.NEXT_PUBLIC_UPSHOT_DISABLED === 'true';

export const UPSHOT_SDK_URL =
  process.env.NEXT_PUBLIC_UPSHOT_SDK_URL || 'https://cdn.goupshot.com/UpshotWebSDK/v1.4/upshot.min.js';

/**
 * Optional region prefix. Left empty on purpose: v1.4 of the SDK only accepts
 * "usa" here, and the region its data actually goes to is returned by Upshot's
 * own init response (`endPoints`), so an Indian account is routed without help.
 */
export const UPSHOT_DATA_REGION = process.env.NEXT_PUBLIC_UPSHOT_DATA_REGION || '';

/**
 * Web push switch. Off until the Upshot web app has its Firebase sender id / key saved (Push Settings > Web)
 * and `public/upshot-service-worker.js` is Upshot's own file. Turning it on makes the site ask visitors for
 * notification permission at the OTP steps (`lib/webPush.ts`).
 */
export const UPSHOT_WEB_PUSH_ENABLED = process.env.NEXT_PUBLIC_UPSHOT_WEB_PUSH === 'true';
