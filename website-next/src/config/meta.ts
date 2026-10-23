/**
 * Meta (Facebook) Pixel for the WEBSITE.
 *
 * The Pixel ID (Events Manager -> Data sources) is a public client identifier — the
 * browser sends it with every call — so it is safe in the bundle. It is deliberately
 * NOT hard-coded: until `NEXT_PUBLIC_META_PIXEL_ID` is set at build time the Pixel
 * never loads and the consent banner never appears, so the site behaves exactly as
 * before. The server-side twin (Conversions API) needs `META_PIXEL_ID` +
 * `META_CAPI_TOKEN` on the API server; see server/.env.example.
 *
 * Meta app id (mobile SDK), for reference: 1669156655221818 — NOT used on the web.
 */
export const META_PIXEL_ID = (process.env.NEXT_PUBLIC_META_PIXEL_ID || '').trim();

/** Kill switch: `NEXT_PUBLIC_META_DISABLED=true` stops the Pixel and the banner. */
export const META_DISABLED = process.env.NEXT_PUBLIC_META_DISABLED === 'true';

export const META_ENABLED = !!META_PIXEL_ID && !META_DISABLED;

export const META_SDK_URL = 'https://connect.facebook.net/en_US/fbevents.js';
