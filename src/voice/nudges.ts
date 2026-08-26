import type { Screen } from '../state/store';

/**
 * Proactive-help nudges: when the user stalls on a screen we vibrate, wiggle the
 * Ruby FAB and pop a contextual label (see App.tsx idle detector + VoiceWidget).
 * Each config gives the idle timeout, a tracking `reason`, and a few rotating
 * labels so the prompt feels dynamic rather than canned.
 */
export interface NudgeConfig {
  timeoutMs: number;
  reason: string;
  labels: string[];
}

// Application funnel — a stall here usually means the user is stuck/confused.
const FUNNEL = new Set<Screen>(['basicpan', 'basic', 'moredetails']);
// Offers surfaces — eligibility done, but they haven't picked/applied to a lender.
const OFFERS = new Set<Screen>(['offers', 'fare']);
// Main tab screens — a generic "need help?" is appropriate after a longer wait.
const MAIN = new Set<Screen>(['home', 'loans', 'profile', 'help', 'calculator', 'repay']);

/** Nudge config for a screen, or null on auth/splash/transient/processing screens. */
export function nudgeFor(screen: Screen): NudgeConfig | null {
  if (FUNNEL.has(screen)) {
    return {
      timeoutMs: 18000,
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
      timeoutMs: 20000,
      reason: 'eligible_no_apply',
      labels: [
        'Want help choosing the best offer?',
        'Not sure which offer fits? Ask me.',
        'Have questions about these offers?',
      ],
    };
  }
  if (MAIN.has(screen)) {
    return {
      timeoutMs: 30000,
      reason: 'idle',
      labels: [
        'Any questions? Tap to ask me.',
        "Need any help? I'm right here.",
        'Let me help you — tap to ask.',
      ],
    };
  }
  return null;
}
