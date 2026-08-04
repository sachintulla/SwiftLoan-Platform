'use client';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { swrFetcher, apiFetch } from '@/lib/api';
import { Card, StatCard, StatusBadge, TableSkeleton, Empty } from '@/components/ui';
import { CallList, CallAttemptDetail } from '@/components/callDetail';
import { inr, dateStr, timeAgo, humanStatus } from '@/lib/format';

interface Lead {
  id: string; name?: string | null; phone?: string | null; city?: string | null;
  productInterest?: string | null; amount?: number | null; source: string;
  campaignId?: string | null; referrer?: string | null; status: string;
  convertedUserId?: string | null; note?: string | null; createdAt: string; updatedAt: string;
}
interface ConvertedUser { id: string; fullName?: string; phone?: string; createdAt: string; applications: { id: string; ref: string; amount: number; status: string }[] }

// The lead lifecycle. "lost" is a terminal off-ramp handled separately.
const STAGES = ['new', 'contacted', 'qualified', 'converted'];

export default function LeadJourney() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR(`/api/admin/leads/${id}`, swrFetcher);
  const lead = (data?.data as { lead?: Lead })?.lead;
  const convertedUser = (data?.data as { convertedUser?: ConvertedUser })?.convertedUser;

  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (lead?.note != null) setNote(lead.note); }, [lead?.note]);

  // The lead payload carries no calls of its own (and no customer id), so match the
  // voice-call log on this lead's phone number — that is the same key the dialler used.
  const leadDigits = (lead?.phone ?? '').replace(/\D/g, '');
  const {
    data: callsRes, error: callsError, isLoading: callsLoading, mutate: refetchCalls,
  } = useSWR(leadDigits ? `/api/admin/calls?search=${leadDigits}&pageSize=25` : null, swrFetcher);
  // Defensive: the list may arrive bare or nested under data.items.
  const callsPayload = callsRes?.data as CallAttemptDetail[] | { items?: CallAttemptDetail[] } | undefined;
  const calls: CallAttemptDetail[] = Array.isArray(callsPayload) ? callsPayload : (callsPayload?.items ?? []);

  if (isLoading || !lead) return <div className="page"><TableSkeleton rows={8} /></div>;

  const isLost = lead.status === 'lost';
  const stageIdx = STAGES.indexOf(lead.status);

  async function update(patch: { status?: string; note?: string }) {
    setSaving(true);
    try { await apiFetch(`/api/admin/leads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }); await mutate(); }
    finally { setSaving(false); }
  }

  return (
    <div className="page">
      <button className="btn" style={{ marginBottom: 14 }} onClick={() => router.back()}>← Back to leads</button>

      <div className="row between wrap">
        <div>
          <h1 className="page-title">{lead.name || 'Anonymous lead'} <StatusBadge status={lead.status} /></h1>
          <p className="page-sub">Captured {dateStr(lead.createdAt)} · {timeAgo(lead.createdAt)} · via {lead.source}{lead.campaignId ? ` · ${lead.campaignId}` : ''}</p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', marginTop: 16 }}>
        <StatCard label="Loan Interest" value={<span style={{ textTransform: 'capitalize' } as React.CSSProperties}>{lead.productInterest || '—'}</span>} tone="blue" />
        <StatCard label="Amount" value={lead.amount ? inr(lead.amount) : '—'} tone="teal" />
        <StatCard label="Source" value={<span style={{ textTransform: 'capitalize' } as React.CSSProperties}>{lead.source}</span>} tone="amber" foot={lead.campaignId || undefined} />
        <StatCard label="City" value={lead.city || '—'} tone="grey" />
      </div>

      {/* journey stage tracker */}
      <Card title="Lead journey" sub={isLost ? 'This lead was marked lost.' : 'Progression from capture to conversion'}>
        {isLost ? (
          <div className="row" style={{ gap: 10 }}><StatusBadge status="lost" /> <span className="muted">Marked lost{lead.note ? ` — ${lead.note}` : ''}.</span></div>
        ) : (
          <div className="row wrap" style={{ gap: 0 }}>
            {STAGES.map((s, i) => (
              <div key={s} className="row" style={{ gap: 0 }}>
                <div style={{ display: 'grid', placeItems: 'center', gap: 6, minWidth: 110 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, color: '#fff', background: i <= stageIdx ? 'var(--brand)' : 'var(--border)' }}>{i < stageIdx ? '✓' : i + 1}</div>
                  <span style={{ fontSize: 11.5, fontWeight: 500, color: i <= stageIdx ? 'var(--text)' : 'var(--text-faint)' }}>{humanStatus(s)}</span>
                </div>
                {i < STAGES.length - 1 && <div style={{ width: 40, height: 2, background: i < stageIdx ? 'var(--brand)' : 'var(--border)' }} />}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 16, alignItems: 'start' }}>
        {/* contact + attribution */}
        <Card title="Contact & attribution">
          <div className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}><span className="muted">Phone</span><b className="mono">{lead.phone || '—'}</b></div>
          <div className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}><span className="muted">City</span><b>{lead.city || '—'}</b></div>
          <div className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}><span className="muted">Source</span><span className="badge tone-grey" style={{ textTransform: 'capitalize' }}>{lead.source}</span></div>
          <div className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}><span className="muted">Campaign</span><b className="mono">{lead.campaignId || '—'}</b></div>
          <div className="row between" style={{ padding: '7px 0' }}><span className="muted">Referrer</span><b className="mono" style={{ fontSize: 12 }}>{lead.referrer || '—'}</b></div>
        </Card>

        {/* status management */}
        <Card title="Manage lead" sub="Update status and add a note">
          <label style={{ fontSize: 12.5, fontWeight: 600 }}>Status</label>
          <div className="row wrap" style={{ gap: 8, margin: '8px 0 16px' }}>
            {['new', 'contacted', 'qualified', 'converted', 'lost'].map((s) => (
              <button key={s} className={`chip-filter ${lead.status === s ? 'active' : ''}`} disabled={saving} onClick={() => update({ status: s })}>{humanStatus(s)}</button>
            ))}
          </div>
          <label style={{ fontSize: 12.5, fontWeight: 600 }}>Note</label>
          <textarea className="input" style={{ margin: '8px 0', minHeight: 72, resize: 'vertical' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note about this lead…" />
          <button className="btn btn-primary" disabled={saving || note === (lead.note ?? '')} onClick={() => update({ note })}>{saving ? 'Saving…' : 'Save note'}</button>
        </Card>
      </div>

      {/* voice calls matched by phone */}
      <div style={{ marginTop: 16 }}>
        <Card
          title={`Voice calls (${calls.length})`}
          sub={leadDigits ? `Outbound attempts matched to ${lead.phone}` : undefined}
          right={callsError ? <button className="btn" onClick={() => refetchCalls()}>Retry</button> : undefined}
        >
          {!leadDigits ? (
            <Empty label="This lead has no phone number, so no calls can be matched" />
          ) : callsLoading ? (
            <TableSkeleton rows={3} cols={4} />
          ) : callsError ? (
            <div className="empty" style={{ color: 'var(--red)' }}>Could not load calls — {(callsError as Error).message}</div>
          ) : (
            <CallList calls={calls} emptyLabel="No voice calls placed to this lead yet" />
          )}
        </Card>
      </div>

      {/* converted user (if any) */}
      {convertedUser && (
        <div style={{ marginTop: 16 }}>
        <Card title="Converted to customer" sub="This lead became a registered user">
          <div className="row between wrap" style={{ marginBottom: 12 }}>
            <div className="row" style={{ gap: 10 }}>
              <StatusBadge status="converted" label="Converted" />
              <b>{convertedUser.fullName || convertedUser.phone}</b>
              <span className="muted">· joined {dateStr(convertedUser.createdAt)}</span>
            </div>
            <button className="btn" onClick={() => router.push(`/users/${convertedUser.id}`)}>View profile →</button>
          </div>
          {convertedUser.applications.length > 0 && (
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Application</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>{convertedUser.applications.map((a) => (
                <tr key={a.id} onClick={() => router.push(`/loans/${a.id}`)}><td className="mono">{a.ref}</td><td className="mono">{inr(a.amount)}</td><td><StatusBadge status={a.status} /></td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
        </div>
      )}
    </div>
  );
}
