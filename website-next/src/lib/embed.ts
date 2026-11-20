/**
 * Is this page being shown INSIDE the SwiftLoan mobile app (its WebView), not in a browser?
 *
 * The app shows some website pages itself (the Privacy Policy in its legal viewer) and draws
 * its own native header and its own native Ruby over them. In that case the website must not
 * add things that only make sense in a browser:
 *   - no ads-measurement consent banner, and no Meta Pixel at all (the app is not the place to
 *     ask for website ad consent; with no answer the Pixel stays off, the private default);
 *   - no second Ruby under the app's own.
 *
 * The signal (either one):
 *   1. the page was opened with `?embed=app` — e.g. https://swiftloan.ai/privacy-policy?embed=app.
 *      It is remembered for the rest of the tab (sessionStorage `sl_embed`), so links followed
 *      inside the WebView stay embedded without carrying the parameter.
 *   2. `window.ReactNativeWebView` exists — react-native-webview adds it by itself, but only
 *      when the app's <WebView> has an `onMessage` handler.
 *
 * Client only: on the server (and in the first, hydrating render) the answer is `false`.
 */
export const EMBED_PARAM = 'embed';
export const EMBED_APP_VALUE = 'app';
export const EMBED_STORAGE_KEY = 'sl_embed';

export function isEmbeddedInApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if ((window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView) return true;
  } catch {
    /* fall through */
  }
  let fromUrl = false;
  try {
    fromUrl = new URLSearchParams(window.location.search).get(EMBED_PARAM) === EMBED_APP_VALUE;
  } catch {
    /* fall through */
  }
  try {
    if (fromUrl) window.sessionStorage.setItem(EMBED_STORAGE_KEY, EMBED_APP_VALUE);
    else if (window.sessionStorage.getItem(EMBED_STORAGE_KEY) === EMBED_APP_VALUE) return true;
  } catch {
    /* storage blocked: only the URL of this very page counts */
  }
  return fromUrl;
}
