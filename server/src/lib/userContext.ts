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
 *
 * `profile`/`applicationStatus` vs the `marketing*` fields: `Customer.currentStage`
 * and `nextActionFor` are the internal sales/telecaller funnel (labels like "Call
 * the lead", "Nudge to check eligibility") — never meant to be said to the
 * customer. They used to be the top-level `stage`/`stageLabel`/`nextAction`,
 * which a customer-facing agent read as if it described their own application.
 * Renamed to `marketingStage`/`marketingStageLabel`/`marketingNextAction` so
 * that's unambiguous, and replaced with a real `applicationStatus` sourced from
 * the user's own `LoanApplication.status` for anything the agent should
 * actually speak from.
 */
import { ApplicationStatus } from '@prisma/client';
import { prisma } from './prisma.js';
import { STAGE_LABELS } from './journey.js';
import { nextActionFor } from './nextAction.js';
import { getConversationContext } from './conversations.js';

const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: 'Application details in progress',
  pan_pending: 'PAN verification pending',
  prequalifying: 'Checking eligibility',
  offers_ready: 'Offers ready to view',
  handoff: 'Submitted to lender',
  under_review: 'Under lender review',
  approved: 'Approved',
  rejected: 'Rejected',
  disbursed: 'Disbursed',
  closed: 'Closed',
  failed: 'Application failed',
};

export interface UserContext {
  /** True when we know anything at all — the app skips the handoff if false. */
  hasHistory: boolean;

  /** The signed-in account's own details (User table) — null only when there is no userId. */
  profile: {
    name: string | null;
    email: string | null;
    phone: string;
    dob: string | null; // ISO date
    gender: string | null;
    city: string | null;
    pincode: string | null;
    employment: string | null;
    monthlyIncome: number | null; // rupees
    /** Never expose the actual PAN digits to the agent — completion only. */
    panOnFile: boolean;
  } | null;

  /** Internal sales/telecaller funnel (see the file header) — not for the customer's ears. */
  marketingName: string | null;
  marketingCity: string | null;
  marketingEmail: string | null;
  marketingStage: string | null;
  marketingStageLabel: string | null;
  marketingNextAction: string | null;

  /** The one clear, customer-facing signal: where this user's loan application stands. */
  applicationStatus: string | null;
  applicationStatusLabel: string;

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
    amount: number | null; // paise — the user's own REQUESTED amount, not any lender's offered amount
    loanType: string | null;
    tenureMonths: number | null;
    /** Every offer, each trimmed to exactly: which lender, at what rate, for how much, what EMI, and its own status. */
    offers: Array<{
      lenderName: string | null;
      apr: number | null;
      amount: number | null; // paise — this lender's own offered amount, may differ from application.amount
      emi: number | null; // paise
      applied: boolean;
      /** Only meaningful once applied — this lender's own progress (in_progress/reviewed/rejected/etc). */
      status: string | null;
      statusLabel: string | null;
    }>;
  } | null;
  /** A live loan, which changes the conversation entirely (servicing, not sales). */
  loan: {
    id: string;
    ref: string;
    partnerName: string | null;
    principal: number | null; // paise
    apr: number | null;
    tenureMonths: number | null;
    emiAmount: number | null; // paise
    status: string | null;
    outstanding: number | null; // paise
  } | null;
  /**
   * The cross-channel CONVERSATION brief — every exchange on this number across
   * website, phone and app (what was already said), distinct from the
   * structured `applicationStatus`/`application`/`loan` fields above (where
   * they are).
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

const NO_APPLICATION_LABEL = 'No application started';

const EMPTY: UserContext = {
  hasHistory: false, profile: null,
  marketingName: null, marketingCity: null, marketingEmail: null,
  marketingStage: null, marketingStageLabel: null, marketingNextAction: null,
  applicationStatus: null, applicationStatusLabel: NO_APPLICATION_LABEL,
  inquiries: [], lastCall: null, application: null, loan: null,
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

/**
 * Gather context for a phone number (bare 10 digits).
 *
 * Queried in one Promise.all rather than sequentially — this sits on the app's
 * first screen after login and latency here is felt directly by the user.
 */
