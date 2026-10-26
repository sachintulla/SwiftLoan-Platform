import type { Screen } from '../state/store';

/**
 * Proactive-help tips shown in a bubble above the Ruby button (see App.tsx
 * scheduler + VoiceWidget). Timing is hard-coded, not admin-tuned:
 *   - the bubble appears NUDGE_START_MS after the user lands on a screen, whether
 *     or not they touch anything in between;
 *   - it then cycles through the screen's tips every NUDGE_ROTATE_MS and stays up
 *     (it is not auto-hidden) until the screen changes or a voice call starts.
 * The tip text is hard-coded too: one set before login, one set after.
 */
export const NUDGE_START_MS = 5_000;
export const NUDGE_ROTATE_MS = 3_000;
/** After the user closes the bubble with its ✕, tips stay away this long and then
 *  come back (on whichever screen they are on). In-memory only: an app restart
 *  clears it. */
export const NUDGE_SNOOZE_MS = 10 * 60_000;

let snoozeUntil = 0;
let wakeTimer: ReturnType<typeof setTimeout> | undefined;
const wakeListeners = new Set<() => void>();

/** Hide tips for `ms`, then tell the scheduler (via onNudgeWake) to show one again. */
export function snoozeNudges(ms: number = nudgeSnoozeMs()): void {
  snoozeUntil = Date.now() + ms;
  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = setTimeout(() => wakeListeners.forEach((l) => l()), ms);
}
/** Milliseconds of snooze left (0 when tips are allowed). */
export function nudgeSnoozeRemaining(): number {
  return Math.max(0, snoozeUntil - Date.now());
}
/** Subscribe to the end of a snooze; returns the unsubscribe. */
export function onNudgeWake(listener: () => void): () => void {
  wakeListeners.add(listener);
  return () => { wakeListeners.delete(listener); };
}

export interface NudgeConfig {
  reason: string;
  labels: string[];
}

/** Admin settings fetched from the backend (Admin → App config). `enabled` is the on/off switch; `startMs`, `rotateMs`
 *  and `snoozeMs` set the three timings above (a server that predates them omits them, so the built-ins apply).
 *  `idleMs`, `dropoffMs` and `eligibleMs` are legacy: kept in the DTO but they have never driven the schedule. */
export interface NudgeTimers {
  enabled: boolean;
  idleMs: number;
  dropoffMs: number;
  eligibleMs: number;
  startMs?: number;
  rotateMs?: number;
  snoozeMs?: number;
}
export const DEFAULT_TIMERS: NudgeTimers = {
  enabled: true, idleMs: 30000, dropoffMs: 18000, eligibleMs: 20000,
  startMs: NUDGE_START_MS, rotateMs: NUDGE_ROTATE_MS, snoozeMs: NUDGE_SNOOZE_MS,
};

// The timings currently in force (the last config the app fetched or restored from storage).
let live: NudgeTimers = DEFAULT_TIMERS;
export function setLiveNudgeTimers(t: NudgeTimers): void { live = t; }
const positive = (n: number | undefined, fallback: number) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : fallback);
/** How long after a screen opens the bubble appears. */
export const nudgeStartMs = (): number => positive(live.startMs, NUDGE_START_MS);
/** How long each line shows before the bubble rotates to the next. */
export const nudgeRotateMs = (): number => positive(live.rotateMs, NUDGE_ROTATE_MS);
/** Quiet period after the user dismisses the bubble. */
export const nudgeSnoozeMs = (): number => positive(live.snoozeMs, NUDGE_SNOOZE_MS);

// Application funnel — a stall here usually means the user is stuck/confused.
const FUNNEL = new Set<Screen>(['basicpan', 'basic', 'moredetails']);
// Offers surfaces — eligibility done, but they haven't picked/applied to a lender.
const OFFERS = new Set<Screen>(['offers', 'fare', 'compare']);
// Before login: the sign-in flow. 'splash' (auto-advances) and 'privacy' (the user
// accepts the terms on their own; Ruby is hidden there) get no tip.
const PRE_LOGIN = new Set<Screen>(['mobile', 'otp']);

/** Tip language: the app language the user picked. Hinglish/Tenglish (and no
 *  choice yet) use the English tips, same fallback as the UI strings. */
export type NudgeLang = 'en' | 'hi' | 'te';
export function nudgeLang(lang: string | null | undefined): NudgeLang {
  return lang === 'hi' || lang === 'te' ? lang : 'en';
}

