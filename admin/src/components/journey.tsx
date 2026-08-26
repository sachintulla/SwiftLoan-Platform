'use client';
import React from 'react';
import Link from 'next/link';
import { dateStr, timeAgo } from '@/lib/format';

// Canonical customer journey — these keys are the server's JourneyStage enum
// (server/src/lib/journey.ts STAGE_ORDER / STAGE_LABELS). They must match exactly:
// the customers list filters with ?stage=<key> and the API ignores anything it
// does not recognise, so an invented key silently returns an unfiltered list.
export const STAGES: { key: string; label: string }[] = [
  { key: 'lead_captured', label: 'Lead submitted' },
  { key: 'contacted', label: 'Contacted by agent' },
  { key: 'app_installed', label: 'App installed' },
  { key: 'registered', label: 'OTP verified' },
  { key: 'eligibility_checked', label: 'Eligibility checked' },
  { key: 'offers_viewed', label: 'Offers viewed' },
  { key: 'offer_selected', label: 'Offer selected' },
  { key: 'kyc_started', label: 'KYC started' },
  { key: 'kyc_completed', label: 'KYC completed' },
  { key: 'application_submitted', label: 'Application submitted' },
  { key: 'approved', label: 'Approved' },
  { key: 'disbursed', label: 'Disbursed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'lost', label: 'Lost' },
];

export function stageLabel(key: string | null | undefined) {
  if (!key) return '—';
  return STAGES.find((s) => s.key === key)?.label ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function stalledLabel(mins: number | null | undefined) {
  if (mins == null) return '—';
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

/**
 * Stage → the (lastStep, expectedStep) pair sent to POST /api/admin/calls/trigger.
 *
 * The server turns this pair into the drop-off wording the agent opens with, so
 * calling from "KYC started" makes it say "you started your KYC but did not
 * finish it" rather than a generic follow-up. `disbursed` is deliberately absent:
 * the journey is over, there is nothing to nudge them towards.
 */
export const STAGE_CALL_STEPS: Record<string, { lastStep: string; expectedStep: string }> = {
  lead_captured: { lastStep: 'lead_captured', expectedStep: 'app_installed' },
  contacted: { lastStep: 'contacted', expectedStep: 'app_installed' },
  app_installed: { lastStep: 'app_installed', expectedStep: 'otp_verified' },
  registered: { lastStep: 'otp_verified', expectedStep: 'eligibility_started' },
  eligibility_checked: { lastStep: 'eligibility_started', expectedStep: 'eligibility_completed' },
  offers_viewed: { lastStep: 'offer_viewed', expectedStep: 'offer_selected' },
  offer_selected: { lastStep: 'offer_selected', expectedStep: 'kyc_started' },
  kyc_started: { lastStep: 'kyc_started', expectedStep: 'kyc_completed' },
  kyc_completed: { lastStep: 'kyc_completed', expectedStep: 'application_submitted' },
  application_submitted: { lastStep: 'application_submitted', expectedStep: 'approved' },
  approved: { lastStep: 'approved', expectedStep: 'disbursed' },
};

export interface StageProgress {
  stage: string;
  label?: string;
  reached: boolean;
  /** Reached only by implication from a later stage — no event was recorded. */
  inferred?: boolean;
  at?: string | null;
}

/**
 * Vertical journey tracker used on the customer page.
 *
 * Three states have to be told apart at a glance, so each one differs in SHAPE
 * and WEIGHT as well as colour (colour alone fails for ~8% of male operators):
 *
 *   confirmed  — solid filled disc, ✓, real timestamp
 *   inferred   — hollow disc with a dashed ring; we never saw the event, we only
 *                know they got past it. Reads deliberately less solid.
 *   not reached— faint dotted outline with the step number
 *
 * `action` renders the per-stage control (the Call button). It is only called
 * for stages that were actually reached — offering to call someone about a step
 * they never got to is nonsense.
 */
export function JourneyTracker({ steps, currentStage, action, stalledMinutes }: {
  steps: StageProgress[];
  currentStage?: string | null;
  action?: (step: StageProgress, isCurrent: boolean) => React.ReactNode;
  /** Minutes in the current stage — surfaced loudly, it is the cue to call. */
  stalledMinutes?: number | null;
}) {
  if (!steps.length) return <div className="empty">No journey recorded yet</div>;
  const currentIdx = steps.findIndex((s) => s.stage === currentStage);

  return (
    <div style={{ display: 'grid' }}>
      {steps.map((s, i) => {
        const isCurrent = i === currentIdx;
        const confirmed = s.reached && !!s.at;
        const inferred = s.reached && !s.at;
        const done = s.reached && !isCurrent;

        // rail below this node is only "travelled" if the NEXT step was reached
        const nextReached = i < steps.length - 1 && steps[i + 1].reached;

        const marker = confirmed
          ? { background: 'var(--brand)', border: '2px solid var(--brand)', color: '#fff', glyph: '✓' }
          : inferred
            ? { background: 'var(--surface)', border: '2px dashed var(--brand)', color: 'var(--brand)', glyph: '✓' }
            : { background: 'var(--surface)', border: '2px dotted var(--border)', color: 'var(--text-faint)', glyph: String(i + 1) };

        return (
          <div key={s.stage} className="row" style={{ gap: 14, alignItems: 'stretch' }}>
            {/* rail */}
            <div style={{ display: 'grid', justifyItems: 'center', width: 30, flexShrink: 0 }}>
              <div
                aria-hidden
                style={{
                  width: isCurrent ? 26 : 22, height: isCurrent ? 26 : 22, borderRadius: '50%',
                  display: 'grid', placeItems: 'center', fontSize: isCurrent ? 12 : 11,
                  fontWeight: 800, flexShrink: 0,
                  background: marker.background, border: marker.border, color: marker.color,
                  boxShadow: isCurrent ? '0 0 0 5px var(--teal-bg)' : undefined,
                }}
              >
                {marker.glyph}
              </div>
              {i < steps.length - 1 && (
                <div style={{
                  width: 2, flex: 1, minHeight: 20,
                  background: nextReached ? 'var(--brand)' : 'var(--border)',
                  opacity: nextReached ? 1 : .7,
                }} />
              )}
            </div>

            {/* label + meta + action */}
            <div className="row between wrap" style={{ gap: 10, alignItems: 'flex-start', flex: 1, paddingBottom: 16, minWidth: 0 }}>
              <div style={{ minWidth: 0 }}>
                <div className="row wrap" style={{ gap: 8 }}>
                  <span style={{
                    fontSize: 13.5,
                    fontWeight: isCurrent ? 750 : done ? 600 : 500,
                    color: s.reached ? 'var(--text)' : 'var(--text-faint)',
                  }}>
                    {s.label || stageLabel(s.stage)}
                  </span>
                  {isCurrent && <span className="badge tone-blue">They are here now</span>}
                </div>
                <div style={{ fontSize: 11.5, marginTop: 2, color: inferred ? 'var(--amber)' : 'var(--text-dim)' }}>
                  {confirmed
                    ? `${dateStr(s.at)} · ${timeAgo(s.at)}`
                    : inferred
                      // Say what we actually know. "implied · no event recorded"
                      // was jargon; this is the plain-English version.
                      ? 'Inferred — we know they got past this, but no event was recorded'
                      : 'Not reached yet'}
                </div>
                {isCurrent && stalledMinutes != null && stalledMinutes >= 15 && (
                  <div
                    className={`badge ${stalledMinutes > 1440 ? 'tone-red' : 'tone-amber'}`}
                    style={{ marginTop: 6 }}
                    title="How long they have been sitting on this step"
                  >
                    Stuck here {stalledLabel(stalledMinutes)}
                  </div>
                )}
              </div>
              {/* Reached stages, plus the current one — the server does not mark
                  channel-entry stages (lead_captured / contacted) as reached
                  without a recorded event, and that is exactly the person an
                  operator most needs to ring. */}
              {(s.reached || isCurrent) && action ? <div style={{ flexShrink: 0 }}>{action(s, isCurrent)}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const CHANNEL_TONE: Record<string, string> = {
  website: 'var(--blue)', voice: 'var(--brand)', app: 'var(--teal)',
  campaign: 'var(--amber)', system: 'var(--grey)', email: 'var(--grey)',
};
const CHANNEL_ICON: Record<string, string> = {
  website: '🌐', voice: '☎', app: '📱', campaign: '📣', system: '⚙', email: '✉',
};

export function ChannelBadge({ channel }: { channel: string }) {
  const c = (channel || 'system').toLowerCase();
  return (
    <span className="row" style={{ gap: 6, fontSize: 11.5, color: CHANNEL_TONE[c] || 'var(--grey)', fontWeight: 600, minWidth: 92 }}>
      <span aria-hidden>{CHANNEL_ICON[c] || '•'}</span>
      <span style={{ textTransform: 'capitalize' }}>{c}</span>
    </span>
  );
}

// ─── Per-lender application track (post-submission) ──────────────────────────
// After "Application submitted" the journey fans out: each lender the customer
// applied to runs this ladder independently. Labels match the mobile app.
import { loanStatusLabel, inr, timeStr } from '@/lib/format';
import { LoanStatusBadge } from '@/components/ui';

// Canonical progress rank for a lender application, used everywhere.
const LENDER_RANK: Record<string, number> = {
  handoff: 1, submitted: 1, under_review: 2, approved: 3, disbursed: 4,
};

export interface LenderOffer {
  id: string;
  applicationId?: string | null; // parent application — tap navigates to its detail
  applied?: boolean;
  lenderName?: string | null;
  lenderLogoUrl?: string | null;
  lenderStatus?: string | null;
  partner?: { name?: string | null; logoUrl?: string | null } | null;
  // Offer economics
  amount?: number | null;
  apr?: number | null;
  roi?: number | null;
  emi?: number | null;
  tenureMonths?: number | null;
  processingFee?: number | null;
  netDisbursalAmount?: number | null;
  // Per-stage timestamps (canonical order)
  appliedAt?: string | null;
  underReviewAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  disbursedAt?: string | null;
  failureReason?: string | null;
}

const ts = (v?: string | null) => (v ? `${dateStr(v)} · ${timeStr(v)}` : null);

/**
 * One lender's own application journey — independent of the others, and shown
 * the same way across the whole admin: lender (name + logo), the applied offer
 * economics, and a timestamped timeline in the canonical sequence
 * Submitted → Under Review → Approved / Failed → Disbursed.
 */
export function LenderTrack({ offer: o }: { offer: LenderOffer }) {
  const st = o.lenderStatus ?? 'handoff';
  const failed = st === 'rejected' || st === 'failed';
  const rank = LENDER_RANK[st] ?? 1;
  const name = o.partner?.name ?? o.lenderName ?? 'Lender';
  const logo = o.lenderLogoUrl ?? o.partner?.logoUrl ?? null;
  const rate = o.apr ?? o.roi ?? null;

  // Canonical timeline. `minRank` is when this step is considered reached; the
  // terminal step is Failed (if rejected) instead of Approved/Disbursed.
  const steps: { label: string; at: string | null; minRank: number; fail?: boolean }[] = [
    { label: 'Submitted', at: ts(o.appliedAt), minRank: 1 },
    { label: 'Under Review', at: ts(o.underReviewAt), minRank: 2 },
    ...(failed
      ? [{ label: 'Failed', at: ts(o.rejectedAt), minRank: 2, fail: true }]
      : [
          { label: 'Approved', at: ts(o.approvedAt), minRank: 3 },
          { label: 'Disbursed', at: ts(o.disbursedAt), minRank: 4 },
        ]),
  ];

  const detail = [
    o.amount != null ? `Loan ${inr(o.amount)}` : null,
    rate != null ? `${rate}% p.a.` : null,
    o.emi != null ? `EMI ${inr(o.emi)}` : null,
    o.tenureMonths ? `${o.tenureMonths} mo` : null,
    o.processingFee != null ? `Fee ${inr(o.processingFee)}` : null,
  ].filter(Boolean).join('  ·  ');

  const inner = (
    <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      {/* header: logo + lender + current status */}
      <div className="row between wrap" style={{ gap: 10, marginBottom: 6 }}>
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          {logo
            ? <img src={logo} alt={name} width={30} height={30} style={{ borderRadius: 8, objectFit: 'contain', background: '#fff', border: '1px solid var(--border)' }} />
            : <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--brand)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>{name.slice(0, 2).toUpperCase()}</div>}
          <b style={{ fontSize: 14 }}>{name}</b>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <LoanStatusBadge status={st} />
          {o.applicationId && <span className="muted" style={{ fontSize: 12 }}>View →</span>}
        </div>
      </div>
      {detail && <div className="muted" style={{ fontSize: 12, marginBottom: 10, marginLeft: 40 }}>{detail}</div>}

      {/* timestamped vertical timeline */}
      <div style={{ marginLeft: 8 }}>
        {steps.map((s, i) => {
          const reached = s.fail ? true : rank >= s.minRank;
          const color = s.fail ? 'var(--red)' : reached ? 'var(--brand)' : 'var(--border)';
          const last = i === steps.length - 1;
          return (
            <div key={s.label} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <div style={{ display: 'grid', placeItems: 'center', width: 18 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {!last && <div style={{ width: 2, height: 26, background: reached ? 'var(--brand)' : 'var(--border)' }} />}
              </div>
              <div style={{ paddingBottom: last ? 0 : 8, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: reached ? 'var(--text)' : 'var(--text-faint)' }}>{s.label}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{s.at ?? (reached ? 'time not recorded' : 'pending')}</div>
                {s.fail && o.failureReason && <div style={{ fontSize: 11.5, color: 'var(--red)' }}>{o.failureReason}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
  return o.applicationId
    ? <Link href={`/loans/${o.applicationId}`} style={{ display: 'block', color: 'inherit', textDecoration: 'none', cursor: 'pointer' }}>{inner}</Link>
    : inner;
}

/** Roll-up of a customer's lender applications, matching the app's outcomes. */
export function LenderRollup({ s }: { s: { submitted: number; inProgress: number; approved: number; rejected: number; disbursed: number } }) {
  const cell = (label: string, value: number, tone: string) => (
    <div style={{ flex: '1 1 90px', minWidth: 90, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div className={`badge tone-${tone}`} style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
    </div>
  );
  return (
    <div className="row wrap" style={{ gap: 10 }}>
      {cell('Submitted', s.submitted, 'blue')}
      {cell('In progress', s.inProgress, 'amber')}
      {cell('Approved', s.approved, 'green')}
      {cell('Rejected', s.rejected, 'red')}
      {cell('Disbursed', s.disbursed, 'teal')}
    </div>
  );
}
