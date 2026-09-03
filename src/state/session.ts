import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKENS_KEY = 'swiftloan.session.tokens';
const LANG_KEY = 'swiftloan.session.lang';
const VOICE_LANG_KEY = 'swiftloan.session.voiceLang';
const VOICE_FAB_SIDE_KEY = 'swiftloan.session.voiceFabSide';
const OFFERS_CACHE_KEY = 'swiftloan.offers.cache';
const PREFILL_DRAFT_KEY = 'swiftloan.applicant.prefillDraft';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

/** Persists across app restarts — lets a returning user skip onboarding entirely. */
export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await AsyncStorage.setItem(TOKENS_KEY, JSON.stringify(tokens)).catch(() => {});
}

export async function loadTokens(): Promise<StoredTokens | null> {
  const raw = await AsyncStorage.getItem(TOKENS_KEY).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  await AsyncStorage.removeItem(TOKENS_KEY).catch(() => {});
}

/**
 * The language choice itself persists independently of login — a guest who
 * picks Telugu and never logs in should still get Telugu next time, and this
 * is also what the voice agent's `preferred_language` (the app's own
 * screen-text language, not what the agent speaks — see `saveVoiceLang`
 * below) reads from on every fresh app launch, not just within one session's
 * memory.
 */
export async function saveLang(lang: string): Promise<void> {
  await AsyncStorage.setItem(LANG_KEY, lang).catch(() => {});
}

export async function loadLang(): Promise<string | null> {
  return AsyncStorage.getItem(LANG_KEY).catch(() => null);
}

/**
 * The language the user has spoken to the voice agent — distinct from
 * `lang`/`saveLang` above, which is the app's UI-copy language. Set only via
 * the agent's `set_language` voice tool; the page_context `agent_language`
 * field (what the agent actually speaks) falls back to `lang` until this is
 * set.
 */
export async function saveVoiceLang(lang: string): Promise<void> {
  await AsyncStorage.setItem(VOICE_LANG_KEY, lang).catch(() => {});
}

export async function loadVoiceLang(): Promise<string | null> {
  return AsyncStorage.getItem(VOICE_LANG_KEY).catch(() => null);
}

/** Whether the user has accepted the Privacy Policy — shown once, at first launch. */
const PRIVACY_KEY = 'swiftloan.session.privacyAccepted';
export async function savePrivacyAccepted(): Promise<void> {
  await AsyncStorage.setItem(PRIVACY_KEY, '1').catch(() => {});
}
export async function loadPrivacyAccepted(): Promise<boolean> {
  return (await AsyncStorage.getItem(PRIVACY_KEY).catch(() => null)) === '1';
}

/** Which screen edge the voice FAB is docked to — the user drags it once and it stays there. */
export async function saveVoiceFabSide(side: 'left' | 'right'): Promise<void> {
  await AsyncStorage.setItem(VOICE_FAB_SIDE_KEY, side).catch(() => {});
}

export async function loadVoiceFabSide(): Promise<'left' | 'right' | null> {
  const raw = await AsyncStorage.getItem(VOICE_FAB_SIDE_KEY).catch(() => null);
  return raw === 'left' || raw === 'right' ? raw : null;
}

/**
 * Locally-cached "My Offers" so the tab shows the user's saved eligible offers
 * instantly (and offline) on open, before/without a network round-trip. Refreshed
 * whenever a fresh prequalify/list returns offers. `offers` is stored as-is (the
 * api Offer shape); kept loosely typed here to avoid a cross-import.
 */
export interface OffersCache {
  applicationId: string | null;
  savedAt: number; // epoch ms
  offers: unknown[];
}

export async function saveOffersCache(cache: OffersCache): Promise<void> {
  await AsyncStorage.setItem(OFFERS_CACHE_KEY, JSON.stringify(cache)).catch(() => {});
}

export async function loadOffersCache(): Promise<OffersCache | null> {
  const raw = await AsyncStorage.getItem(OFFERS_CACHE_KEY).catch(() => null);
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as OffersCache;
    return Array.isArray(c?.offers) ? c : null;
  } catch {
    return null;
  }
}

export async function clearOffersCache(): Promise<void> {
  await AsyncStorage.removeItem(OFFERS_CACHE_KEY).catch(() => {});
}

/**
 * Free-form applicant details the voice agent gathers conversationally from a
 * first-time caller (no history yet) BEFORE they've reached the application
 * form — see the prompt's "Proactive Details Collection" rule. Deliberately
 * not a fixed schema: whatever keys the model used (fullName, dob, gender,
 * ...) are stored as-is and read back verbatim into a later call's
 * page_context, where the agent matches them against whatever's actually on
 * screen at the time. Persisted so this survives the call ending — the whole
 * point is a LATER call (even a different day) can reuse it instead of
 * asking everything again.
 */
export async function savePrefillDraft(details: Record<string, unknown>): Promise<void> {
  await AsyncStorage.setItem(PREFILL_DRAFT_KEY, JSON.stringify(details)).catch(() => {});
}

export async function loadPrefillDraft(): Promise<Record<string, unknown> | null> {
  const raw = await AsyncStorage.getItem(PREFILL_DRAFT_KEY).catch(() => null);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    return d && typeof d === 'object' && !Array.isArray(d) ? d : null;
  } catch {
    return null;
  }
}

// Cleared on login/logout (api/client.ts) so it never leaks across accounts
// on a shared device — the same reasoning clearOffersCache above already
// follows for "My Offers".
export async function clearPrefillDraft(): Promise<void> {
  await AsyncStorage.removeItem(PREFILL_DRAFT_KEY).catch(() => {});
}

// ── Market (available) loan offers catalog cache ─────────────────────────────
// The home "Available offers" list rarely changes, so we cache it locally after
// the first fetch and reuse it (cache-first) to avoid repeated cloud calls.
const MARKET_OFFERS_KEY = 'swiftloan.market.offers.cache';

export interface MarketOffersCache {
  savedAt: number; // epoch ms
  offers: unknown[];
}

export async function saveMarketOffersCache(cache: MarketOffersCache): Promise<void> {
  await AsyncStorage.setItem(MARKET_OFFERS_KEY, JSON.stringify(cache)).catch(() => {});
}

export async function loadMarketOffersCache(): Promise<MarketOffersCache | null> {
  const raw = await AsyncStorage.getItem(MARKET_OFFERS_KEY).catch(() => null);
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as MarketOffersCache;
    return Array.isArray(c?.offers) ? c : null;
  } catch {
    return null;
  }
}

// ── Admin-tuned nudge timers cache ───────────────────────────────────────────
// Cached so the idle detector uses the last-known config instantly on launch
// (before the network fetch returns), and offline.
const NUDGE_TIMERS_KEY = 'swiftloan.nudge.timers';

export async function saveNudgeTimers(timers: unknown): Promise<void> {
  await AsyncStorage.setItem(NUDGE_TIMERS_KEY, JSON.stringify(timers)).catch(() => {});
}

export async function loadNudgeTimers<T>(): Promise<T | null> {
  const raw = await AsyncStorage.getItem(NUDGE_TIMERS_KEY).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
