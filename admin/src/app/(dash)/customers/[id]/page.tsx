'use client';
import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, apiFetch } from '@/lib/api';
import { Card, StatCard, StatusBadge, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { JourneyTracker, ChannelBadge, stageLabel, stalledLabel, StageProgress } from '@/components/journey';
import { CallList, CallAttemptDetail } from '@/components/callDetail';
import { inr, dateStr, timeAgo, humanStatus } from '@/lib/format';

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
interface LeadRef { id: string; name?: string | null; phone?: string | null; source: string; status: string; createdAt: string }
interface LinkedUser {
  id: string; fullName?: string | null; phone?: string | null; email?: string | null; createdAt?: string;
  applications?: { id: string; ref: string; amount: number; status: string; createdAt?: string }[];
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
  leads?: LeadRef[];
  nextAction?: string | null;
}

const CHANNELS = ['push', 'whatsapp', 'sms', 'email', 'voice'] as const;

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
  const timeline = ((tRes?.data as TimelineEntry[] | undefined) ?? d.timeline ?? []);
  const tPg = tRes?.pagination;

  const [nudgeChannel, setNudgeChannel] = useState<string>('push');
  const [nudgeEvent, setNudgeEvent] = useState('');
  const [nudging, setNudging] = useState(false);
  const [nudgeResult, setNudgeResult] = useState<{ ok: boolean; text: string } | null>(null);

  if (error) {
    return <div className="page"><Card><div className="empty">Could not load this customer — {(error as Error).message}
      <div><button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button></div></div></Card></div>;
  }
  if (isLoading || !c) return <div className="page"><TableSkeleton rows={10} /></div>;

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

  const calls = d.calls ?? [];
  const leads = d.leads ?? [];
  const campaigns = d.campaigns ?? [];
  const user = d.user;
  const stalled = c.stalledMinutes ?? d.dropOff?.stalledMinutes ?? null;

  return (
    <div className="page">
      <button className="btn" style={{ marginBottom: 14 }} onClick={() => router.back()}>← Back to customers</button>

      <div className="row between wrap">
        <div>
          <h1 className="page-title">
            {c.name || c.phone || 'Unknown customer'}{' '}
            <StatusBadge status={c.currentStage} label={stageLabel(c.currentStage)} />
          </h1>
          <p className="page-sub">
            <span className="mono">{c.phone || 'no phone'}</span>
            {c.email ? ` · ${c.email}` : ''}{c.city ? ` · ${c.city}` : ''}
            {c.createdAt ? ` · first seen ${dateStr(c.createdAt)}` : ''}
          </p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', marginTop: 16 }}>
        <StatCard label="Current stage" value={stageLabel(c.currentStage)} tone="blue" icon="◎"
          foot={c.stageEnteredAt ? `since ${timeAgo(c.stageEnteredAt)}` : undefined} />
        <StatCard label="Stalled for" value={stalledLabel(stalled)} icon="⏱"
          tone={(stalled ?? 0) > 1440 ? 'red' : (stalled ?? 0) > 60 ? 'amber' : 'green'}
          foot={d.dropOff?.isTerminal ? 'terminal stage' : d.dropOff?.label ? `dropped at ${d.dropOff.label}` : undefined} />
        <StatCard label="Origin" value={<span style={{ textTransform: 'capitalize' } as React.CSSProperties}>{c.firstSource || 'unknown'}</span>} tone="teal" icon="⇢"
          foot={campaigns[0]?.name || c.campaignId || undefined} />
        <StatCard label="Last activity" value={c.lastActivityAt ? timeAgo(c.lastActivityAt) : '—'} tone="grey" icon="•" />
      </div>

      {d.nextAction && (
        <Card>
          <div className="row" style={{ gap: 12 }}>
            <span className="badge tone-teal">Next action</span>
            <b style={{ fontSize: 13.5 }}>{d.nextAction}</b>
          </div>
        </Card>
      )}

      <div className="grid" style={{ gridTemplateColumns: '340px 1fr', marginTop: 16, alignItems: 'start' }}>
        {/* journey */}
        <Card title="Journey" sub="Canonical stage progression">
          <JourneyTracker steps={d.stageProgress ?? []} currentStage={c.currentStage} />
        </Card>

        {/* timeline */}
        <Card title="Timeline" sub="Every tracked touchpoint, oldest first">
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

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 16, alignItems: 'start' }}>
        {/* attribution */}
        <Card title="Origin & attribution">
          {[
            ['First source', c.firstSource || '—'],
            ['Campaign', campaigns.map((x) => x.name).join(', ') || c.campaignId || '—'],
            ['UTM source', c.utmSource || '—'],
            ['UTM medium', c.utmMedium || '—'],
            ['UTM campaign', c.utmCampaign || '—'],
            ['Referrer', c.referrer || '—'],
          ].map(([k, v], i, arr) => (
            <div key={k} className="row between" style={{ padding: '7px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : undefined }}>
              <span className="muted">{k}</span><b className="mono" style={{ fontSize: 12, textAlign: 'right', wordBreak: 'break-all' }}>{v}</b>
            </div>
          ))}
        </Card>

        {/* nudge */}
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

      {/* voice calls */}
      <div style={{ marginTop: 16 }}>
        <Card title={`Voice calls (${calls.length})`} sub="Every outbound voice attempt, with what the agent knew and what it reported back">
          <CallList calls={calls} emptyLabel="No voice calls placed to this customer" />
        </Card>
      </div>

      {/* linked app account */}
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
                    <td><StatusBadge status={a.status} /></td><td className="muted">{a.createdAt ? dateStr(a.createdAt) : '—'}</td>
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

      {/* matched website leads */}
      <div style={{ marginTop: 16 }}>
      <Card title={`Website leads (${leads.length})`} sub="Leads matched to this customer by phone">
        {leads.length === 0 ? <Empty label="No website leads matched" /> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Name</th><th>Phone</th><th>Source</th><th>Status</th><th>Captured</th></tr></thead>
            <tbody>{leads.map((l) => (
              <tr key={l.id} onClick={() => router.push(`/leads/${l.id}`)}>
                <td>{l.name || <span className="muted">Anonymous</span>}</td>
                <td className="mono">{l.phone || '—'}</td>
                <td><span className="badge tone-grey">{l.source}</span></td>
                <td><StatusBadge status={l.status} /></td>
                <td className="muted">{dateStr(l.createdAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      </div>
    </div>
  );
}
