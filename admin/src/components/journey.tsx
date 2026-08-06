'use client';
import React from 'react';
import { dateStr, timeAgo } from '@/lib/format';

// Canonical customer journey — same order the 360 endpoint returns in stageProgress[].
export const STAGES: { key: string; label: string }[] = [
  { key: 'website_visit', label: 'Website Visit' },
  { key: 'lead_submitted', label: 'Lead Submitted' },
  { key: 'voice_agent_call', label: 'Voice Agent Call' },
  { key: 'app_installed', label: 'App Installed' },
  { key: 'language_selected', label: 'Language Selected' },
  { key: 'otp_verified', label: 'OTP Verified' },
  { key: 'eligibility', label: 'Eligibility' },
  { key: 'offers', label: 'Offers' },
  { key: 'kyc', label: 'KYC' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'approved', label: 'Approved / Rejected' },
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

export interface StageProgress {
  stage: string;
  label?: string;
  reached: boolean;
  /** Reached only by implication from a later stage — no event was recorded. */
  inferred?: boolean;
  at?: string | null;
}

/** Vertical journey tracker used on the customer 360 page. */
export function JourneyTracker({ steps, currentStage }: { steps: StageProgress[]; currentStage?: string | null }) {
  if (!steps.length) return <div className="empty">No journey recorded yet</div>;
  return (
    <div style={{ display: 'grid' }}>
      {steps.map((s, i) => {
        const isCurrent = s.stage === currentStage;
        const color = s.reached ? 'var(--brand)' : 'var(--border)';
        return (
          <div key={s.stage} className="row" style={{ gap: 12, alignItems: 'stretch' }}>
            <div style={{ display: 'grid', justifyItems: 'center', width: 28 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center',
                fontSize: 11, fontWeight: 700, color: s.reached ? '#fff' : 'var(--text-faint)',
                background: s.reached ? color : 'transparent', border: `2px solid ${color}`, flexShrink: 0,
                boxShadow: isCurrent ? '0 0 0 4px var(--teal-bg)' : undefined,
              }}>{s.reached ? '✓' : i + 1}</div>
              {i < steps.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 18, background: steps[i + 1].reached ? 'var(--brand)' : 'var(--border)' }} />}
            </div>
            <div style={{ paddingBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: isCurrent ? 700 : 500, color: s.reached ? 'var(--text)' : 'var(--text-faint)' }}>
                {s.label || stageLabel(s.stage)}
                {isCurrent && <span className="badge tone-blue" style={{ marginLeft: 8 }}>Current</span>}
              </div>
              <div className="muted" style={{ fontSize: 11.5 }}>
                {s.at
                  ? `${dateStr(s.at)} · ${timeAgo(s.at)}`
                  : s.inferred
                    // No event was recorded — say so rather than implying we
                    // observed it. A customer who installed the app directly
                    // never submitted a website lead or took a call.
                    ? 'implied · no event recorded'
                    : s.reached
                      ? 'reached'
                      : 'not reached'}
              </div>
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
