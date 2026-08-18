/**
 * WS8 — everything we already know about a signed-in user, for the in-app agent.
 *
 * The problem this solves: someone fills in the website form, gets a callback,
 * then installs the app from the Play Store. No deep link, no token — just a
 * phone number. Until now the app knew nothing, so the in-app agent opened with
 * a blank slate and asked questions the customer had already answered twice.
 *
 * Phone number is the join key across every channel (website form, outbound
 * call, app account), which is why it is normalised to bare 10 digits
 * everywhere — see `normalisePhone` in dialer.ts. If that key drifts, a returning
 * customer looks like a stranger.
 *
 * Everything here is READ-ONLY and best-effort: this feeds an agent's opening
 * line, so a failure must degrade to "no context" rather than break app boot.
 */
import { prisma } from './prisma.js';
import { STAGE_LABELS } from './journey.js';
import { nextActionFor } from './nextAction.js';
import { getConversationContext } from './conversations.js';

export interface UserContext {
  /** True when we know anything at all — the app skips the handoff if false. */
  hasHistory: boolean;
  name: string | null;
  city: string | null;
  email: string | null;
  /** Journey stage, machine value + label for the agent to speak. */
  stage: string | null;
  stageLabel: string | null;
  nextAction: string | null;
  /** Website enquiries made under this phone, oldest first. */
  inquiries: Array<{
    product: string | null;
    amount: number | null; // paise
    amountLabel: string | null;
    city: string | null;
    summary: string | null;
    createdAt: string;
    source: string | null;
    campaign: string | null;
  }>;
  /** The most recent completed call, so the agent can reference it. */
  lastCall: {
    at: string;
    outcome: string | null;
    /** Whether `outcome` was reported by the agent or merely inferred. */
    outcomeSource: string | null;
    summary: string | null;
    answered: boolean;
    durationSec: number | null;
  } | null;
  /** An application already in flight, so the agent resumes instead of restarting. */
  application: {
    id: string;
    ref: string;
    status: string;
    amount: number | null;
    loanType: string | null;
    offerCount: number;
  } | null;
  /** A live loan, which changes the conversation entirely (servicing, not sales). */
  loan: { id: string; principal: number | null; status: string | null } | null;
  /** One-line brief the agent can open from. Built server-side so every
   *  channel phrases the history the same way. */
  brief: string | null;
  /**
   * The cross-channel CONVERSATION brief — every exchange on this number across
   * website, phone and app. Distinct from `brief` above, which summarises the
   * funnel journey (enquiries, application, loan). An in-app agent wants both:
   * one tells it where they are, the other what was already said.
   */
  conversationBrief: string | null;
  conversationCount: number;
  conversationChannels: string[];
  /** Recent conversations, newest first, for an agent that wants specifics. */
  conversations: Array<{
    channel: string;
    channelLabel: string;
    agentRole: string | null;
    at: string;
    durationSec: number | null;
    summary: string | null;
    outcome: string | null;
    /** False = we inferred it from the transcript. Do not state it as fact. */
    outcomeConfirmed: boolean;
  }>;
}

const EMPTY: UserContext = {
  hasHistory: false, name: null, city: null, email: null,
  stage: null, stageLabel: null, nextAction: null,
  inquiries: [], lastCall: null, application: null, loan: null, brief: null,
  conversationBrief: null, conversationCount: 0, conversationChannels: [], conversations: [],
};

/** ₹3,00,000 → "3 lakh rupees". Spoken form, since an agent reads this aloud. */
function amountWords(paise: number | null | undefined): string | null {
  if (paise == null) return null;
  const r = Math.round(paise / 100);
  if (r >= 10_000_000) return `${+(r / 10_000_000).toFixed(2)} crore rupees`;
  if (r >= 100_000) return `${+(r / 100_000).toFixed(2)} lakh rupees`;
  return `${r.toLocaleString('en-IN')} rupees`;
}