// One general set for every screen, before and after login.
const GENERAL_TIPS: Record<NudgeLang, string[]> = {
  en: [
    "Need any help? I'm right here.",
    'Have a question? Tap to ask me.',
    'Just tap me and speak, I will guide you.',
    'Tap me and tell me what you need.',
  ],
  hi: [
    'कोई मदद चाहिए? मैं यहीं हूँ।',
    'कोई सवाल है? मुझसे पूछने के लिए टैप करें।',
    'बस मुझे टैप करें और बोलें, मैं आपको राह दिखाऊँगी।',
    'मुझे टैप करें और बताएं आपको क्या चाहिए।',
  ],
  te: [
    'సహాయం కావాలా? నేను ఇక్కడే ఉన్నాను.',
    'సందేహం ఉందా? నన్ను అడగండి.',
    'నన్ను ట్యాప్ చేసి మాట్లాడండి, నేను గైడ్ చేస్తాను.',
    'మీకు ఏం కావాలో నాకు చెప్పండి.',
  ],
};
const FUNNEL_TIPS: Record<NudgeLang, string[]> = {
  en: [
    'Stuck here? I can help you finish.',
    'Confused about a field? Just ask me.',
    'Need help with your application?',
  ],
  hi: [
    'यहाँ अटक गए? मैं पूरा करने में मदद करूँगी।',
    'फ़ील्ड को लेकर उलझन है? मुझसे पूछें।',
    'आवेदन में मदद चाहिए?',
  ],
  te: [
    'ఇక్కడ ఆగిపోయారా? నేను సహాయం చేస్తాను.',
    'ఫీల్డ్‌పై సందేహమా? నన్ను అడగండి.',
    'మీ దరఖాస్తుకు సహాయం కావాలా?',
  ],
};
const OFFERS_TIPS: Record<NudgeLang, string[]> = {
  en: [
    'Want help choosing the best offer?',
    'Not sure which offer fits? Ask me.',
    'Have questions about these offers?',
  ],
  hi: [
    'सबसे अच्छा ऑफ़र चुनने में मदद चाहिए?',
    'कौन सा ऑफ़र सही है? मुझसे पूछें।',
    'इन ऑफ़र्स के बारे में कोई सवाल है?',
  ],
  te: [
    'సరైన ఆఫర్ ఎంచుకోవడంలో సహాయం కావాలా?',
    'ఏ ఆఫర్ సరిపోతుందో తెలియదా? నన్ను అడగండి.',
    'ఈ ఆఫర్ల గురించి ఏదైనా ప్రశ్న ఉందా?',
  ],
};
// Applied, but this run returned no matched offers — point to what's next
// (re-check, change details, or explore more lenders) instead of "pick an offer".
const NO_OFFERS_TIPS: Record<NudgeLang, string[]> = {
  en: [
    'No offers this time — I can help you re-check.',
    'Want to tweak your details for better offers?',
    'I can show you more lenders to explore.',
  ],
  hi: [
    'इस बार कोई ऑफ़र नहीं — मैं दोबारा जाँचने में मदद करूँगी।',
    'बेहतर ऑफ़र के लिए अपनी जानकारी बदलें?',
    'मैं और लेंडर दिखा सकती हूँ जिन्हें आप देख सकते हैं।',
  ],
  te: [
    'ఈసారి ఆఫర్లు లేవు — మళ్ళీ చెక్ చేయడంలో సహాయం చేస్తాను.',
    'మంచి ఆఫర్ల కోసం మీ వివరాలు మార్చాలా?',
    'మరిన్ని లెండర్లను చూపించగలను.',
  ],
};

/** Extra signals from the live screen that make a tip fit the actual situation
 *  (e.g. "applied but no offers") rather than a generic screen-level tip. */
export interface NudgeContext {
  /** On an offers surface, the last eligibility run returned nothing to show. */
  noOffers?: boolean;
}

/** Tips for a screen in the user's language, or null when nudging is off / the
 *  screen gets none. */
export function nudgeFor(
  screen: Screen,
  timers: NudgeTimers = DEFAULT_TIMERS,
  loggedIn = false,
  lang: string | null = null,
  ctx: NudgeContext = {},
): NudgeConfig | null {
  if (!timers.enabled) return null;
  if (screen === 'splash' || screen === 'privacy') return null;
  const l = nudgeLang(lang);
  if (FUNNEL.has(screen)) return { reason: 'dropoff_apply', labels: FUNNEL_TIPS[l] };
  if (OFFERS.has(screen)) {
    // Applied-but-empty gets its own, more useful set of tips.
    return ctx.noOffers
      ? { reason: 'eligible_no_offers', labels: NO_OFFERS_TIPS[l] }
      : { reason: 'eligible_no_apply', labels: OFFERS_TIPS[l] };
  }
  if (!loggedIn && PRE_LOGIN.has(screen)) return { reason: 'idle_prelogin', labels: GENERAL_TIPS[l] };
  // Every other screen is after login (including permissions, which follows OTP).
  if (loggedIn) return { reason: 'idle', labels: GENERAL_TIPS[l] };
  return null;
}
