'use client';
import React from 'react';
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
import { loanStatusLabel } from '@/lib/format';
import { LoanStatusBadge } from '@/components/ui';

const LENDER_STEPS: { key: string; label: string }[] = [
  { key: 'handoff', label: 'Submitted' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'disbursed', label: 'Active' },
];
const LENDER_RANK: Record<string, number> = { handoff: 0, under_review: 1, approved: 2, disbursed: 3 };

export interface LenderOffer {
  id: string;
  applied?: boolean;
  lenderName?: string | null;
  lenderStatus?: string | null;
  partner?: { name?: string | null } | null;
}

/** One lender's own journey after submission — independent of the others. */
export function LenderTrack({ offer }: { offer: LenderOffer }) {
  const st = offer.lenderStatus ?? 'handoff';
  const failed = st === 'rejected' || st === 'failed';
  const idx = LENDER_RANK[st] ?? 0;
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div className="row between wrap" style={{ marginBottom: 8 }}>
        <b>{offer.partner?.name ?? offer.lenderName ?? 'Lender'}</b>
        <LoanStatusBadge status={st} />
      </div>
      <div className="row wrap" style={{ gap: 0 }}>
        {LENDER_STEPS.map((s, i) => {
          const done = !failed && i <= idx;
          const isFailNode = failed && i === Math.min(idx, 1) + 1;
          const bg = isFailNode ? 'var(--red)' : done ? 'var(--brand)' : 'var(--border)';
          return (
            <div key={s.key} className="row" style={{ gap: 0 }}>
              <div style={{ display: 'grid', placeItems: 'center', gap: 5, minWidth: 84 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: '#fff', background: bg }}>
                  {isFailNode ? '×' : done && i < idx ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: 10, color: done || isFailNode ? 'var(--text)' : 'var(--text-faint)', textAlign: 'center' }}>
                  {isFailNode ? loanStatusLabel(st) : s.label}
                </span>
              </div>
              {i < LENDER_STEPS.length - 1 && <div style={{ width: 20, height: 2, background: !failed && i < idx ? 'var(--brand)' : 'var(--border)' }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
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