function agoWords(iso: Date): string {
  const mins = Math.round((Date.now() - iso.getTime()) / 60_000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return `${Math.round(d / 30)} month${Math.round(d / 30) === 1 ? '' : 's'} ago`;
}

/**
 * Gather context for a phone number (bare 10 digits).
 *
 * Queried in one Promise.all rather than sequentially — this sits on the app's
 * first screen after login and latency here is felt directly by the user.
 */
export async function buildUserContext(phone: string, userId?: string): Promise<UserContext> {
  const clean = String(phone ?? '').replace(/\D/g, '').slice(-10);
  if (clean.length !== 10) return EMPTY;

  const [customer, leads, call, app, loan] = await Promise.all([
    prisma.customer.findFirst({ where: { phone: clean } }),
    prisma.lead.findMany({ where: { phone: clean }, orderBy: { createdAt: 'asc' }, take: 10 }),
    // Only a call that actually connected is worth mentioning; referencing a
    // missed call would confuse rather than help.
    prisma.callAttempt.findFirst({
      where: { phone: clean, status: { in: ['completed', 'in_progress'] } },
      orderBy: { queuedAt: 'desc' },
    }),
    userId
      ? prisma.loanApplication.findFirst({
          where: { userId, status: { notIn: ['closed', 'rejected'] } },
          orderBy: { createdAt: 'desc' },
          include: { _count: { select: { offers: true } } },
        })
      : Promise.resolve(null),
    userId
      ? prisma.loan.findFirst({ where: { userId }, orderBy: { disbursedAt: 'desc' } })
      : Promise.resolve(null),
  ]).catch(() => [null, [], null, null, null] as const);

  const inquiries = (leads ?? []).map((l) => ({
    product: l.productInterest,
    amount: l.amount ?? null,
    amountLabel: amountWords(l.amount),
    city: l.city,
    summary: l.note,
    createdAt: l.createdAt.toISOString(),
    source: l.source,
    campaign: l.campaignId,
  }));

  // A number can have conversations and nothing else — someone who talked to the
  // website widget before ever submitting a form. Counting that as "no history"
  // would throw away exactly the context this endpoint exists to provide.
  const conversationCount = await prisma.conversation
    .count({ where: { phone: clean } })
    .catch(() => 0);

  const hasHistory = !!(customer || inquiries.length || call || app || loan || conversationCount);
  if (!hasHistory) return EMPTY;

  const latest = inquiries[inquiries.length - 1] ?? null;
  const stage = customer?.currentStage ?? null;

  const ctx: UserContext = {
    hasHistory: true,
    name: customer?.name ?? null,
    city: customer?.city ?? latest?.city ?? null,
    email: customer?.email ?? null,
    stage,
    stageLabel: stage ? STAGE_LABELS[stage] ?? stage : null,
    nextAction: stage ? nextActionFor(stage) : null,
    inquiries,
    lastCall: call
      ? {
          at: call.queuedAt.toISOString(),
          outcome: call.outcome,
          outcomeSource: call.outcomeSource,
          summary: call.summary,
          answered: call.answered,
          durationSec: call.durationSec,
        }
      : null,
    application: app
      ? {
          id: app.id, ref: app.ref, status: app.status,
          amount: app.amount ?? null, loanType: app.loanType ?? null,
          offerCount: (app as any)._count?.offers ?? 0,
        }
      : null,
    loan: loan ? { id: loan.id, principal: loan.principal ?? null, status: loan.status ?? null } : null,
    brief: null,
    conversationBrief: null,
    conversationCount: 0,
    conversationChannels: [],
    conversations: [],
  };

  ctx.brief = buildBrief(ctx, leads?.[leads.length - 1]?.createdAt, call?.queuedAt);

  // WS10 — the cross-channel conversation memory. Fetched separately (and
  // tolerantly) because it is additive: if it fails, the agent still gets the
  // funnel context it always had rather than nothing at all.
  const conv = await getConversationContext(clean, 6).catch(() => null);
  if (conv?.known) {
    ctx.conversationBrief = conv.brief;
    ctx.conversationCount = conv.conversationCount;
    ctx.conversationChannels = conv.channels;
    ctx.conversations = conv.conversations.map((c) => ({
      channel: c.channel,
      channelLabel: c.channelLabel,
      agentRole: c.agentRole,
      at: c.at.toISOString(),
      durationSec: c.durationSec,
      summary: c.summary,
      outcome: c.outcome,
      outcomeConfirmed: c.outcomeConfirmed,
    }));
  }

  return ctx;
}

/**
 * One sentence the agent can open from.
 *
 * Composed here rather than in the prompt so that the phrasing is consistent
 * across the app agent and the phone agent, and so the ordering is deliberate:
 * a live loan outranks an application, which outranks a website enquiry. Opening
 * with "you asked about a loan" to someone who already has one would be a bad
 * look for a lender.
 */
function buildBrief(c: UserContext, lastInquiryAt?: Date, lastCallAt?: Date): string | null {
  const bits: string[] = [];

  if (c.loan) {
    bits.push(`has an active loan of ${amountWords(c.loan.principal) ?? 'an unknown amount'}`);
  } else if (c.application) {
    const offers = c.application.offerCount;
    bits.push(
      `has an application in progress (${c.application.ref}, status ${c.application.status}` +
        (offers ? `, ${offers} offer${offers === 1 ? '' : 's'} ready` : '') +
        ')',
    );
  }

  const latest = c.inquiries[c.inquiries.length - 1];
  if (latest && lastInquiryAt) {
    const extra = c.inquiries.length > 1 ? ` (and ${c.inquiries.length - 1} earlier enquiry/enquiries)` : '';
    bits.push(
      `enquired on the website ${agoWords(lastInquiryAt)} about ${latest.product ?? 'a loan'}` +
        (latest.amountLabel ? ` of ${latest.amountLabel}` : '') +
        extra,
    );
  }

  if (c.lastCall && lastCallAt && c.lastCall.answered) {
    // Only mention an outcome the agent itself reported. An inferred outcome is
    // a keyword guess, and asserting it back to the customer ("you said you
    // weren't interested") would be worse than saying nothing.
    const reliable = c.lastCall.outcomeSource === 'agent' && c.lastCall.outcome;
    bits.push(
      `spoke to us on the phone ${agoWords(lastCallAt)}` +
        (reliable ? ` and the outcome was ${String(c.lastCall.outcome).replace(/_/g, ' ')}` : ''),
    );
  }

  if (!bits.length) return null;
  const who = c.name ? c.name.split(/\s+/)[0] : 'This customer';
  return `${who} ${bits.join('; ')}.`;
}
