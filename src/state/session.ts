import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKENS_KEY = 'swiftloan.session.tokens';
const LANG_KEY = 'swiftloan.session.lang';
const VOICE_FAB_SIDE_KEY = 'swiftloan.session.voiceFabSide';

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
 * is also what the voice agent's `preferred_language` reads from on every
 * fresh app launch, not just within one session's memory.
 */
export async function saveLang(lang: string): Promise<void> {
  await AsyncStorage.setItem(LANG_KEY, lang).catch(() => {});
}

export async function loadLang(): Promise<string | null> {
  return AsyncStorage.getItem(LANG_KEY).catch(() => null);
}

/** Which screen edge the voice FAB is docked to — the user drags it once and it stays there. */
export async function saveVoiceFabSide(side: 'left' | 'right'): Promise<void> {
  await AsyncStorage.setItem(VOICE_FAB_SIDE_KEY, side).catch(() => {});
}

export async function loadVoiceFabSide(): Promise<'left' | 'right' | null> {
  const raw = await AsyncStorage.getItem(VOICE_FAB_SIDE_KEY).catch(() => null);
  return raw === 'left' || raw === 'right' ? raw : null;
}
