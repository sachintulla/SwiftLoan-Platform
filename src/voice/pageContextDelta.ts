/**
 * Page-context helpers for the agent's `client-tools-update`.
 *
 * `normaliseContext` is what the agent fingerprints to decide "nothing changed". `missingRequiredDelta`
 * covers one specific case: on a form, the agent has just filled or tapped something (it already has
 * the new value in the tool result) and the only thing the screen has to tell it is which mandatory
 * fields are still empty. Resending the whole screen for that (every control, every option) is noise
 * and re-prompts the model with a page it already has, so we send just `{ page, missing_required_fields }`.
 */

/** Same shape the agent has always fingerprinted: stable action order, no empty/ticking api_context noise. */
export function normaliseContext(c: any): any {
  const actions = Array.isArray(c.available_actions)
    ? [...c.available_actions].sort((a: any, b: any) => {
        const ka = `${a?.kind}|${a?.label}`;
        const kb = `${b?.kind}|${b?.label}`;
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      })
    : c.available_actions;
  let apiContext = c.api_context;
  if (apiContext && typeof apiContext === 'object') {
    const meaningful = Object.fromEntries(
      Object.entries(apiContext).filter(([, v]) => !(Array.isArray(v) && v.length === 0)),
    );
    apiContext = Object.keys(meaningful).length ? meaningful : undefined;
  }
  // `seconds_ago` on a toast ticks every second; it is not a content change.
  if (apiContext && typeof apiContext === 'object' && (apiContext as any).lastToast) {
    apiContext = { ...(apiContext as any), lastToast: { message: (apiContext as any).lastToast.message } };
  }
  return { ...c, available_actions: actions, api_context: apiContext };
}

const sameList = (a: unknown[], b: unknown[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

/** Everything about a screen EXCEPT the live state of its controls and the missing-fields list. */
function structureKey(n: any): string {
  const { available_actions, ...rest } = n;
  delete rest.missing_required_fields;
  const controls = Array.isArray(available_actions)
    ? available_actions.map((a: any) => `${a?.kind}|${a?.group ?? ''}|${a?.label}`)
    : available_actions;
  return JSON.stringify({ ...rest, controls });
}

/**
 * `prev` / `next`: normalised contexts for the SAME screen (prev = what the agent was last told).
 * Returns the small update to send, or null when the normal full update applies — i.e. unless the
 * mandatory-fields list changed AND nothing else about the screen changed beyond control state
 * (a value filled, a chip selected). A new/renamed control, a new title, a toast, etc. still go in full.
 */
export function missingRequiredDelta(
  prev: any,
  next: any,
): { page: string; missing_required_fields: string[] } | null {
  if (!prev || !next || prev.page !== next.page) return null;
  const a = prev.missing_required_fields;
  const b = next.missing_required_fields;
  if (!Array.isArray(a) || !Array.isArray(b) || sameList(a, b)) return null;
  if (structureKey(prev) !== structureKey(next)) return null;
  return { page: String(next.page), missing_required_fields: b };
}

/* ── Identity block: sent once per call, then only when it changes ───────────────────────────── */

/**
 * Facts about the person and the call rather than the screen: the agent keeps them for the whole
 * call, so repeating them on every screen change is noise (and a full phone number, each time).
 * `authenticated_phone` is how Ello learns the number after login — it is sent when it first appears
 * and again only if it changes.
 */
export const IDENTITY_KEYS = [
  'preferred_language',
  'agent_language',
  'user_name',
  'authenticated_phone',
  'heard_intro_pitch',
  'already_introduced',
  'priorInquiries',
  'account_summary',
] as const;

/** The tab bar's labels: on every main screen, never sent as controls, so they carry no news in the page text either. */
const TAB_LABELS = new Set(['Home', 'My Offers', 'My Loans', 'Profile', 'Support']);

/** An Indian mobile number as shown on screen ("+91 7854216495", "78542 16495"). The agent gets it once as `authenticated_phone`. */
const PHONE_IN_TEXT = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g;

/**
 * The visible page text, minus what the controls (or the title) already say, and with phone numbers
 * masked. The page text is `a · b · c`; a segment that is exactly a control label, a tab label or the
 * screen title is a repeat. Returns undefined when nothing is left.
 */
export function compactOverview(overview: unknown, labels: string[], title?: string): string | undefined {
  if (typeof overview !== 'string' || !overview) return undefined;
  const known = new Set<string>([...labels, ...TAB_LABELS, ...(title ? [title] : [])]);
  const kept = overview
    .split(' · ')
    .map(seg => seg.trim())
    .filter(seg => seg && !known.has(seg))
    .map(seg => seg.replace(PHONE_IN_TEXT, '(phone on file)'));
  return kept.length ? kept.join(' · ') : undefined;
}

/** Screens whose full page text just repeats the controls (the agent calls read_screen when it needs more). */
export const NO_OVERVIEW_SCREENS: ReadonlySet<string> = new Set(['basicpan']);

/** The identity facts as `{ key: JSON }`, one entry per key — so only the keys that changed are sent again. */
export type IdentityMap = Record<string, string>;

export function identityMap(ctx: any): IdentityMap {
  const picked: IdentityMap = {};
  // An empty list counts as absent: Home leaves `priorInquiries` out and other screens send `[]`, which
  // would otherwise look like a change of identity on every trip to and from Home.
  for (const k of IDENTITY_KEYS) {
    const v = ctx?.[k];
    if (v !== undefined && !(Array.isArray(v) && v.length === 0)) picked[k] = JSON.stringify(v);
  }
  return picked;
}

/**
 * What actually goes on the wire: `payload` minus every identity key whose value is unchanged since it was
 * last sent (`last`), so a login update carries the phone number and account summary but NOT a language the
 * agent was already told (re-sending `preferred_language: English` next to `agent_language: Telugu` at the
 * moment of login is what made it welcome the user in English). Also drops an empty priorInquiries and the page
 * text where it only repeats the controls. Returns the trimmed payload and the map of what is now "known".
 */
export function trimForSend(
  payload: any,
  fullCtx: any,
  last: IdentityMap | null,
): { out: any; identity: IdentityMap } {
  const now = identityMap(fullCtx);
  const out: any = { ...payload };
  for (const k of IDENTITY_KEYS) {
    if (last && now[k] === last[k]) delete out[k]; // unchanged (or absent both times)
  }
  // Keys that were sent before and are unchanged stay "known"; changed or first-time ones are known from now.
  const identity: IdentityMap = { ...(last ?? {}), ...now };
  if (Array.isArray(out.priorInquiries) && out.priorInquiries.length === 0) delete out.priorInquiries;
  if (NO_OVERVIEW_SCREENS.has(String(out.page)) && 'screen_overview' in out) delete out.screen_overview;
  else if (typeof out.screen_overview === 'string') {
    const labels = Array.isArray(out.available_actions) ? out.available_actions.map((a: any) => String(a?.label ?? '')) : [];
    const tidy = compactOverview(out.screen_overview, labels, out.screen_title);
    if (tidy) out.screen_overview = tidy;
    else delete out.screen_overview;
  }
  return { out, identity };
}
