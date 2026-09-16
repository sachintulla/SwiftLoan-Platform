'use client';
import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, apiFetch, ApiError } from '@/lib/api';
import {
  Card, StatusBadge, Pagination, TableSkeleton, Empty, ConfirmDialog, Menu, SearchBox,
} from '@/components/ui';
import { HorizontalBarList, SegmentedProgressBar } from '@/components/viz';
import { inr, dateStr, num, timeAgo } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import CampaignBuilder from '@/components/CampaignBuilder';
import {
  Campaign, RetryStrategy, summarise, minutesToTime, daysLabel, tzAbbrev, zonedDateLabel,
} from '@/lib/campaign';

interface Contact {
  id: string; name?: string | null; phone: string; city?: string | null;
  product?: string | null; amount?: number | null; state: string; error?: string | null;
  attempts?: number | null; lastAttemptAt?: string | null; nextEligibleAt?: string | null; answered?: boolean | null;
}
interface Progress { answered: number; noConnect: number; pending: number; failed: number; skipped: number; total: number; dialled: number }
interface Stats {
  contactsByState?: Record<string, number>;
  callsByOutcome?: Record<string, number>;
  callsByStatus?: Record<string, number>;
  progress?: Progress;
  running?: boolean;
}
interface SchedulePreview {
  canDial?: boolean; reason?: string; detail?: string; nextOpening?: string | null;
}

const EMPTY_PROGRESS: Progress = { answered: 0, noConnect: 0, pending: 0, failed: 0, skipped: 0, total: 0, dialled: 0 };

/** '9182922731' -> '+91 91829 22731' — readable without pretending it's a
 * different format than what's actually stored (bare 10-digit). */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return phone;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

/** One label that folds ContactState + the answered flag into the single
 * human concept an admin actually asks about — "did this person pick up?" —
 * rather than the raw pending/queued/called/failed/skipped enum. */
function contactStatusKey(c: Contact): 'answered' | 'no_answer' | 'failed' | 'skipped' | 'pending' {
  if (c.answered) return 'answered';
  if (c.state === 'failed') return 'failed';
  if (c.state === 'called') return 'no_answer';
  if (c.state === 'skipped') return 'skipped';
  return 'pending';
}
const ROW_LABEL: Record<string, string> = {
  answered: 'Answered', no_answer: 'No answer', failed: 'Failed', skipped: 'Skipped', pending: 'Pending',
};

