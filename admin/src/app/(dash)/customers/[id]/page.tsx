'use client';
// The single person page. Leads and "Customers 360" used to be two separate
// screens for the same human; Customer is the superset (every lead resolves to
// one, but a phone-in customer has no lead), so everything lives here now and
// /leads/* redirects in.
//
// Reading order is deliberate:
//   who they are → where they are (journey + call actions) → what has been said
//   → the detail (calls, website enquiries, attribution, raw timeline)
import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, apiFetch } from '@/lib/api';
import { Card, StatCard, StatusBadge, LoanStatusBadge, TableSkeleton, Empty, Callout, Menu } from '@/components/ui';
import { JourneyTracker, stageLabel, stalledLabel, StageProgress, STAGE_CALL_STEPS, LenderTrack, LenderRollup, LenderOffer } from '@/components/journey';
import { CallList, CallAttemptDetail } from '@/components/callDetail';
import { ChannelChips, ConversationCard, asConversations, inferredCount, relTime, hasRealSummary } from '@/components/conversation';
import { ActivityFeed, buildActivityHighlights } from '@/components/activityFeed';
import { inr, inrRupees, dateStr, timeAgo, humanStatus, num } from '@/lib/format';

interface Customer {
  id: string; name?: string | null; phone?: string | null; email?: string | null; city?: string | null;
  firstSource?: string | null; campaignId?: string | null; currentStage: string;
  stageEnteredAt?: string | null; lastActivityAt?: string | null; stalledMinutes?: number | null;
  utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null; referrer?: string | null;
  createdAt?: string | null;
}
interface TimelineEntry {
  id: string; channel: string; name: string; stage?: string | null; stageLabel?: string | null;
  screen?: string | null; metadata?: Record<string, unknown> | null; occurredAt: string;
}
interface CampaignRef {
  id: string; name: string; code?: string; state?: string | null;
  campaign?: { name?: string | null } | null;
  attempts?: number | null; answered?: boolean | null; lastAttemptAt?: string | null; nextEligibleAt?: string | null;
}
interface LeadRef {
  id: string; name?: string | null; phone?: string | null; city?: string | null;
  productInterest?: string | null; amount?: number | null; source: string;
  campaignId?: string | null; referrer?: string | null; status: string;
  note?: string | null; createdAt: string;
}
interface LinkedUser {
  id: string; fullName?: string | null; phone?: string | null; email?: string | null; createdAt?: string;
  dob?: string | null; gender?: string | null; maritalStatus?: string | null; qualification?: string | null;
  employment?: string | null; company?: string | null; monthlyIncome?: number | null; salaryMode?: string | null;
  residenceType?: string | null; addressLine1?: string | null; addressLine2?: string | null; landmark?: string | null;
  city?: string | null; state?: string | null; loanPurpose?: string | null; panNumber?: string | null;
  aadhaarLast4?: string | null; creditScore?: number | null; phoneVerified?: boolean | null; emailVerified?: boolean | null;
  aurixTokenExpiresAt?: string | null;
  applications?: { id: string; ref: string; amount: number; tenureMonths?: number | null; status: string; panNumber?: string | null; createdAt?: string; updatedAt?: string; offers?: LenderOffer[] }[];
  loans?: { id: string; principal: number; outstanding: number; status: string }[];
  // One row per verification method attempted — [] genuinely means "none", not "pending".
  kyc?: { status?: string | null; panVerified?: boolean; aadhaarVerified?: boolean }[] | null;
}
interface NudgeSummary { total: number; delivered: number; failed: number; pending: number; lastError?: string | null }
interface OtpSummary { total: number; consumed: number }
interface NotificationRow { id: string; title: string; body?: string | null; read: boolean; createdAt: string }
interface AppSession { id: string; startedAt: string; endedAt?: string | null; pagesVisited?: number | null; durationSec?: number | null }
interface Detail {
  customer?: Customer;
  timeline?: TimelineEntry[];
  stageProgress?: StageProgress[];
  dropOff?: { stage: string; label?: string; stalledMinutes?: number; isTerminal?: boolean } | null;
  calls?: CallAttemptDetail[];
  campaigns?: CampaignRef[];
  user?: LinkedUser | null;
  applicationSummary?: { lenders: number; submitted: number; approved: number; rejected: number; disbursed: number; inProgress: number };
  device?: { os?: string | null; model?: string | null; appVersion?: string | null; lastSeenAt?: string } | null;
  sessions?: AppSession[];
  otpSummary?: OtpSummary;
  nudgeSummary?: NudgeSummary;
  notifications?: NotificationRow[];
  leads?: LeadRef[];
  nextAction?: string | null;
}

function initials(name?: string | null, phone?: string | null): string {
  const src = (name ?? '').trim();
  if (src) {
    const parts = src.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || src[0].toUpperCase();
  }
  return phone ? phone.slice(-2) : '?';
}

