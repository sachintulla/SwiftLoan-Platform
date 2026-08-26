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
import { Card, StatCard, StatusBadge, LoanStatusBadge, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { JourneyTracker, ChannelBadge, stageLabel, stalledLabel, StageProgress, STAGE_CALL_STEPS, LenderTrack, LenderRollup, LenderOffer } from '@/components/journey';
import { CallList, CallAttemptDetail } from '@/components/callDetail';
import { ChannelChips, ConversationCard, asConversations, inferredCount, relTime } from '@/components/conversation';
import { inr, dateStr, timeAgo, humanStatus, num } from '@/lib/format';

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
interface CampaignRef { id: string; name: string; code?: string; state?: string | null }
interface LeadRef {
  id: string; name?: string | null; phone?: string | null; city?: string | null;
  productInterest?: string | null; amount?: number | null; source: string;
  campaignId?: string | null; referrer?: string | null; status: string;
  note?: string | null; createdAt: string;
}
interface LinkedUser {
  id: string; fullName?: string | null; phone?: string | null; email?: string | null; createdAt?: string;
  applications?: { id: string; ref: string; amount: number; status: string; createdAt?: string; offers?: LenderOffer[] }[];
  loans?: { id: string; principal: number; outstanding: number; status: string }[];
  kyc?: { status?: string | null; panVerified?: boolean; aadhaarVerified?: boolean } | null;
}
interface Detail {
  customer?: Customer;
  timeline?: TimelineEntry[];
  stageProgress?: StageProgress[];
  dropOff?: { stage: string; label?: string; stalledMinutes?: number; isTerminal?: boolean } | null;
  calls?: CallAttemptDetail[];
  campaigns?: CampaignRef[];
  user?: LinkedUser | null;
  applicationSummary?: { lenders: number; submitted: number; approved: number; rejected: number; disbursed: number; inProgress: number };
  leads?: LeadRef[];
  nextAction?: string | null;
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

  // paginated timeline (falls back to the inline timeline on page 1 if the
  // paginated call has not resolved yet)
  const [tPage, setTPage] = useState(1);
  const { data: tRes } = useSWR(`/api/admin/customers/${id}/timeline?page=${tPage}&pageSize=50`, swrFetcher);
  const timeline = asArray<TimelineEntry>(tRes?.data ?? d.timeline);
  const tPg = tRes?.pagination;

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
  const stalled = c.stalledMinutes ?? d.dropOff?.stalledMinutes ?? null;
  // The most recent enquiry is what they actually asked us for.
  const lead = leads[0];
  const noPhone = !c.phone;

  const callResult = call.text ? (
    <span
      className={`badge ${call.ok ? 'tone-green' : 'tone-red'}`}
      style={{ whiteSpace: 'normal', maxWidth: 300, textAlign: 'left', lineHeight: 1.45 }}
    >
      {call.text}
    </span>
  ) : null;

  return (
    <div className="page">
      <button className="btn" style={{ marginBottom: 14 }} onClick={() => router.push('/customers')}>← Back to customers</button>

      {/* ── who they are ───────────────────────────────────────────────── */}
      <div className="row between wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">
            {c.name || c.phone || 'Unknown customer'}{' '}
            <StatusBadge status={c.currentStage} label={stageLabel(c.currentStage)} />
          </h1>
          <p className="page-sub">
            <span className="mono">{c.phone || 'no phone'}</span>
            {c.email ? ` · ${c.email}` : ''}{c.city ? ` · ${c.city}` : ''}
            {` · from ${c.firstSource || 'unknown source'}`}
            {c.createdAt ? ` · first seen ${dateStr(c.createdAt)}` : ''}
          </p>
        </div>

        <div style={{ display: 'grid', gap: 6, justifyItems: 'end', minWidth: 220 }}>
          <button
            className="btn btn-primary"
            disabled={noPhone || call.busy === 'whole'}
            title={c.phone ? `Call ${c.phone} now` : 'This customer has no phone number'}
            onClick={() => placeCall('whole', 'where they have got to')}
          >
            {call.busy === 'whole' ? 'Dialling…' : '📞 Call now'}
          </button>
          {waReady && (
            <button
              className="btn"
              disabled={noPhone || wa.busy}
              title={c.phone ? `Send the WhatsApp template to ${c.phone}` : 'This customer has no phone number'}
              onClick={sendWhatsApp}
            >
              {wa.busy ? 'Sending…' : '💬 WhatsApp'}
            </button>
          )}
          <span className="muted" style={{ fontSize: 11.5, textAlign: 'right', lineHeight: 1.4 }}>
            {noPhone
              ? 'No phone number on this customer'
              : <>Rings {c.phone} within seconds.<br />The agent gets the full history first.</>}
          </span>
          {wa.text && (
            <span style={{ fontSize: 11.5, textAlign: 'right', color: wa.ok ? 'var(--ok, #128f5b)' : 'var(--bad, #c0392b)' }}>
              {wa.text}
            </span>
          )}
          {call.key === 'whole' && callResult}
        </div>
      </div>

      {/* ── what they asked for ────────────────────────────────────────── */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', marginTop: 16 }}>
        <StatCard label="Loan interest" tone="blue" icon="₹"
          value={<span style={{ textTransform: 'capitalize' } as React.CSSProperties}>{lead?.productInterest || '—'}</span>}
          foot={lead ? `from their ${lead.source} enquiry` : 'no website enquiry'} />
        <StatCard label="Amount" value={lead?.amount ? inr(lead.amount) : '—'} tone="teal" icon="◎" />
        <StatCard label="Source" tone="amber" icon="⇢"
          value={<span style={{ textTransform: 'capitalize' } as React.CSSProperties}>{c.firstSource || 'unknown'}</span>}
          foot={campaigns[0]?.name || c.campaignId || undefined} />
        <StatCard label="City" value={c.city || lead?.city || '—'} tone="grey" icon="⌖" />
        <StatCard label="Stalled for" value={stalledLabel(stalled)} icon="⏱"
          tone={(stalled ?? 0) > 1440 ? 'red' : (stalled ?? 0) > 60 ? 'amber' : 'green'}
          foot={d.dropOff?.isTerminal ? 'terminal stage' : d.dropOff?.label ? `at ${d.dropOff.label}` : undefined} />
      </div>

      {/* ── where they are ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <Card
          title="Journey"
          sub="Where they got to, and what to call them about. Each step dials with that exact drop-off."
          right={d.nextAction ? <span className="badge tone-teal" title="Suggested next action">{d.nextAction}</span> : undefined}
        >
          {call.key && call.key !== 'whole' && callResult && (
            <div style={{ marginBottom: 12 }}>{callResult}</div>
          )}
          <JourneyTracker
            steps={d.stageProgress ?? []}
            currentStage={c.currentStage}
            stalledMinutes={stalled}
            action={(step, isCurrent) => {
              const steps = STAGE_CALL_STEPS[step.stage];
              // No mapping means there is nothing to nudge them towards
              // (disbursed / rejected / lost) — offering a call would be noise.
              if (!steps) return null;
              const label = step.label || stageLabel(step.stage);
              return (
                <button
                  className={`btn ${isCurrent ? 'btn-primary' : ''}`}
                  style={isCurrent ? undefined : { padding: '4px 10px', fontSize: 11.5, opacity: .85 }}
                  disabled={noPhone || call.busy === step.stage}
                  title={noPhone ? 'This customer has no phone number' : `Call about "${label}"`}
                  onClick={() => placeCall(step.stage, `“${label}”`, steps)}
                >
                  {call.busy === step.stage ? 'Dialling…' : isCurrent ? '📞 Call about this' : '📞 Call'}
                </button>
              );
            }}
          />
        </Card>
      </div>

      {/* ── lender applications (independent journeys + roll-up) ────────── */}
      {d.applicationSummary && d.applicationSummary.submitted > 0 && (
        <div style={{ marginTop: 16 }}>
          <Card
            title={`Lender applications (${d.applicationSummary.submitted})`}
            sub="After submission the journey continues independently for each lender. Statuses match what the customer sees in the app."
          >
            <div style={{ marginBottom: 14 }}><LenderRollup s={d.applicationSummary} /></div>
            {(d.user?.applications ?? [])
              .flatMap((a) => (a.offers ?? []).filter((o) => o.applied))
              .map((o) => <LenderTrack key={o.id} offer={o} />)}
          </Card>
        </div>
      )}

      {/* ── what has been said ─────────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <Card
          title={`Conversation history (${num(convMissing ? 0 : convCount)})`}
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
            </>
          )}
        </Card>
      </div>

      {/* ── voice calls ────────────────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <Card title={`Voice calls (${calls.length})`} sub="Every outbound voice attempt, with what the agent knew and what it reported back">
          <CallList calls={calls} emptyLabel="No voice calls placed to this customer" />
        </Card>
      </div>

      {/* ── website enquiries (the old leads page, inline) ─────────────── */}
      <div style={{ marginTop: 16 }}>
        <Card title={`Website enquiries (${leads.length})`} sub="Everything they submitted through the site or widget, matched by phone">
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

      {/* ── attribution + nudge ────────────────────────────────────────── */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', marginTop: 16, alignItems: 'start' }}>
        <Card title="Origin & attribution">
          {[
            ['First source', c.firstSource || '—'],
            ['Campaign', campaigns.map((x) => x.name).join(', ') || c.campaignId || '—'],
            ['UTM source', c.utmSource || '—'],
            ['UTM medium', c.utmMedium || '—'],
            ['UTM campaign', c.utmCampaign || '—'],
            ['Referrer', c.referrer || lead?.referrer || '—'],
          ].map(([k, v], i, arr) => (
            <div key={k} className="row between" style={{ padding: '7px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : undefined }}>
              <span className="muted">{k}</span><b className="mono" style={{ fontSize: 12, textAlign: 'right', wordBreak: 'break-all' }}>{v}</b>
            </div>
          ))}
        </Card>

        <Card title="Send nudge" sub="Re-engage this customer through Upshot">
          <label style={{ fontSize: 12.5, fontWeight: 600 }}>Channel</label>
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

      {/* ── linked app account ─────────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <Card
          title="App account"
          sub={user ? 'Applications, loans and KYC for the linked user' : undefined}
          right={user ? <button className="btn" onClick={() => router.push(`/users/${user.id}`)}>View profile →</button> : undefined}
        >
          {!user ? <Empty label="This customer has not signed up in the app yet" /> : (
            <>
              <div className="row wrap" style={{ gap: 16, marginBottom: 14 }}>
                <b>{user.fullName || user.phone}</b>
                <span className="muted mono" style={{ fontSize: 12 }}>{user.phone}</span>
                {user.createdAt && <span className="muted" style={{ fontSize: 12 }}>joined {dateStr(user.createdAt)}</span>}
                {user.kyc && (
                  <span className="row" style={{ gap: 8 }}>
                    <span className="muted" style={{ fontSize: 12 }}>KYC</span>
                    <StatusBadge status={user.kyc.status || 'pending'} />
                    {user.kyc.panVerified && <span className="badge tone-green">PAN</span>}
                    {user.kyc.aadhaarVerified && <span className="badge tone-green">Aadhaar</span>}
                  </span>
                )}
              </div>

              <div className="muted" style={{ fontSize: 12, margin: '4px 0 6px' }}>Applications</div>
              {(user.applications ?? []).length === 0 ? <Empty label="No applications" /> : (
                <div className="table-wrap"><table className="data">
                  <thead><tr><th>Ref</th><th>Amount</th><th>Status</th><th>Created</th></tr></thead>
                  <tbody>{user.applications!.map((a) => (
                    <tr key={a.id} onClick={() => router.push(`/loans/${a.id}`)}>
                      <td className="mono">{a.ref}</td><td className="mono">{inr(a.amount)}</td>
                      <td><LoanStatusBadge status={a.status} /></td><td className="muted">{a.createdAt ? dateStr(a.createdAt) : '—'}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}

              {(user.loans ?? []).length > 0 && (
                <>
                  <div className="muted" style={{ fontSize: 12, margin: '14px 0 6px' }}>Loans</div>
                  <div className="table-wrap"><table className="data">
                    <thead><tr><th>Principal</th><th>Outstanding</th><th>Status</th></tr></thead>
                    <tbody>{user.loans!.map((l) => (
                      <tr key={l.id}><td className="mono">{inr(l.principal)}</td><td className="mono">{inr(l.outstanding)}</td><td><StatusBadge status={l.status} /></td></tr>
                    ))}</tbody>
                  </table></div>
                </>
              )}
            </>
          )}
        </Card>
      </div>

      {/* ── raw timeline ───────────────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <Card title="Timeline" sub="Every tracked touchpoint, newest first">
          {timeline.length === 0 ? <Empty label="No activity recorded for this customer yet" /> : (
            <div style={{ display: 'grid', gap: 2 }}>
              {timeline.map((e) => (
                <div key={e.id} className="row" style={{ gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <ChannelBadge channel={e.channel} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{humanStatus(e.name)}</span>
                  {e.stage && <span className="badge tone-grey">{e.stageLabel || stageLabel(e.stage)}</span>}
                  {e.screen && <span className="muted" style={{ fontSize: 12 }}>· {e.screen}</span>}
                  <span className="spacer" />
                  <span className="muted mono" style={{ fontSize: 11.5 }} title={e.occurredAt}>{timeAgo(e.occurredAt)}</span>
                </div>
              ))}
            </div>
          )}
          {tPg && <Pagination page={tPg.page} totalPages={tPg.totalPages} onPage={setTPage} />}
        </Card>
      </div>
    </div>
  );
}
