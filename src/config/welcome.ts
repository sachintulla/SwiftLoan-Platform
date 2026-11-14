import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Welcome-intro assets are served from a CDN, not bundled in the app binary.
// This keeps the (~8 MB) transparent GIF + its voice-over out of the APK/IPA.
//
// Set WELCOME_CDN_BASE to the public origin that hosts the two files, with NO
// trailing slash, e.g. 'https://dxxxxxxxx.cloudfront.net/welcome'. The files
// must be reachable at:
//     <base>/ruby-welcome-<version>.gif
//     <base>/ruby-welcome-<version>.m4a
// (the masters live in the repo at assets/video/ — upload those). Give them a
// long Cache-Control max-age so the WebView caches them after the first load.
//
// Empty = feature OFF: the intro never plays and nothing is downloaded. The
// app works normally without it.
// ---------------------------------------------------------------------------
// The public prod bucket folder (files uploaded 2026-10-30, public-read, Cache-Control immutable; byte-identical to
// assets/video/ruby-welcome-transparent.gif + ruby-welcome.m4a). To change the clip, upload new -v2 files and bump
// WELCOME_ASSET_VERSION below — never overwrite v1 (phones cache it for a year).
export const WELCOME_CDN_BASE = 'https://swiftloan-prod.s3.ap-south-1.amazonaws.com/welcome';
export const WELCOME_ASSET_VERSION = 'v1';

export const welcomeConfigured = (): boolean => WELCOME_CDN_BASE.trim().length > 0;
export const welcomeGifUrl = (): string => `${WELCOME_CDN_BASE}/ruby-welcome-${WELCOME_ASSET_VERSION}.gif`;
export const welcomeAudioUrl = (): string => `${WELCOME_CDN_BASE}/ruby-welcome-${WELCOME_ASSET_VERSION}.m4a`;

// "Ready" = the assets have been fetched into the WebView cache at least once,
// so the intro can play instantly (and offline) from here on. Until then we skip
// the intro and prefetch in the background (see WelcomePrefetch), showing it only
// from the next launch. Mirrored in a module-level flag so the login reducer can
// read it synchronously.
const READY_KEY = `swiftloan.welcome.cdnReady.${WELCOME_ASSET_VERSION}`; // per version: a new clip is fetched again
let readyCache = false;

/** Synchronous check used where a call can't await (e.g. the OTP-verify reducer). */
export const isWelcomeReady = (): boolean => welcomeConfigured() && readyCache;

/** Load the persisted ready flag into the sync mirror. Call once on boot. */
export async function loadWelcomeReady(): Promise<boolean> {
  if (!welcomeConfigured()) { readyCache = false; return false; }
  readyCache = (await AsyncStorage.getItem(READY_KEY).catch(() => null)) === '1';
  return readyCache;
}

/** Mark the assets cached (after a successful prefetch / first play). */
export async function markWelcomeReady(): Promise<void> {
  readyCache = true;
  await AsyncStorage.setItem(READY_KEY, '1').catch(() => {});
}

// Populate the sync mirror as early as possible (fire-and-forget); a boot effect
// also calls loadWelcomeReady() for certainty.
void loadWelcomeReady();