/** Show only the first 2 and last 2 characters — PAN is sensitive, shown masked by default. */
function maskMiddle(value: string): string {
  if (value.length <= 4) return value;
  return value.slice(0, 2) + '•'.repeat(value.length - 4) + value.slice(-2);
}

const CHANNELS = ['push', 'whatsapp', 'sms', 'email', 'voice'] as const;
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost'];

/** Defensive: bare array today, possibly { items: [...] } later. */
function asArray<T>(x: unknown): T[] {
  if (Array.isArray(x)) return x as T[];
  const items = (x as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as T[]) : [];
}

/** A dial result, keyed by which button produced it. */
interface CallState { busy: string | null; key: string | null; ok: boolean; text: string }

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data, error, isLoading, mutate } = useSWR(`/api/admin/customers/${id}`, swrFetcher);
  const d = (data?.data ?? {}) as Detail;
  const c = d.customer;

  // d.timeline is chronological (asc); the activity highlights below are
  // derived from it. The full, filterable log lives on /customers/:id/activity.
  const tl = asArray<TimelineEntry>(d.timeline);

  // Cross-channel conversation history is keyed on the phone number, not the
  // customer id — that is what stitches website, phone and app together. A 404
  // is the normal "we have never spoken to them" case, not an error.
  const digits = (c?.phone ?? '').replace(/\D/g, '');
  const { data: convRes, error: convError, isLoading: convLoading } = useSWR(
    digits ? `/api/admin/conversations/${digits}` : null, swrFetcher,
  );
  const convPayload = (convRes?.data ?? {}) as {
    brief?: string | null; conversationCount?: number | null; channels?: string[] | null; conversations?: unknown;
  };
  const conversations = asConversations(convPayload.conversations);
  const convCount = convPayload.conversationCount ?? conversations.length;
  const convMissing = !!convError && /404|No conversations/i.test((convError as Error).message);
  const inferred = inferredCount(conversations);

  const [nudgeChannel, setNudgeChannel] = useState<string>('push');
  const [nudgeEvent, setNudgeEvent] = useState('');
  const [nudging, setNudging] = useState(false);
  const [nudgeResult, setNudgeResult] = useState<{ ok: boolean; text: string } | null>(null);

  const [call, setCall] = useState<CallState>({ busy: null, key: null, ok: false, text: '' });
  const [wa, setWa] = useState<{ busy: boolean; ok: boolean; text: string }>({ busy: false, ok: false, text: '' });
  // Only offer the button when WhatsApp is actually configured — an action that
  // always fails is worse than no action at all.
  const { data: waStatus } = useSWR('/api/admin/whatsapp/status', swrFetcher);
  const waReady = Boolean((waStatus?.data as { configured?: boolean } | undefined)?.configured);
  const [leadBusy, setLeadBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState('journey');
  const [showPan, setShowPan] = useState(false);

  /**
   * Place a real outbound call, right now.
   *
   * Confirmed first, deliberately: this rings an actual person's phone within
   * seconds and cannot be undone. When `stage` is given the server turns it into
   * the exact drop-off wording, so the agent opens with "you started your KYC
   * but did not finish it" instead of a generic follow-up.
   */
  async function placeCall(key: string, about: string, steps?: { lastStep: string; expectedStep: string }) {
    const phone = c?.phone;
    const who = c?.name || 'this customer';
    if (!phone) return;
    if (!window.confirm(`Call ${who} on ${phone} about ${about}?\n\nThis places a real phone call.`)) return;

    setCall({ busy: key, key, ok: false, text: '' });
    try {
      const res = await apiFetch<{ status?: string; error?: string; id?: string }>(
        '/api/admin/calls/trigger',
        { method: 'POST', body: JSON.stringify({ phone, ...(steps ?? {}) }) },
      );
      const r = res.data ?? {};
      // A provider failure still returns a CallAttempt row (status `failed`), so
      // report what actually happened rather than assuming success from a 2xx.
      const failed = r.status === 'failed';
      setCall({
        busy: null, key, ok: !failed,
        text: failed
          ? `Call failed — ${r.error || 'the provider rejected it'}`
          : `Calling ${phone} about ${about}. The result appears under Voice calls below.`,
      });
      await mutate();
    } catch (e) {
      const msg = (e as Error).message || 'Could not place the call';
      setCall({
        busy: null, key, ok: false,
        text: /403/.test(msg) ? 'Only a super admin can place calls.' : msg,
      });
    }
  }

  /**
   * Send the configured WhatsApp template to this customer.
   *
   * Confirmed like a call: it reaches a real person on a channel they consider
   * personal. Business-initiated messages must use a pre-approved template, so
   * the operator picks the customer, not the wording — the server supplies the
   * template from the Infobip config.
   */
  async function sendWhatsApp() {
    const phone = c?.phone;
    const who = c?.name || 'this customer';
    if (!phone) return;
    if (!window.confirm(`Send the WhatsApp template to ${who} on ${phone}?\n\nThis messages a real person.`)) return;

    setWa({ busy: true, ok: false, text: '' });
    try {
      const res = await apiFetch<{ messageId?: string; providerStatus?: string }>(
        '/api/admin/whatsapp/send',
        { method: 'POST', body: JSON.stringify({ customerId: c?.id, phone }) },
      );
      const r = res.data ?? {};
      setWa({
        busy: false, ok: true,
        text: `WhatsApp queued for ${phone}${r.providerStatus ? ` (${r.providerStatus})` : ''}. It appears in the conversation history once delivered.`,
      });
      await mutate();
    } catch (e) {
      const msg = (e as Error).message || 'Could not send the message';
      setWa({
        busy: false, ok: false,
        text: /403/.test(msg) ? 'Only a super admin can send WhatsApp messages.'
          : /409/.test(msg) ? 'This customer is marked do-not-contact.'
          : msg,
      });
    }
  }

  async function updateLead(leadId: string, patch: { status?: string; note?: string }) {
    setLeadBusy(leadId);
    try { await apiFetch(`/api/admin/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify(patch) }); await mutate(); }
    finally { setLeadBusy(null); }
  }

  async function sendNudge() {
    setNudging(true); setNudgeResult(null);
    try {
      const res = await apiFetch<{ status?: string; id?: string; message?: string }>(
        `/api/admin/customers/${id}/nudge`,
        { method: 'POST', body: JSON.stringify({ channel: nudgeChannel, ...(nudgeEvent ? { eventName: nudgeEvent } : {}) }) },
      );
      const st = res.data?.status ?? 'queued';
      setNudgeResult({ ok: true, text: `Outbound request ${humanStatus(st)}${res.data?.id ? ` · ${res.data.id}` : ''}` });
      mutate();
    } catch (e) {
      setNudgeResult({ ok: false, text: (e as Error).message });
    } finally { setNudging(false); }
  }

  if (error) {
    return <div className="page"><Card><div className="empty">Could not load this customer — {(error as Error).message}
      <div><button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button></div></div></Card></div>;
  }
  if (isLoading || !c) return <div className="page"><TableSkeleton rows={10} /></div>;

  const calls = d.calls ?? [];
  const leads = d.leads ?? [];
  const campaigns = d.campaigns ?? [];
  const user = d.user;
  const applications = user?.applications ?? [];
  const loans = user?.loans ?? [];
  const sessions = d.sessions ?? [];
  const notifications = d.notifications ?? [];
  const nudgeSummary = d.nudgeSummary;
  const stalled = c.stalledMinutes ?? d.dropOff?.stalledMinutes ?? null;
  // The most recent enquiry is what they actually asked us for.
  const lead = leads[0];
  const noPhone = !c.phone;

  // The one application that actually reached "application_submitted" (if
  // any) — everything else that only got to offers_ready was abandoned when
  // the person restarted the funnel, not still in progress.
  const submittedAppId = tl.find((e) => e.name === 'application_submitted')?.metadata?.applicationId as string | undefined;
  const appliedLenderCount = applications.reduce((n, a) => n + (a.offers ?? []).filter((o) => o.applied).length, 0);

  const activityHighlights = buildActivityHighlights({
    timeline: tl, calls, notifications,
    otpSummary: d.otpSummary ?? null, nudgeSummary: nudgeSummary ?? null,
  });

  // Everything below "where they are" used to be one long stack of cards —
  // tabs let the operator jump straight to the section they need instead of
  // scrolling past six others to find it.
  const tabs: { key: string; label: string; count?: number }[] = [
    { key: 'journey', label: 'Journey' },
    ...(applications.length ? [{ key: 'applications', label: 'Applications', count: applications.length }] : []),
    { key: 'conversations', label: 'Conversations', count: convMissing ? 0 : convCount },
    { key: 'calls', label: 'Calls', count: calls.length },
    { key: 'enquiries', label: 'Website enquiries', count: leads.length },
    { key: 'attribution', label: 'Attribution & nudge' },
    ...(loans.length ? [{ key: 'loans', label: 'Loans', count: loans.length }] : []),
  ];

  const callResult = call.text ? (
    <span
      className={`badge ${call.ok ? 'tone-green' : 'tone-red'}`}
      style={{ whiteSpace: 'normal', maxWidth: 300, textAlign: 'left', lineHeight: 1.45 }}
    >
      {call.text}
    </span>
  ) : null;

  const pan = user?.panNumber || applications[0]?.panNumber || '';
  const deviceLine = [d.device?.os, d.device?.model, d.device?.appVersion ? `v${d.device.appVersion}` : null].filter(Boolean).join(' · ');

  return (
    <div className="page">
      <button className="btn" style={{ marginBottom: 14 }} onClick={() => router.push('/customers')}>← Back to customers</button>

      {/* ── who they are ───────────────────────────────────────────────── */}
      <Card>
        <div className="row between wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
          <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
              background: 'var(--brand)', color: '#fff', display: 'grid', placeItems: 'center',
              fontWeight: 800, fontSize: 15,
            }} aria-hidden>{initials(c.name, c.phone)}</div>
            <div>
              <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
                <h1 className="page-title" style={{ fontSize: 19 }}>{c.name || c.phone || 'Unknown customer'}</h1>
                <StatusBadge status={c.currentStage} label={stageLabel(c.currentStage)} />
                {stalled != null && stalled >= 15 && (
                  <span className={`badge ${stalled > 1440 ? 'tone-red' : 'tone-amber'}`}>Stalled {stalledLabel(stalled)}</span>
                )}
              </div>
              <p className="page-sub">
                <span className="mono">{c.phone || 'no phone'}</span>
                {(c.email || user?.email) ? ` · ${c.email || user?.email}` : ''}
                {(c.city || user?.city) ? ` · ${c.city || user?.city}` : ''}
              </p>
              {d.device && (d.device.os || d.device.model) && (
                <p className="page-sub" style={{ marginTop: 2 }}>
                  <span aria-hidden>📱</span> {d.device.os || 'Unknown OS'}{d.device.appVersion ? ` · v${d.device.appVersion}` : ''}
                </p>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8, justifyItems: 'end', minWidth: 200 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-faint)' }}>Next action</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{d.nextAction || '—'}</div>
              {c.stageEnteredAt && <div className="muted" style={{ fontSize: 11 }}>Stage entered {dateStr(c.stageEnteredAt)}</div>}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn btn-primary"
                disabled={noPhone || call.busy === 'whole'}
                title={c.phone ? `Call ${c.phone} now` : 'This customer has no phone number'}
                onClick={() => placeCall('whole', 'where they have got to')}
              >
                {call.busy === 'whole' ? 'Dialling…' : '📞 Call'}
              </button>
              <Menu
                trigger="···"
                items={[
                  ...(user ? [{ key: 'profile', label: 'View full user profile →', onSelect: () => router.push(`/users/${user.id}`) }] : []),
                  ...(waReady ? [{ key: 'wa', label: wa.busy ? 'Sending…' : '💬 Send WhatsApp', disabled: noPhone || wa.busy, onSelect: sendWhatsApp }] : []),
                ]}
              />
            </div>
            {noPhone && <span className="muted" style={{ fontSize: 11.5, textAlign: 'right' }}>No phone number on this customer</span>}
            {wa.text && (
              <span style={{ fontSize: 11.5, textAlign: 'right', color: wa.ok ? 'var(--green)' : 'var(--red)' }}>{wa.text}</span>
            )}
            {call.key === 'whole' && callResult}
          </div>
        </div>

        {/* profile — same card, visually separated by a divider */}
        <div className="facts-grid" style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
          <div><div className="fact-label">Full name</div><div className="fact-value">{user?.fullName || c.name || '—'}</div></div>
          <div><div className="fact-label">Email</div><div className="fact-value">{c.email || user?.email || '—'}</div></div>
          <div>
            <div className="fact-label">Verified</div>
            <div className="fact-value">
              <span style={{ color: user?.phoneVerified ? 'var(--green)' : 'var(--text-faint)' }}>phone {user?.phoneVerified ? 'yes' : 'no'}</span>
              {' · '}
              <span style={{ color: user?.emailVerified ? 'var(--green)' : 'var(--text-faint)' }}>email {user?.emailVerified ? 'yes' : 'no'}</span>
            </div>
          </div>
          <div><div className="fact-label">City</div><div className="fact-value">{c.city || user?.city || lead?.city || '—'}</div></div>
          <div><div className="fact-label">DOB</div><div className="fact-value">{user?.dob ? dateStr(user.dob) : '—'}</div></div>
          <div><div className="fact-label">Credit score</div><div className="fact-value" style={{ color: user?.creditScore ? 'var(--brand)' : undefined }}>{user?.creditScore ?? '—'}</div></div>
          <div><div className="fact-label">Employment</div><div className="fact-value">{user?.employment ? humanStatus(user.employment) : '—'}{user?.company ? ` · ${user.company}` : ''}</div></div>
          <div><div className="fact-label">Qualification</div><div className="fact-value">{user?.qualification || '—'}</div></div>
          <div><div className="fact-label">Salary mode</div><div className="fact-value">{user?.salaryMode || '—'}</div></div>
          <div><div className="fact-label">Residence</div><div className="fact-value">{user?.residenceType ? humanStatus(user.residenceType) : '—'}</div></div>
          <div><div className="fact-label">Address</div><div className="fact-value">{[user?.addressLine1, user?.city, user?.state].filter(Boolean).join(', ') || '—'}</div></div>
          <div><div className="fact-label">Loan purpose</div><div className="fact-value">{user?.loanPurpose || '—'}</div></div>
          <div>
            <div className="fact-label">PAN</div>
            <div className="fact-value mono row" style={{ gap: 6 }}>
              {pan ? (showPan ? pan : maskMiddle(pan)) : '—'}
              {pan && (
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '1px 8px', fontSize: 10.5 }}
                  onClick={() => setShowPan((v) => !v)}
                >
                  {showPan ? 'Hide' : 'Show'}
                </button>
              )}
            </div>
          </div>
          <div><div className="fact-label">Aadhaar last 4</div><div className="fact-value mono">{user?.aadhaarLast4 || 'not set'}</div></div>
          <div><div className="fact-label">Marital status</div><div className="fact-value">{user?.maritalStatus || 'not set'}</div></div>
          <div><div className="fact-label">KYC records</div><div className="fact-value">{user?.kyc?.length ? (user.kyc[0].status || 'pending') : 'none'}</div></div>
          <div><div className="fact-label">Aurix token</div><div className="fact-value">{user?.aurixTokenExpiresAt ? `valid to ${dateStr(user.aurixTokenExpiresAt)}` : 'none'}</div></div>
          <div><div className="fact-label">Device</div><div className="fact-value">{deviceLine || '—'}</div></div>
          <div><div className="fact-label">Last activity</div><div className="fact-value">{c.lastActivityAt ? timeAgo(c.lastActivityAt) : '—'}</div></div>
          <div><div className="fact-label">Source</div><div className="fact-value" style={{ textTransform: 'capitalize' }}>{c.firstSource || 'unknown'}{c.campaignId ? ` · ${c.campaignId}` : ''}</div></div>
          <div><div className="fact-label">Customer id</div><div className="fact-value mono" style={{ fontSize: 11.5 }} title={c.id}>{c.id.slice(0, 8)}…</div></div>
          <div><div className="fact-label">App user id</div><div className="fact-value mono" style={{ fontSize: 11.5 }} title={user?.id}>{user?.id ? `${user.id.slice(0, 8)}…` : '—'}</div></div>
        </div>
      </Card>

      {/* ── funnel numbers at a glance ──────────────────────────────────── */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', marginTop: 16 }}>
        {(() => {
          const primaryApp = applications.find((a) => a.id === submittedAppId) ?? applications[0];
          return (
            <StatCard label="Requested" tone="blue" icon="◎"
              value={primaryApp ? inrRupees(primaryApp.amount) : lead?.amount ? inr(lead.amount) : '—'}
              foot={primaryApp ? `${primaryApp.tenureMonths ?? '—'} months · personal` : lead ? `from their ${lead.source} enquiry` : 'no application yet'} />
          );
        })()}
        <StatCard label="Applications" tone="teal" icon="▤" value={applications.length}
          foot={applications.length ? `${submittedAppId ? 1 : 0} submitted, ${applications.length - (submittedAppId ? 1 : 0)} abandoned` : 'none yet'} />
        <StatCard label="Lender offers" tone={appliedLenderCount ? 'green' : 'grey'} icon="⇢" value={appliedLenderCount}
          foot={appliedLenderCount ? undefined : 'no lender applied to'} />
        <StatCard label="Nudges delivered" icon="↻"
          tone={!nudgeSummary || nudgeSummary.total === 0 ? 'grey' : nudgeSummary.failed === nudgeSummary.total ? 'red' : nudgeSummary.failed > 0 ? 'amber' : 'green'}
          value={nudgeSummary ? `${nudgeSummary.delivered}/${nudgeSummary.total}` : '—'}
          foot={!nudgeSummary || nudgeSummary.total === 0 ? 'none sent' : nudgeSummary.failed === nudgeSummary.total ? 'all dispatches failed' : nudgeSummary.failed > 0 ? `${nudgeSummary.failed} failed` : 'all delivered'} />
      </div>

      {/* ── section tabs — everything below is one section at a time ────── */}
      <div className="tab-bar" style={{ marginTop: 22 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tab-item ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
            {t.count != null && <span className="tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'journey' && (() => {
        const currentStep = (d.stageProgress ?? []).find((s) => s.stage === c.currentStage);
        const currentCallSteps = currentStep ? STAGE_CALL_STEPS[currentStep.stage] : undefined;
        const currentLabel = currentStep ? (currentStep.label || stageLabel(currentStep.stage)) : null;
        const sessionMinutes = Math.round(sessions.reduce((sum, s) => sum + (s.durationSec ?? 0), 0) / 60);
        return (
          <div style={{ marginTop: 18, display: 'grid', gap: 16 }}>
            <Card title="Milestones" sub="Where they got to. Colour + shape tell confirmed from inferred.">
              {call.key && call.key !== 'whole' && callResult && (
                <div style={{ marginBottom: 12 }}>{callResult}</div>
              )}
              <JourneyTracker steps={d.stageProgress ?? []} currentStage={c.currentStage} stalledMinutes={stalled} />
              {currentCallSteps && (
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 14 }}
                  disabled={noPhone || call.busy === currentStep!.stage}
                  title={noPhone ? 'This customer has no phone number' : `Call about "${currentLabel}"`}
                  onClick={() => placeCall(currentStep!.stage, `“${currentLabel}”`, currentCallSteps)}
                >
                  {call.busy === currentStep!.stage ? 'Dialling…' : `📞 Call about “${currentLabel}”`}
                </button>
              )}
            </Card>

            <Card
              title="Activity"
              sub={`What actually happened, in order${sessions.length ? ` · ${sessions.length} app session${sessions.length === 1 ? '' : 's'}, ${sessionMinutes} min total` : ''}`}
            >
              <ActivityFeed highlights={activityHighlights} />
              <button
                className="btn"
                style={{ marginTop: 14 }}
                onClick={() => router.push(`/customers/${id}/activity`)}
              >
                View full activity log ({tl.length} events) →
              </button>
            </Card>
          </div>
        );
      })()}

      {/* ── applications (the single, consolidated list) ────────────────── */}
      {activeTab === 'applications' && applications.length > 0 && (() => {
        const withLender = applications.filter((a) => (a.offers ?? []).some((o) => o.applied));
        const plain = applications.filter((a) => !(a.offers ?? []).some((o) => o.applied));
        const submittedRef = applications.find((a) => a.id === submittedAppId)?.ref;
        return (
          <div style={{ marginTop: 18 }}>
            <Card
              title="Applications"
              sub="Each lender application runs its own journey after submission. Tap any to open its full detail."
            >
              {d.applicationSummary && d.applicationSummary.submitted > 0 && (
                <div style={{ marginBottom: 14 }}><LenderRollup s={d.applicationSummary} /></div>
              )}
              {withLender.map((a) => (a.offers ?? []).filter((o) => o.applied).map((o) => <LenderTrack key={o.id} offer={{ ...o, applicationId: a.id }} />))}
              {plain.length > 0 && (
                <div className="table-wrap">
                  <table className="data">
                    <thead><tr><th>Reference</th><th>Amount</th><th>Tenure</th><th>Status</th><th>Note</th></tr></thead>
                    <tbody>
                      {plain.map((a) => {
                        const isSubmitted = a.id === submittedAppId;
                        const note = isSubmitted
                          ? `Submitted, awaiting lender${a.createdAt ? ` · ${dateStr(a.createdAt)}` : ''}`
                          : submittedAppId
                            ? `Abandoned${a.updatedAt ? ` · ${dateStr(a.updatedAt)}` : ''}`
                            : a.updatedAt ? `Last updated ${dateStr(a.updatedAt)}` : '—';
                        return (
                          <tr key={a.id} onClick={() => router.push(`/loans/${a.id}`)}>
                            <td className="mono">{a.ref}</td>
                            <td className="mono">{inrRupees(a.amount)}</td>
                            <td>{a.tenureMonths ? `${a.tenureMonths} mo` : '—'}</td>
                            <td>{isSubmitted || !submittedAppId ? <LoanStatusBadge status={a.status} /> : <span className="badge tone-grey">Abandoned</span>}</td>
                            <td className="muted" style={{ fontSize: 12 }}>{note}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {applications.length > 1 && appliedLenderCount === 0 && (
                <Callout>
                  {submittedRef
                    ? `Only ${submittedRef} was submitted. All ${applications.length} sit at their current status with zero lenders applied to, and nothing has been disbursed.`
                    : `All ${applications.length} applications sit at their current status with zero lenders applied to.`}
                </Callout>
              )}
            </Card>
          </div>
        );
      })()}

      {/* ── what has been said ─────────────────────────────────────────── */}
      {activeTab === 'conversations' && (
      <div style={{ marginTop: 18 }}>
        <Card
          title="Conversation history"
          sub={!digits
            ? 'No phone number, so nothing can be stitched together.'
            : convCount > 0 && !convMissing
              ? `Across ${num(Array.isArray(convPayload.channels) ? convPayload.channels.length : 0)} channel(s) · last activity ${relTime(conversations[0]?.startedAt)}`
              : 'Phone, website and app — stitched together for this number.'}
        >
          {!digits ? (
            <Empty label="This customer has no phone number" />
          ) : convLoading ? (
            <TableSkeleton rows={3} cols={3} />
          ) : convError && !convMissing ? (
            <div className="empty" style={{ color: 'var(--red)' }}>Could not load conversations — {(convError as Error).message}</div>
          ) : convMissing || convCount === 0 ? (
            <Empty label="We have never spoken to this person — no calls, chats or app conversations recorded." />
          ) : (
            <>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-dim)', marginBottom: 5 }}>
                  What we know about this person
                </div>
                {convPayload.brief
                  ? <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.65 }}>{convPayload.brief}</div>
                  : <p className="muted" style={{ fontSize: 12.5 }}>No rolling brief yet for this number.</p>}
              </div>

              <div className="row wrap" style={{ gap: 5, marginTop: 14 }}>
                <ChannelChips channels={convPayload.channels} />
              </div>

              {inferred > 0 && (
                <div className="empty" style={{ textAlign: 'left', color: 'var(--amber)', marginTop: 14 }}>
                  {inferred} of these outcome{inferred === 1 ? '' : 's'} {inferred === 1 ? 'was' : 'were'} inferred by keyword-matching the transcript, not confirmed by the agent. Verify before acting on {inferred === 1 ? 'it' : 'them'}.
                </div>
              )}

              <div style={{ marginTop: 6 }}>
                {conversations.map((cv) => <ConversationCard key={cv.id} c={cv} />)}
              </div>

              {(() => {
                const noSummaryCount = conversations.filter((cv) => !hasRealSummary(cv.summary)).length;
                const chs = Array.isArray(convPayload.channels) ? (convPayload.channels as string[]) : [];
                const voiceOnly = chs.length > 0 && chs.every((ch) => ch.startsWith('phone'));
                if (!voiceOnly && noSummaryCount === 0) return null;
                return (
                  <Callout>
                    {voiceOnly && 'No website or WhatsApp conversations recorded — this customer is voice-only.'}
                    {voiceOnly && noSummaryCount > 0 && ' '}
                    {noSummaryCount > 0 && `${noSummaryCount} of ${conversations.length} conversation${conversations.length === 1 ? '' : 's'} never produced a usable summary.`}
                  </Callout>
                );
              })()}
            </>
          )}
        </Card>
      </div>
      )}

      {/* ── voice calls ────────────────────────────────────────────────── */}
      {activeTab === 'calls' && (
      <div style={{ marginTop: 18 }}>
        <Card title="Voice calls" sub="Every outbound voice attempt, with what the agent knew and what it reported back">
          <CallList calls={calls} emptyLabel="No voice calls placed to this customer" />
          {(() => {
            if (calls.length < 2) return null;
            const connected = calls.filter((cl) => cl.status === 'completed' && cl.answered).length;
            const failed = calls.length - connected;
            if (failed === 0) return null;
            return (
              <Callout tone={connected === 0 ? 'red' : 'amber'}>
                {connected} of {calls.length} call{calls.length === 1 ? '' : 's'} connected; {failed} failed to connect.
              </Callout>
            );
          })()}
        </Card>
      </div>
      )}

      {/* ── website enquiries (the old leads page, inline) ─────────────── */}
      {activeTab === 'enquiries' && (
      <div style={{ marginTop: 18 }}>
        <Card title="Website enquiries" sub="Everything they submitted through the site or widget, matched by phone">
          {leads.length === 0 ? <Empty label="No website enquiries from this number" /> : (
            <div style={{ display: 'grid', gap: 0 }}>
              {leads.map((l) => (
                <div key={l.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                  <div className="row between wrap" style={{ gap: 10 }}>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <StatusBadge status={l.status} />
                      <span className="badge tone-grey" style={{ textTransform: 'capitalize' }}>{l.source}</span>
                      {l.campaignId && <span className="badge tone-grey mono">{l.campaignId}</span>}
                      <span style={{ fontSize: 12.5, textTransform: 'capitalize' } as React.CSSProperties}>
                        {l.productInterest || 'no stated interest'}
                      </span>
                      {l.amount ? <span className="mono" style={{ fontSize: 12.5 }}>{inr(l.amount)}</span> : null}
                    </div>
                    <span className="muted" style={{ fontSize: 12 }} title={l.createdAt}>
                      {dateStr(l.createdAt)} · {timeAgo(l.createdAt)}
                    </span>
                  </div>

                  {l.referrer && (
                    <p className="mono muted" style={{ fontSize: 11, marginTop: 6, wordBreak: 'break-all' }}>referrer: {l.referrer}</p>
                  )}

                  {/* inline status editor, preserved from the old leads page */}
                  <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
                    {LEAD_STATUSES.map((s) => (
                      <button
                        key={s}
                        className={`chip-filter ${l.status === s ? 'active' : ''}`}
                        disabled={leadBusy === l.id}
                        onClick={() => updateLead(l.id, { status: s })}
                      >
                        {humanStatus(s)}
                      </button>
                    ))}
                  </div>

                  <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'flex-start' }}>
                    <textarea
                      className="input"
                      style={{ minHeight: 46, resize: 'vertical' }}
                      placeholder="Add a note about this enquiry…"
                      value={notes[l.id] ?? l.note ?? ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [l.id]: e.target.value }))}
                    />
                    <button
                      className="btn"
                      disabled={leadBusy === l.id || (notes[l.id] ?? l.note ?? '') === (l.note ?? '')}
                      onClick={() => updateLead(l.id, { note: notes[l.id] ?? '' })}
                    >
                      {leadBusy === l.id ? 'Saving…' : 'Save note'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      )}

      {/* ── attribution + nudge ────────────────────────────────────────── */}
      {activeTab === 'attribution' && (
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', marginTop: 18, alignItems: 'start' }}>
        <Card title="Origin & attribution">
          {[
            ['First source', c.firstSource || '—'],
            ['Campaign', campaigns.map((x) => x.campaign?.name ?? x.name).join(', ') || c.campaignId || '—'],
            ['UTM source', c.utmSource || '—'],
            ['UTM medium', c.utmMedium || '—'],
            ['UTM campaign', c.utmCampaign || '—'],
            ['Referrer', c.referrer || lead?.referrer || '—'],
          ].map(([k, v], i, arr) => (
            <div key={k} className="row between" style={{ padding: '7px 0', borderBottom: i < arr.length - 1 || campaigns.length > 0 ? '1px solid var(--border)' : undefined }}>
              <span className="muted">{k}</span><b className="mono" style={{ fontSize: 12, textAlign: 'right', wordBreak: 'break-all' }}>{v}</b>
            </div>
          ))}
          {campaigns.map((cc) => (
            <div key={cc.id} className="row between" style={{ padding: '7px 0' }}>
              <span className="muted">Campaign attempt</span>
              <span style={{ fontSize: 12, textAlign: 'right' }}>
                <StatusBadge status={cc.state ?? undefined} /> {cc.attempts != null ? `· ${cc.attempts} attempt${cc.attempts === 1 ? '' : 's'}` : ''} {cc.answered === false ? '· not answered' : cc.answered ? '· answered' : ''}
              </span>
            </div>
          ))}
        </Card>

        <Card title="Send nudge" sub="Re-engage this customer through Upshot">
          {nudgeSummary && nudgeSummary.total > 0 && (
            <Callout tone={nudgeSummary.failed === nudgeSummary.total ? 'red' : nudgeSummary.failed > 0 ? 'amber' : 'blue'}>
              {nudgeSummary.delivered} of {nudgeSummary.total} past nudge{nudgeSummary.total === 1 ? '' : 's'} delivered.
              {nudgeSummary.failed > 0 && ` ${nudgeSummary.failed} failed${nudgeSummary.lastError ? ` — ${nudgeSummary.lastError}` : ''}.`}
            </Callout>
          )}
          <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginTop: nudgeSummary && nudgeSummary.total > 0 ? 14 : 0 }}>Channel</label>
          <div className="row wrap" style={{ gap: 8, margin: '8px 0 14px' }}>
            {CHANNELS.map((ch) => (
              <button key={ch} className={`chip-filter ${nudgeChannel === ch ? 'active' : ''}`} onClick={() => { setNudgeChannel(ch); setNudgeResult(null); }}>
                {humanStatus(ch)}
              </button>
            ))}
          </div>
          <label style={{ fontSize: 12.5, fontWeight: 600 }}>Event name <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
          <input className="input mono" style={{ margin: '6px 0 14px' }} value={nudgeEvent} onChange={(e) => setNudgeEvent(e.target.value)} placeholder="e.g. resume_application" />
          <div className="row" style={{ gap: 10 }}>
            <button className="btn btn-primary" disabled={nudging} onClick={sendNudge}>{nudging ? 'Sending…' : 'Send nudge'}</button>
            {nudgeResult && <span style={{ fontSize: 12.5, color: nudgeResult.ok ? 'var(--green)' : 'var(--red)' }}>{nudgeResult.text}</span>}
          </div>
        </Card>
      </div>
      )}

      {/* ── loans (disbursed) ──────────────────────────────────────────── */}
      {activeTab === 'loans' && loans.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <Card title="Loans" sub="Disbursed loans for the linked user">
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Principal</th><th>Outstanding</th><th>Status</th></tr></thead>
              <tbody>{loans.map((l) => (
                <tr key={l.id}><td className="mono">{inrRupees(l.principal)}</td><td className="mono">{inrRupees(l.outstanding)}</td><td><LoanStatusBadge status={l.status} /></td></tr>
              ))}</tbody>
            </table></div>
          </Card>
        </div>
      )}
    </div>
  );
}
