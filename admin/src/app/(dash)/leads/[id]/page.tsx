'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrFetcher, apiFetch } from '@/lib/api';
import { Card, StatCard, StatusBadge, TableSkeleton, Empty } from '@/components/ui';
import { CallList, CallAttemptDetail } from '@/components/callDetail';
import { ChannelChips, ConversationCard, asConversations, inferredCount, relTime } from '@/components/conversation';
import { inr, dateStr, timeAgo, humanStatus, num } from '@/lib/format';

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
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/leads/${id}`, swrFetcher);
  const payload = (data?.data ?? {}) as {
    lead?: Lead; convertedUser?: ConvertedUser; customerId?: string | null; customerStage?: string | null;
    brief?: string | null; conversationCount?: number | null; channels?: string[] | null; conversations?: unknown;
  };
  const lead = payload.lead;
  const convertedUser = payload.convertedUser;
  const conversations = asConversations(payload.conversations);
  const convCount = payload.conversationCount ?? conversations.length;
  const inferred = inferredCount(conversations);

  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [calling, setCalling] = useState(false);
  const [callMsg, setCallMsg] = useState<{ ok: boolean; text: string } | null>(null);
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

  if (error || (!isLoading && !lead)) {
    return (
      <div className="page">
        <Card>
          <div className="empty">
            {error ? <>Could not load this lead — {(error as Error).message}</> : <>This lead no longer exists.</>}
            <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 12 }}>
              {error && <button className="btn" onClick={() => mutate()}>Retry</button>}
              <Link className="btn" href="/leads">← Back to leads</Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }
  if (isLoading || !lead) return <div className="page"><TableSkeleton rows={8} /></div>;

  const isLost = lead.status === 'lost';
  const stageIdx = STAGES.indexOf(lead.status);

  async function update(patch: { status?: string; note?: string }) {
    setSaving(true);
    try { await apiFetch(`/api/admin/leads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }); await mutate(); }
    finally { setSaving(false); }
  }

  /**
   * Place a real outbound call to this lead, right now.
   *
   * Confirmed first, deliberately: this rings an actual person's phone within
   * seconds and cannot be undone. The server builds the full context — including
   * everything discussed on the website, previous calls and the app — so the
   * agent opens knowing them rather than as a cold call.
   */
  async function callNow() {
    // Read through the optional chain: `lead` is narrowed by an early return in
    // the render path, but that narrowing does not survive into this closure.
    const phone = lead?.phone;
    const who = lead?.name || 'this lead';
    if (!phone) return;
    if (!window.confirm(`Call ${who} on ${phone} now?\n\nThis places a real phone call.`)) return;

    setCalling(true);
    setCallMsg(null);
    try {
      const res = await apiFetch<{ status?: string; error?: string; id?: string }>(
        '/api/admin/calls/trigger',
        { method: 'POST', body: JSON.stringify({ phone }) },
      );
      const d = res.data ?? {};
      // A provider failure still returns a CallAttempt row (status `failed`), so
      // report what actually happened rather than assuming success from a 2xx.
      const failed = d.status === 'failed';
      setCallMsg({
        ok: !failed,
        text: failed
          ? `Call failed — ${d.error || 'the provider rejected it'}`
          : `Calling ${phone} now. The result will appear in the conversation history below.`,
      });
      await mutate();
    } catch (e) {
      const msg = (e as Error).message || 'Could not place the call';
      setCallMsg({
        ok: false,
        // 403 here means the signed-in admin lacks the role, which is worth
        // saying plainly rather than showing a bare status code.
        text: /403/.test(msg) ? 'Only a super admin can place calls.' : msg,
      });
    } finally {
      setCalling(false);
    }
  }

  return (
    <div className="page">
      <button className="btn" style={{ marginBottom: 14 }} onClick={() => router.back()}>← Back to leads</button>

      <div className="row between wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">{lead.name || 'Anonymous lead'} <StatusBadge status={lead.status} /></h1>
          <p className="page-sub">Captured {dateStr(lead.createdAt)} · {timeAgo(lead.createdAt)} · via {lead.source}{lead.campaignId ? ` · ${lead.campaignId}` : ''}</p>
        </div>

        {/* Call now — places a REAL call, so it confirms first and says so plainly. */}
        <div style={{ display: 'grid', gap: 6, justifyItems: 'end', minWidth: 210 }}>
          <button
            className="btn btn-primary"
            disabled={!lead.phone || calling}
            title={lead.phone ? `Call ${lead.phone} now` : 'This lead has no phone number'}
            onClick={callNow}
          >
            {calling ? 'Dialling…' : '📞 Call now'}
          </button>
          {lead.phone ? (
            <span className="muted" style={{ fontSize: 11.5, textAlign: 'right', lineHeight: 1.4 }}>
              Rings {lead.phone} within a few seconds.<br />The agent gets the full history first.
            </span>
          ) : (
            <span className="muted" style={{ fontSize: 11.5 }}>No phone number on this lead</span>
          )}
          {callMsg && (
            <span
              className={`badge ${callMsg.ok ? 'tone-green' : 'tone-red'}`}
              style={{ whiteSpace: 'normal', maxWidth: 260, textAlign: 'right', lineHeight: 1.45 }}
            >
              {callMsg.text}
            </span>
          )}
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

      {/* everything this person has ever said to us, across every channel */}
      <div style={{ marginTop: 16 }}>
        <Card
          title={`Conversation history (${num(convCount)})`}
          sub={convCount > 0
            ? `Across ${num(Array.isArray(payload.channels) ? payload.channels.length : 0)} channel(s) · last activity ${relTime(conversations[0]?.startedAt)}`
            : 'Phone, website and app — stitched together for this number.'}
          right={payload.customerId ? <Link className="btn" href={`/customers/${payload.customerId}`}>Open customer journey →</Link> : undefined}
        >
          {convCount === 0 ? (
            <Empty label="We have never spoken to this lead — no calls, chats or app conversations recorded." />
          ) : (
            <>
              {/* the one thing to read before calling back */}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-dim)', marginBottom: 5 }}>
                  What we know about this person
                </div>
                {payload.brief ? (
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.65 }}>{payload.brief}</div>
                ) : (
                  <p className="muted" style={{ fontSize: 12.5 }}>No rolling brief yet for this number.</p>
                )}
              </div>

              <div className="row wrap" style={{ gap: 5, marginTop: 14 }}>
                <ChannelChips channels={payload.channels} />
                {payload.customerStage && <StatusBadge status={payload.customerStage} />}
              </div>

              {inferred > 0 && (
                <div className="empty" style={{ textAlign: 'left', color: 'var(--amber)', marginTop: 14 }}>
                  {inferred} of these outcome{inferred === 1 ? '' : 's'} {inferred === 1 ? 'was' : 'were'} inferred by keyword-matching the transcript, not confirmed by the agent. Verify before acting on {inferred === 1 ? 'it' : 'them'}.
                </div>
              )}

              <div style={{ marginTop: 6 }}>
                {conversations.length === 0
                  ? <Empty label="No individual conversations stored" />
                  : conversations.map((c) => <ConversationCard key={c.id} c={c} />)}
              </div>
            </>
          )}
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
