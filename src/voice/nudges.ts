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
export function snoozeNudges(ms: number = NUDGE_SNOOZE_MS): void {
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

/** Admin settings fetched from the backend. Only `enabled` (the on/off switch) is
 *  still honoured; the three timers are kept for the DTO but no longer drive the
 *  schedule — start/rotate timing is hard-coded above. */
export interface NudgeTimers {
  enabled: boolean;
  idleMs: number;
  dropoffMs: number;
  eligibleMs: number;
}
export const DEFAULT_TIMERS: NudgeTimers = { enabled: true, idleMs: 30000, dropoffMs: 18000, eligibleMs: 20000 };

// Application funnel — a stall here usually means the user is stuck/confused.
const FUNNEL = new Set<Screen>(['basicpan', 'basic', 'moredetails']);
// Offers surfaces — eligibility done, but they haven't picked/applied to a lender.
const OFFERS = new Set<Screen>(['offers', 'fare', 'compare']);
// Before login: the sign-in flow. 'splash' (auto-advances) and 'privacy' (the user
// accepts the terms on their own; Ruby is hidden there) get no tip.
const PRE_LOGIN = new Set<Screen>(['language', 'intro', 'mobile', 'otp']);

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

/** Tips for a screen in the user's language, or null when nudging is off / the
 *  screen gets none. */
export function nudgeFor(
  screen: Screen,
  timers: NudgeTimers = DEFAULT_TIMERS,
  loggedIn = false,
  lang: string | null = null,
): NudgeConfig | null {
  if (!timers.enabled) return null;
  if (screen === 'splash' || screen === 'privacy') return null;
  const l = nudgeLang(lang);
  if (FUNNEL.has(screen)) return { reason: 'dropoff_apply', labels: FUNNEL_TIPS[l] };
  if (OFFERS.has(screen)) return { reason: 'eligible_no_apply', labels: OFFERS_TIPS[l] };
  if (!loggedIn && PRE_LOGIN.has(screen)) return { reason: 'idle_prelogin', labels: GENERAL_TIPS[l] };
  // Every other screen is after login (including permissions, which follows OTP).
  if (loggedIn) return { reason: 'idle', labels: GENERAL_TIPS[l] };
  return null;
}
