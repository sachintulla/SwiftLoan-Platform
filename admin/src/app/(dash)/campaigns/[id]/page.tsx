'use client';
import React, { useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, apiFetch, apiUpload, ApiError } from '@/lib/api';
import { Card, StatCard, StatusBadge, Pagination, TableSkeleton, Empty } from '@/components/ui';
import { PipelineBar } from '@/components/viz';
import { CategoryBar } from '@/components/charts';
import { inr, dateStr, num, humanStatus, timeAgo } from '@/lib/format';
import CampaignBuilder from '@/components/CampaignBuilder';
import {
  Campaign, RetryStrategy, summarise, minutesToTime, daysLabel, tzAbbrev, zonedDateLabel,
} from '@/lib/campaign';

interface Contact {
  id: string; name?: string | null; phone: string; city?: string | null;
  product?: string | null; amount?: number | null; state: string; error?: string | null;
  attempts?: number | null; lastAttemptAt?: string | null; nextEligibleAt?: string | null; answered?: boolean | null;
}
interface UploadResult {
  inserted: number; skipped: number; duplicates: number; totalContacts?: number;
  errors: { row?: number; reason?: string; message?: string }[];
}
interface Stats {
  contactsByState?: Record<string, number>;
  callsByOutcome?: Record<string, number>;
  callsByStatus?: Record<string, number>;
  running?: boolean;
}
interface SchedulePreview {
  canDial?: boolean; reason?: string; detail?: string; nextOpening?: string | null;
}

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(false);

  const qs = new URLSearchParams({ page: String(page), pageSize: '25' });
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/campaigns/${id}?${qs.toString()}`, swrFetcher);

  const payload = (data?.data ?? {}) as {
    campaign?: Campaign; counts?: Record<string, number>; outcomes?: Record<string, number>;
    contacts?: Contact[]; running?: boolean;
  };
  const campaign = payload.campaign;
  const counts = payload.counts ?? {};
  const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
  const pg = data?.pagination;

  const running = campaign?.status === 'running' || payload.running === true;

  const { data: statsRes, mutate: mutateStats } = useSWR(
    campaign ? `/api/admin/campaigns/${id}/stats` : null,
    swrFetcher,
    { refreshInterval: running ? 5000 : 0 },
  );
  const stats = (statsRes?.data ?? {}) as Stats;

  // "Is it dialling right now?" — polled every 30s while the campaign is running.
  const { data: previewRes, error: previewErr } = useSWR(
    campaign ? `/api/admin/campaigns/${id}/schedule-preview` : null,
    swrFetcher,
    { refreshInterval: running ? 30000 : 0 },
  );
  const preview = (previewRes?.data ?? {}) as SchedulePreview;

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (error) {
    return <div className="page"><Card><div className="empty">Could not load this campaign — {(error as Error).message}
      <div><button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button></div></div></Card></div>;
  }
  if (isLoading || !campaign) return <div className="page"><TableSkeleton rows={8} /></div>;

  async function act(path: 'start' | 'pause') {
    setBusy(true); setActionError(null);
    try {
      await apiFetch<{ queued?: number }>(`/api/admin/campaigns/${id}/${path}`, { method: 'POST' });
      await Promise.all([mutate(), mutateStats()]);
    } catch (e) {
      setActionError(e instanceof ApiError && e.status === 409 ? (e.message || 'Campaign is already running') : (e as Error).message);
    } finally { setBusy(false); }
  }

  async function doUpload(file: File) {
    setUploading(true); setUploadError(null); setUpload(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiUpload<UploadResult>(`/api/admin/campaigns/${id}/contacts/upload`, form);
      setUpload(res.data);
      await Promise.all([mutate(), mutateStats()]);
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const total = campaign.totalContacts ?? upload?.totalContacts ?? Object.values(counts).reduce((a, b) => a + b, 0);
  const byState = stats.contactsByState ?? {};
  const byOutcome = stats.callsByOutcome ?? payload.outcomes ?? {};
  const outcomeData = Object.entries(byOutcome).map(([k, v]) => ({ outcome: humanStatus(k), count: v }));

  const tz = campaign.timezone || 'Asia/Kolkata';
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

  if (editing) {
    return (
      <div className="page">
        <button className="btn" style={{ marginBottom: 14 }} onClick={() => setEditing(false)}>← Back to campaign</button>
        <h1 className="page-title">Edit {campaign.name}</h1>
        <p className="page-sub">Changes take effect on the next dialling pass.</p>
        <CampaignBuilder
          campaign={campaign}
          onSaved={() => { setEditing(false); mutate(); }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const from = minutesToTime(campaign.dailyStartMinute ?? null);
  const to = minutesToTime(campaign.dailyEndMinute ?? null);
  const wraps = campaign.dailyStartMinute != null && campaign.dailyEndMinute != null
    && campaign.dailyEndMinute < campaign.dailyStartMinute;

  return (
    <div className="page">
      <button className="btn" style={{ marginBottom: 14 }} onClick={() => router.push('/campaigns')}>← Back to campaigns</button>

      <div className="row between wrap">
        <div>
          <h1 className="page-title">{campaign.name} <StatusBadge status={campaign.status} /></h1>
          <p className="page-sub">
            <span className="mono">{campaign.code}</span> · {campaign.scheduleType === 'recurring' ? 'recurring' : 'one-time'}
            {' '}· concurrency {campaign.concurrency ?? 1} · created {dateStr(campaign.createdAt)}
            {(campaign.assistantName || campaign.assistantId)
              ? <> · agent {campaign.assistantName || <span className="mono">{campaign.assistantId}</span>}</>
              : <> · <span style={{ color: 'var(--amber)' }}>no agent set</span></>}
          </p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn" onClick={() => setEditing(true)}>✎ Edit</button>
          <button className="btn btn-primary" disabled={busy || running || total === 0} onClick={() => act('start')}>
            {busy ? '…' : running ? 'Running' : '▶ Start dialling'}
          </button>
          <button className="btn" disabled={busy || !running} onClick={() => act('pause')}>❙❙ Pause</button>
        </div>
      </div>
      {total === 0 && <p className="muted" style={{ fontSize: 12.5 }}>Upload a contact sheet before starting.</p>}
      {actionError && <div className="empty" style={{ color: 'var(--red)', textAlign: 'left' }}>{actionError}</div>}
      {campaign.note && <p className="muted" style={{ fontSize: 12.5 }}>{campaign.note}</p>}

      {/* schedule summary + live dialling indicator */}
      <Card title="Schedule" sub={running ? 'Live — refreshing every 30s' : undefined}
        right={
          previewErr ? <StatusBadge status="not_started" label="Status unknown" />
            : preview.canDial ? <StatusBadge status="running" label="● Dialling now" />
              : <StatusBadge status="paused" label="Idle" />
        }>
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

        <div style={{ marginTop: 14, padding: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--grey-bg)' }}>
          {previewErr ? (
            <span style={{ fontSize: 12.5, color: 'var(--amber)' }}>Could not check the dialling window — {(previewErr as Error).message}</span>
          ) : !previewRes ? (
            <span className="muted" style={{ fontSize: 12.5 }}>Checking the dialling window…</span>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {preview.canDial ? 'This campaign can dial right now.' : 'Not dialling right now.'}
                {preview.reason ? <span className="muted" style={{ fontWeight: 400 }}> — {humanStatus(preview.reason)}</span> : null}
              </div>
              {preview.detail && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{preview.detail}</div>}
              {!preview.canDial && preview.nextOpening && (
                <div style={{ fontSize: 12.5, marginTop: 6 }}>
                  Next window opens <b>{zonedDateLabel(preview.nextOpening, tz)}</b> {tzAbbrev(tz)}
                  <span className="muted"> ({timeAgo(preview.nextOpening)})</span>
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', marginTop: 16 }}>
        <StatCard label="Total contacts" value={num(total)} tone="grey" icon="☰" />
        <StatCard label="Called" value={num(counts.called ?? byState.called ?? 0)} tone="blue" icon="☎" />
        <StatCard label="Pending" value={num(counts.pending ?? byState.pending ?? 0)} tone="amber" icon="◔" />
        <StatCard label="Failed" value={num(counts.failed ?? byState.failed ?? 0)} tone="red" icon="!" />
      </div>

      {/* upload */}
      <Card title="Upload contacts" sub="Spreadsheet (.xlsx, .xls or .csv). Rows that fail validation are reported below.">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) doUpload(f); }}
          style={{ border: '2px dashed var(--border)', borderRadius: 'var(--radius)', padding: 26, textAlign: 'center' }}
        >
          <div style={{ fontSize: 13, marginBottom: 10 }}>{uploading ? 'Uploading…' : 'Drop a spreadsheet here, or'}</div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload(f); }} style={{ fontSize: 12.5 }} />
        </div>
        {uploadError && <div className="empty" style={{ color: 'var(--red)', textAlign: 'left', marginTop: 12 }}>{uploadError}</div>}
        {upload && (
          <div style={{ marginTop: 14 }}>
            <div className="row wrap" style={{ gap: 14 }}>
              <span className="row" style={{ gap: 6, fontSize: 12.5 }}><StatusBadge status="completed" label="Inserted" /><b>{num(upload.inserted)}</b></span>
              <span className="row" style={{ gap: 6, fontSize: 12.5 }}><StatusBadge status="pending" label="Skipped" /><b>{num(upload.skipped)}</b></span>
              <span className="row" style={{ gap: 6, fontSize: 12.5 }}><StatusBadge status="not_started" label="Duplicates" /><b>{num(upload.duplicates)}</b></span>
              <span className="row" style={{ gap: 6, fontSize: 12.5 }}><StatusBadge status="failed" label="Errors" /><b>{upload.errors?.length ?? 0}</b></span>
              {upload.totalContacts != null && <span className="muted" style={{ fontSize: 12.5 }}>total now {num(upload.totalContacts)}</span>}
            </div>
            {(upload.errors?.length ?? 0) > 0 && (
              <div className="table-wrap" style={{ marginTop: 12, maxHeight: 220, overflowY: 'auto' }}>
                <table className="data">
                  <thead><tr><th>Row</th><th>Problem</th></tr></thead>
                  <tbody>{upload.errors.map((er, i) => (
                    <tr key={i}><td className="mono">{er.row ?? '—'}</td><td style={{ color: 'var(--red)' }}>{er.reason || er.message}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* live stats */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 16, alignItems: 'start' }}>
        <Card title="Contacts by state" sub={running ? 'Live — refreshing every 5s' : undefined}>
          {Object.keys(byState).length === 0 ? <Empty label="No contacts uploaded yet" /> : <PipelineBar byStatus={byState} />}
        </Card>
        <Card title="Calls by outcome">
          {outcomeData.length === 0 ? <Empty label="No calls placed yet" /> : <CategoryBar data={outcomeData} xKey="outcome" yKey="count" />}
        </Card>
      </div>

      {/* contacts */}
      <Card title={`Contacts (${num(total)})`} sub={`Attempt times shown in ${tzAbbrev(tz)}.`}>
        {contacts.length === 0 ? <Empty label="No contacts in this campaign yet — upload a spreadsheet above" /> : (
          <div className="table-wrap"><table className="data">
            <thead><tr>
              <th>Name</th><th>Phone</th><th>City</th><th>Product</th><th>Amount</th><th>State</th>
              <th>Attempts</th><th>Last attempt</th><th>Next eligible</th><th>Answered</th><th>Error</th>
            </tr></thead>
            <tbody>{contacts.map((c) => (
              <tr key={c.id}>
                <td>{c.name || <span className="muted">—</span>}</td>
                <td className="mono">{c.phone}</td>
                <td>{c.city || '—'}</td>
                <td style={{ textTransform: 'capitalize' } as React.CSSProperties}>{c.product || '—'}</td>
                <td className="mono">{c.amount ? inr(c.amount) : '—'}</td>
                <td><StatusBadge status={c.state} /></td>
                <td className="mono">
                  {num(c.attempts ?? 0)}{campaign.maxAttemptsPerContact ? <span className="muted"> / {campaign.maxAttemptsPerContact}</span> : null}
                </td>
                <td className="muted" style={{ fontSize: 12 }}>{c.lastAttemptAt ? zonedDateLabel(c.lastAttemptAt, tz) : '—'}</td>
                <td className="muted" style={{ fontSize: 12 }}>{c.nextEligibleAt ? zonedDateLabel(c.nextEligibleAt, tz) : '—'}</td>
                <td><StatusBadge status={c.answered ? 'completed' : 'not_started'} label={c.answered ? 'Yes' : 'No'} /></td>
                <td style={{ color: 'var(--red)', fontSize: 12 }}>{c.error || ''}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>
    </div>
  );
}
