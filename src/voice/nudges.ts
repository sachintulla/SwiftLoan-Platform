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

const PRE_LOGIN_TIPS = [
  'New here? I can help you get started.',
  "Need any help? I'm right here.",
  'Have a question? Tap to ask me.',
  'Just tap me and speak — I will guide you.',
];
const POST_LOGIN_TIPS = [
  'Any questions? Tap to ask me.',
  "Need any help? I'm right here.",
  'Let me help you — tap to ask.',
  'Tap me and tell me what you need.',
];

/** Tips for a screen, or null when nudging is off / the screen gets none. */
export function nudgeFor(screen: Screen, timers: NudgeTimers = DEFAULT_TIMERS, loggedIn = false): NudgeConfig | null {
  if (!timers.enabled) return null;
  if (screen === 'splash' || screen === 'privacy') return null;
  if (FUNNEL.has(screen)) {
    return {
      reason: 'dropoff_apply',
      labels: [
        'Stuck here? I can help you finish.',
        'Confused about a field? Just ask me.',
        'Need help with your application?',
      ],
    };
  }
  if (OFFERS.has(screen)) {
    return {
      reason: 'eligible_no_apply',
      labels: [
        'Want help choosing the best offer?',
        'Not sure which offer fits? Ask me.',
        'Have questions about these offers?',
      ],
    };
  }
  if (!loggedIn && PRE_LOGIN.has(screen)) return { reason: 'idle_prelogin', labels: PRE_LOGIN_TIPS };
  // Every other screen is after login (including permissions, which follows OTP).
  if (loggedIn) return { reason: 'idle', labels: POST_LOGIN_TIPS };
  return null;
}
