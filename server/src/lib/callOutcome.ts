/**
 * WS7 — deciding what actually happened on a call.
 *
 * Ello's webhooks carry **no outcome field** (verified: call.started,
 * call.completed, call.processed and call.recording between them give status,
 * duration, transcript, recording — never a disposition). So an answered call
 * would otherwise land in the dashboard as "completed, outcome blank", which is
 * useless for deciding follow-up.
 *
 * Two sources, in strict order of trust:
 *
 *   1. The agent reports it, via the `report_call_outcome` tool → the
 *      /call-outcome-report endpoint. This is authoritative: the agent was in
 *      the conversation.
 *   2. Failing that, infer from the transcript/summary text. This is a
 *      guess, and it is recorded as one — `outcomeSource` distinguishes them so
 *      nobody mistakes a keyword match for something the customer said.
 *
 * The inference is deliberately conservative. A wrong `do_not_call` silences a
 * real customer forever; a wrong `interested` sends marketing to someone who
 * refused. When the signal is weak we return null and let a human decide.
 */
import type { CallOutcome } from '@prisma/client';

/**
 * Phrase patterns per outcome, ordered by how costly a false positive is —
 * the strongest, least ambiguous signals are checked first.
 */
const PATTERNS: Array<{ outcome: CallOutcome; weight: number; re: RegExp }> = [
  // Do-not-call: an explicit legal request. Only very unambiguous phrasing.
  { outcome: 'do_not_call', weight: 10, re: /\b(do not call|don'?t call me again|remove my number|stop calling|add me to dnd|unsubscribe)\b/i },
  { outcome: 'wrong_number', weight: 9, re: /\b(wrong number|not my number|you have the wrong|i did not apply|never applied|who is this.*don'?t know)\b/i },
  { outcome: 'installed_app', weight: 8, re: /\b(already installed|downloaded the app|installed the app|got the app)\b/i },
  { outcome: 'callback_requested', weight: 7, re: /\b(call me later|call back|callback|call me tomorrow|busy right now|driving|in a meeting|call after)\b/i },
  { outcome: 'not_interested', weight: 6, re: /\b(not interested|no longer interested|don'?t need|already took a loan|got a loan elsewhere|changed my mind|no thanks|not looking)\b/i },
  { outcome: 'interested', weight: 5, re: /\b(interested|yes.*proceed|send me the link|share the link|how do i apply|what'?s the next step|send.*whatsapp|send.*sms)\b/i },
];

export type OutcomeSource = 'agent' | 'inferred' | 'status' | null;

export interface DerivedOutcome {
  outcome: CallOutcome | null;
  source: OutcomeSource;
  /** Which phrase triggered an inference, for the dashboard to show its work. */
  evidence?: string;
}

/** Flatten whatever shape the transcript arrives in into searchable text. */
export function transcriptText(transcript: unknown, summary?: string | null): string {
  const parts: string[] = [];
  if (summary) parts.push(summary);

  const walk = (v: unknown, depth = 0) => {
    if (depth > 6 || v == null) return;
    if (typeof v === 'string') { parts.push(v); return; }
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    if (typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        // Only text-bearing fields; ids and timestamps add noise that can
        // accidentally match a pattern.
        if (/^(text|message|content|transcript|summary|utterance|speech|value)$/i.test(k)) walk(val, depth + 1);
        else if (typeof val === 'object') walk(val, depth + 1);
      }
    }
  };
  walk(transcript);
  return parts.join(' \n ');
}

/**
 * Infer an outcome from what was said.
 *
 * Returns the highest-weight match. Requires a real transcript: a two-word
 * summary is not enough evidence to write a disposition that drives outreach.
 */
export function inferOutcome(transcript: unknown, summary?: string | null): DerivedOutcome {
  const text = transcriptText(transcript, summary);
  if (text.trim().length < 25) return { outcome: null, source: null };

  let best: { outcome: CallOutcome; weight: number; evidence: string } | null = null;
  for (const p of PATTERNS) {
    const m = p.re.exec(text);
    if (m && (!best || p.weight > best.weight)) {
      best = { outcome: p.outcome, weight: p.weight, evidence: m[0] };
    }
  }
  if (!best) return { outcome: null, source: null };
  return { outcome: best.outcome, source: 'inferred', evidence: best.evidence };
}

/** Outcomes the agent is allowed to report, mapped to our enum. */
const AGENT_REPORTED: Record<string, CallOutcome> = {
  interested: 'interested',
  not_interested: 'not_interested',
  callback_requested: 'callback_requested',
  wrong_number: 'wrong_number',
  voicemail: 'voicemail',
  unreachable: 'unreachable',
  do_not_call: 'do_not_call',
  installed_app: 'installed_app',
  other: 'other',
};

export function parseAgentOutcome(raw: unknown): CallOutcome | null {
  const key = String(raw ?? '').trim().toLowerCase().replace(/[^a-z_]/g, '_');
  return AGENT_REPORTED[key] ?? null;
}

/**
 * Should a newly derived outcome replace what is already stored?
 *
 * An agent report always wins. An inference never overwrites an agent report,
 * and never overwrites an existing inference either — the first read of the
 * conversation is as good as the second, and re-deriving on every later webhook
 * (call.processed, call.recording) would make the disposition flap.
 */
export function shouldReplaceOutcome(
  existing: CallOutcome | null,
  existingSource: OutcomeSource,
  next: DerivedOutcome,
): boolean {
  if (!next.outcome) return false;
  if (next.source === 'agent') return true;
  if (existingSource === 'agent') return false;
  return existing == null;
}