type ContactFilter = 'all' | 'answered' | 'no_connect' | 'pending' | 'failed';

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState<ContactFilter>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 300);

  const qs = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (filter !== 'all') qs.set('filter', filter);
  if (debouncedSearch.trim()) qs.set('search', debouncedSearch.trim());
  const { data, error, isLoading, mutate } = useSWR(
    `/api/admin/campaigns/${id}?${qs.toString()}`,
    swrFetcher,
    { keepPreviousData: true },
  );

  const payload = (data?.data ?? {}) as {
    campaign?: Campaign; counts?: Record<string, number>; outcomes?: Record<string, number>;
    callStatus?: Record<string, number>; progress?: Progress; contacts?: Contact[]; running?: boolean;
  };
  const campaign = payload.campaign;
  const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
  const pg = data?.pagination;

  const running = campaign?.status === 'running' || payload.running === true;

  const { data: statsRes, mutate: mutateStats } = useSWR(
    campaign ? `/api/admin/campaigns/${id}/stats` : null,
    swrFetcher,
    { refreshInterval: running ? 5000 : 0 },
  );
  const stats = (statsRes?.data ?? {}) as Stats;
  // The main list call above already carries a `progress` snapshot from the
  // same moment as the contacts page; the /stats poll (5s while running)
  // refines it in between list refetches. Either is fine as a fallback for
  // the other — this just prefers whichever is freshest.
  const progress = stats.progress ?? payload.progress ?? EMPTY_PROGRESS;

  // "Is it dialling right now?" — polled every 30s while running. Meaningless
  // for a campaign already handed to Ello (our own window/retry settings no
  // longer govern it), so don't even fetch it in that case.
  const { data: previewRes } = useSWR(
    campaign && !campaign.providerCampaignId ? `/api/admin/campaigns/${id}/schedule-preview` : null,
    swrFetcher,
    { refreshInterval: running ? 30000 : 0 },
  );
  const preview = (previewRes?.data ?? {}) as SchedulePreview;

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (error) {
    return <div className="page"><Card><div className="empty">Could not load this campaign — {(error as Error).message}
      <div><button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button></div></div></Card></div>;
  }
  if (isLoading && !campaign) return <div className="page"><TableSkeleton rows={8} /></div>;
  if (!campaign) return <div className="page"><TableSkeleton rows={8} /></div>;

  async function act(path: 'start' | 'pause' | 'cancel') {
    setBusy(true); setActionError(null);
    try {
      const res = await apiFetch<{ queued?: number; elloSideNotCancelled?: boolean }>(`/api/admin/campaigns/${id}/${path}`, { method: 'POST' });
      if (path === 'cancel' && (res.data as { elloSideNotCancelled?: boolean } | undefined)?.elloSideNotCancelled) {
        setActionError("Cancelled here — this campaign was sent to Ello, so also cancel it from Ello's own dashboard.");
      }
      await Promise.all([mutate(), mutateStats()]);
    } catch (e) {
      setActionError(e instanceof ApiError && e.status === 409 ? (e.message || 'Campaign is already running') : (e as Error).message);
    } finally { setBusy(false); }
  }

  async function deleteCampaign() {
    setBusy(true); setActionError(null);
    try {
      await apiFetch(`/api/admin/campaigns/${id}`, { method: 'DELETE' });
      router.push('/campaigns');
    } catch (e) {
      setActionError((e as Error).message);
      setBusy(false);
    }
  }

  async function duplicateCampaign() {
    setBusy(true); setActionError(null);
    try {
      const res = await apiFetch<{ id: string }>(`/api/admin/campaigns/${id}/duplicate`, { method: 'POST' });
      const newId = (res.data as { id?: string } | undefined)?.id;
      if (newId) router.push(`/campaigns/${newId}`);
    } catch (e) {
      setActionError((e as Error).message);
      setBusy(false);
    }
  }

  const total = campaign!.totalContacts ?? progress.total;
  const tz = campaign!.timezone || 'Asia/Kolkata';

  if (editing) {
    return (
      <div className="page">
        <button className="btn" style={{ marginBottom: 14 }} onClick={() => setEditing(false)}>← Back to campaign</button>
        <h1 className="page-title">Edit {campaign.name}</h1>
        <p className="page-sub">Add more contacts or change settings — everything here is saved together.</p>
        <div style={{ marginTop: 20 }}>
          <CampaignBuilder
            campaign={campaign}
            onSaved={() => { setEditing(false); mutate(); mutateStats(); }}
            onCancel={() => setEditing(false)}
          />
        </div>
      </div>
    );
  }

  const summary = summarise({
    scheduleType: campaign.scheduleType === 'recurring' ? 'recurring' : 'one_time',
    dailyStartMinute: campaign.dailyStartMinute,
    dailyEndMinute: campaign.dailyEndMinute,
    daysOfWeek: campaign.daysOfWeek,
    timezone: tz,
    retryStrategy: (campaign.retryStrategy || 'once') as RetryStrategy,
    maxAttemptsPerContact: campaign.maxAttemptsPerContact,
    attemptsPerDay: campaign.attemptsPerDay,
    retryIntervalDays: campaign.retryIntervalDays,
    retryIntervalMinutes: campaign.retryIntervalMinutes,
    stopOnAnswer: campaign.stopOnAnswer !== false,
    startAtIso: campaign.startAt,
    endAtIso: campaign.endAt,
  });
  const from = minutesToTime(campaign.dailyStartMinute ?? null);
  const to = minutesToTime(campaign.dailyEndMinute ?? null);
  const wraps = campaign.dailyStartMinute != null && campaign.dailyEndMinute != null
    && campaign.dailyEndMinute < campaign.dailyStartMinute;

  const dialledPct = total > 0 ? Math.round((progress.dialled / total) * 100) : 0;
  const answeredRate = progress.dialled > 0 ? Math.round((progress.answered / progress.dialled) * 100) : 0;
  const outcomeRows = [
    { key: 'answered', label: 'Answered', value: progress.answered, color: 'var(--green)' },
    { key: 'no_answer', label: 'No answer', value: stats.callsByStatus?.no_answer ?? 0, color: 'var(--amber)' },
    { key: 'busy', label: 'Busy', value: stats.callsByStatus?.busy ?? 0, color: 'var(--blue)' },
    { key: 'voicemail', label: 'Voicemail', value: stats.callsByOutcome?.voicemail ?? 0, color: 'var(--teal)' },
    { key: 'failed', label: 'Failed', value: progress.failed, color: 'var(--red)' },
  ];

  const canStop = running || campaign.status === 'paused';
  const menuItems = [
    { key: 'pause', label: '❙❙ Pause', onSelect: () => act('pause'), disabled: !running },
    campaign.deletedAt
      ? { key: 'restore', label: '↺ Restore', onSelect: () => apiFetch(`/api/admin/campaigns/${id}/restore`, { method: 'POST' }).then(() => mutate()) }
      : { key: 'delete', label: '🗑 Delete', onSelect: () => setConfirmDelete(true), disabled: campaign.status === 'running', danger: true },
  ];

  return (
    <div className="page">
      <div className="row" style={{ gap: 6, fontSize: 12.5, marginBottom: 10 }}>
        <button className="btn" style={{ border: 'none', background: 'none', padding: '2px 0', color: 'var(--text-dim)', fontWeight: 500 }} onClick={() => router.push('/campaigns')}>← Campaigns</button>
        <span className="muted">/</span>
        <span style={{ fontWeight: 600 }}>{campaign.name}</span>
      </div>

      <div className="row between wrap">
        <div>
          <h1 className="page-title">{campaign.name} <StatusBadge status={campaign.status} /></h1>
          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
            {[campaign.scheduleType === 'recurring' ? 'Recurring' : 'One-time', `Concurrency ${campaign.concurrency ?? 1}`].map((t) => (
              <span key={t} style={{
                fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                background: 'var(--teal-bg)', color: '#0d7a6f',
              }}>{t}</span>
            ))}
          </div>
          <p className="page-sub" style={{ marginTop: 8 }}>
            Agent <b style={{ color: 'var(--text)' }}>{campaign.assistantName || campaign.assistantId || 'not set'}</b>
            {' '}· Created {dateStr(campaign.createdAt)}
            {campaign.providerCampaignId && <> · Via Ello · <span className="mono" style={{ color: 'var(--brand)' }}>{campaign.providerCampaignId}</span></>}
          </p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn" onClick={() => setEditing(true)}>Edit contacts</button>
          <button className="btn" disabled={busy} onClick={duplicateCampaign}>Duplicate</button>
          <button className="btn btn-primary" disabled={busy || running || total === 0} onClick={() => act('start')}>
            {busy ? '…' : running ? 'Running' : 'Start dialling'}
          </button>
          {/* Stop is a first-class, visible action (was buried in the ⋯ menu) —
              it halts the campaign and cancels all upcoming, not-yet-placed calls. */}
          <button
            className="btn"
            style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
            disabled={busy || !canStop}
            title={canStop ? 'Stop the campaign and cancel all upcoming calls' : 'Only a running or paused campaign can be stopped'}
            onClick={() => setConfirmCancel(true)}
          >
            ■ Stop
          </button>
          <Menu trigger="⋯" items={menuItems} />
        </div>
      </div>
      {total === 0 && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>No contacts yet — click &quot;Edit contacts&quot; above.</p>}
      {actionError && <div className="empty" style={{ color: 'var(--red)', textAlign: 'left', padding: '10px 0' }}>{actionError}</div>}
      {campaign.note && <p className="muted" style={{ fontSize: 12.5 }}>{campaign.note}</p>}

      {!campaign.providerCampaignId && (
        <Card
          title="Schedule"
          sub={running ? 'Live — refreshing every 30s' : undefined}
          className="mt-16"
          right={preview.canDial ? <StatusBadge status="running" label="● Dialling now" /> : <StatusBadge status="paused" label="Idle" />}
        >
          <div style={{ fontSize: 14, lineHeight: 1.55, fontWeight: 600, marginBottom: 12 }}>{summary}</div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
            <div><div className="nav-section" style={{ padding: 0 }}>Runs</div>
              <div style={{ fontSize: 12.5 }}>{zonedDateLabel(campaign.startAt, tz)} → {zonedDateLabel(campaign.endAt, tz)}</div></div>
            <div><div className="nav-section" style={{ padding: 0 }}>Daily window</div>
              <div style={{ fontSize: 12.5 }}>{from && to ? `${from}–${to} ${tzAbbrev(tz)}${wraps ? ' (overnight)' : ''}` : '—'}</div></div>
            <div><div className="nav-section" style={{ padding: 0 }}>Days</div>
              <div style={{ fontSize: 12.5 }}>{daysLabel(campaign.daysOfWeek)}</div></div>
            <div><div className="nav-section" style={{ padding: 0 }}>Timezone</div>
              <div style={{ fontSize: 12.5 }}>{tz} ({tzAbbrev(tz)})</div></div>
          </div>
          {!preview.canDial && preview.nextOpening && (
            <div style={{ marginTop: 12, fontSize: 12.5 }}>
              Next window opens <b>{zonedDateLabel(preview.nextOpening, tz)}</b> {tzAbbrev(tz)}
              <span className="muted"> ({timeAgo(preview.nextOpening)})</span>
            </div>
          )}
        </Card>
      )}

      <div className="grid" style={{ gridTemplateColumns: '1.15fr 1fr', marginTop: 16, alignItems: 'stretch' }}>
        <Card>
          <div className="nav-section" style={{ padding: 0, color: 'var(--brand)' }}>Progress</div>
          <div className="row between" style={{ alignItems: 'baseline', marginTop: 4 }}>
            <div style={{ fontSize: 26, fontWeight: 750 }}>
              {num(progress.dialled)} <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}>/ {num(total)} contacts dialled</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 750, color: 'var(--brand)' }}>{dialledPct}%</div>
          </div>
          <div style={{ marginTop: 12 }}>
            <SegmentedProgressBar segments={[
              { key: 'answered', value: progress.answered, color: 'var(--green)' },
              { key: 'no_connect', value: progress.noConnect, color: 'var(--blue)' },
              { key: 'failed', value: progress.failed, color: 'var(--red)' },
            ]} />
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginTop: 18, gap: 10 }}>
            <div>
              <span className="row" style={{ gap: 6, fontSize: 12.5, color: 'var(--text-dim)' }}><span style={{ width: 8, height: 8, borderRadius: 3, background: 'var(--green)' }} />Answered</span>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{num(progress.answered)}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>{total > 0 ? Math.round((progress.answered / total) * 100) : 0}% of contacts</div>
            </div>
            <div>
              <span className="row" style={{ gap: 6, fontSize: 12.5, color: 'var(--text-dim)' }}><span style={{ width: 8, height: 8, borderRadius: 3, background: 'var(--blue)' }} />Dialled, no connect</span>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{num(progress.noConnect)}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>{total > 0 ? Math.round((progress.noConnect / total) * 100) : 0}% of contacts</div>
            </div>
            <div>
              <span className="row" style={{ gap: 6, fontSize: 12.5, color: 'var(--text-dim)' }}><span style={{ width: 8, height: 8, borderRadius: 3, background: 'var(--grey)' }} />Pending</span>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{num(progress.pending)}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>
                {!campaign.providerCampaignId && preview.nextOpening ? <>Next window {zonedDateLabel(preview.nextOpening, tz)}</> : `${total > 0 ? Math.round((progress.pending / total) * 100) : 0}% of contacts`}
              </div>
            </div>
            <div>
              <span className="row" style={{ gap: 6, fontSize: 12.5, color: 'var(--text-dim)' }}><span style={{ width: 8, height: 8, borderRadius: 3, background: 'var(--red)' }} />Failed</span>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{num(progress.failed)}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>{progress.failed > 0 ? 'Needs review' : 'None'}</div>
            </div>
          </div>
        </Card>

        <Card
          title="Call outcomes"
          right={<span className="muted" style={{ fontSize: 12 }}>{answeredRate}% answered</span>}
        >
          <HorizontalBarList rows={outcomeRows} />
          <p className="muted" style={{ fontSize: 11.5, marginTop: 16, marginBottom: 0 }}>
            {campaign.providerCampaignId
              ? "Stats update as Ello's webhooks arrive."
              : 'Stats refresh live while dialling.'} Attempt times in {tzAbbrev(tz)}.
          </p>
        </Card>
      </div>

      {/* contacts */}
      <Card className="mt-16">
        <div className="row between wrap" style={{ gap: 12, marginBottom: 14 }}>
          <h3 className="card-title" style={{ margin: 0 }}>Contacts ({num(total)})</h3>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className={`chip-filter ${filter === 'all' ? 'active' : ''}`} onClick={() => { setFilter('all'); setPage(1); }}>All {num(total)}</button>
            <button className={`chip-filter ${filter === 'answered' ? 'active' : ''}`} onClick={() => { setFilter('answered'); setPage(1); }}>Answered {num(progress.answered)}</button>
            <button className={`chip-filter ${filter === 'pending' ? 'active' : ''}`} onClick={() => { setFilter('pending'); setPage(1); }}>Pending {num(progress.pending)}</button>
            <button className={`chip-filter ${filter === 'failed' ? 'active' : ''}`} onClick={() => { setFilter('failed'); setPage(1); }}>Failed {num(progress.failed)}</button>
            <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name or number" />
          </div>
        </div>
        {contacts.length === 0 ? <Empty label='No contacts match this view' /> : (
          <div className="table-wrap" style={{ opacity: isLoading ? 0.6 : 1, transition: 'opacity .1s' }}>
            <table className="data">
              <thead><tr>
                <th>Contact</th><th>City</th><th>Product</th><th>Amount</th><th>State</th>
                <th>Attempts</th><th>Last attempt</th><th>Next eligible</th>
              </tr></thead>
              <tbody>{contacts.map((c) => {
                const key = contactStatusKey(c);
                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.name || <span className="muted">—</span>}</div>
                      <div className="mono muted" style={{ fontSize: 12 }}>{formatPhone(c.phone)}</div>
                    </td>
                    <td>{c.city || '—'}</td>
                    <td style={{ textTransform: 'capitalize' } as React.CSSProperties}>{c.product || '—'}</td>
                    <td className="mono">{c.amount ? inr(c.amount) : '—'}</td>
                    <td><StatusBadge status={key} label={ROW_LABEL[key]} /></td>
                    <td className="mono">
                      {num(c.attempts ?? 0)}{campaign.maxAttemptsPerContact ? <span className="muted"> / {campaign.maxAttemptsPerContact}</span> : null}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>{c.lastAttemptAt ? zonedDateLabel(c.lastAttemptAt, tz) : '—'}</td>
                    <td className="muted" style={{ fontSize: 12 }} title={c.error || undefined}>{c.nextEligibleAt ? zonedDateLabel(c.nextEligibleAt, tz) : '—'}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>

      {confirmCancel && (
        <ConfirmDialog
          title="Cancel this campaign?"
          tone="red"
          busy={busy}
          confirmLabel="Cancel campaign"
          cancelLabel="Never mind"
          message={
            <>
              Every contact not yet called will be marked <b style={{ color: 'var(--text)' }}>skipped</b> and this
              campaign can never be resumed — start a new one instead if you need to reach them later.
              {campaign.providerCampaignId && (
                <>
                  <br /><br />
                  This campaign was sent to Ello, so this only stops it on our side — cancel it from{' '}
                  <b style={{ color: 'var(--text)' }}>Ello&apos;s own dashboard</b> too.
                </>
              )}
            </>
          }
          onCancel={() => setConfirmCancel(false)}
          onConfirm={() => { setConfirmCancel(false); act('cancel'); }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this campaign?"
          tone="red"
          busy={busy}
          confirmLabel="Delete campaign"
          message={
            <>
              This removes <b style={{ color: 'var(--text)' }}>{campaign.name}</b> from the list, but it is not
              erased — it&apos;s kept, and can be restored later from the Deleted filter.
            </>
          }
          onCancel={() => setConfirmDelete(false)}
          onConfirm={deleteCampaign}
        />
      )}
    </div>
  );
}