export async function buildUserContext(phone: string, userId?: string): Promise<UserContext> {
  const clean = String(phone ?? '').replace(/\D/g, '').slice(-10);
  if (clean.length !== 10) return EMPTY;

  const [user, customer, leads, call, app, loan] = await Promise.all([
    userId ? prisma.user.findUnique({ where: { id: userId } }) : Promise.resolve(null),
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
          // `failed` belongs alongside closed/rejected here — it means
          // prequalify ran and returned zero eligible offers (see
          // applications.routes.ts), a dead end exactly like the other two.
          // Leaving it out let a failed application still surface as "the
          // current application" — contradicting its own status.
          //
          // No `offers: { some: { applied: true } }` filter (removed) — that
          // used to hide an application until the user actually applied to a
          // lender, matching loans.tsx's own "trackable application" cutoff.
          // But this endpoint isn't loans.tsx: it now needs to tell "never
          // started" (no row at all) apart from "got offers, never applied"
          // (offers_ready, real offers sitting there) — collapsing the
          // second into the first was itself misleading, just in the
          // opposite direction from the bug this filter originally fixed.
          // The fix for BOTH is the same one: applicationStatusLabel gives
          // each real status its own accurate phrasing, so "offers_ready"
          // never gets spoken as "application in progress" OR "not started".
          where: { userId, status: { notIn: ['closed', 'rejected', 'failed'] } },
          orderBy: { createdAt: 'desc' },
          include: { offers: { include: { partner: true }, orderBy: { createdAt: 'asc' } } },
        })
      : Promise.resolve(null),
    userId
      ? prisma.loan.findFirst({ where: { userId }, orderBy: { disbursedAt: 'desc' } })
      : Promise.resolve(null),
  ]).catch(() => [null, null, [], null, null, null] as const);

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
  const conversationCount = await prisma.callAttempt
    .count({ where: { phone: clean } })
    .catch(() => 0);

  const hasHistory = !!(user || customer || inquiries.length || call || app || loan || conversationCount);
  if (!hasHistory) return EMPTY;

  const marketingStage = customer?.currentStage ?? null;
  const applicationStatus = app?.status ?? null;

  const ctx: UserContext = {
    hasHistory: true,
    profile: user
      ? {
          name: user.fullName ?? ([user.firstName, user.lastName].filter(Boolean).join(' ') || null),
          email: user.email,
          phone: user.phone,
          dob: user.dob ? user.dob.toISOString().slice(0, 10) : null,
          gender: user.gender,
          city: user.city,
          pincode: user.pincode,
          employment: user.employment,
          monthlyIncome: user.monthlyIncome ?? null,
          panOnFile: !!user.panNumber,
        }
      : null,
    marketingName: customer?.name ?? null,
    marketingCity: customer?.city ?? inquiries[inquiries.length - 1]?.city ?? null,
    marketingEmail: customer?.email ?? null,
    marketingStage,
    marketingStageLabel: marketingStage ? STAGE_LABELS[marketingStage] ?? marketingStage : null,
    marketingNextAction: marketingStage ? nextActionFor(marketingStage) : null,
    applicationStatus,
    applicationStatusLabel: applicationStatus
      ? APPLICATION_STATUS_LABELS[applicationStatus] ?? applicationStatus
      : NO_APPLICATION_LABEL,
    inquiries,
    lastCall: call
      ? {
          at: (call.queuedAt ?? call.startedAt).toISOString(),
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
          tenureMonths: app.tenureMonths ?? null,
          offers: (app.offers ?? []).map((o) => ({
            lenderName: o.lenderName ?? o.partner?.name ?? null,
            apr: o.apr ?? null,
            amount: o.amount ?? null,
            emi: o.emi ?? null,
            applied: o.applied,
            status: o.lenderStatus ?? null,
            statusLabel: o.lenderStatus ? APPLICATION_STATUS_LABELS[o.lenderStatus] ?? o.lenderStatus : null,
          })),
        }
      : null,
    loan: loan
      ? {
          id: loan.id, ref: loan.ref, partnerName: loan.partnerName ?? null,
          principal: loan.principal ?? null, apr: loan.apr ?? null,
          tenureMonths: loan.tenureMonths ?? null, emiAmount: loan.emiAmount ?? null,
          status: loan.status ?? null, outstanding: loan.outstanding ?? null,
        }
      : null,
    conversationBrief: null,
    conversationCount: 0,
    conversationChannels: [],
    conversations: [],
  };

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
