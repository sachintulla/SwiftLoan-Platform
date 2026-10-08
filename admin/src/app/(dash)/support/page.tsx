'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { swrFetcher, apiFetch } from '@/lib/api';
import { Card, StatusBadge, SearchBox, FilterChips, Pagination, TableSkeleton, Empty, Callout } from '@/components/ui';
import { dateStr, timeAgo, inrRupees } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';

type Status = 'open' | 'in_progress' | 'resolved';
interface Ticket {
  id: string; ref: string; ticketNo: number; type: 'query' | 'grievance'; category: string; categoryLabel: string;
  subject: string; body: string | null; status: Status; adminNote: string | null; applicationId: string | null;
  createdAt: string; updatedAt: string; resolvedAt: string | null; emailSentAt: string | null; emailError: string | null;
  user: { id: string; fullName: string | null; phone: string; email: string | null; createdAt?: string };
}
interface Detail extends Ticket {
  application: { id: string; ref: string; amount: number; status: string; tenureMonths: number; createdAt: string } | null;
  otherTickets: { id: string; ref: string; categoryLabel: string; subject: string; status: Status; createdAt: string }[];
}
interface Summary { open: number; in_progress: number; resolved: number; total: number; needsAction: number; grievancesOpen: number; mailConfigured: boolean }

const STATUS_FILTERS = [
  { key: '', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'resolved', label: 'Resolved' },
] as const;
const TYPE_FILTERS = [
  { key: '', label: 'All types' },
  { key: 'query', label: 'Queries' },
  { key: 'grievance', label: 'Grievances' },
] as const;
const STATUS_LABEL: Record<Status, string> = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' };

export default function SupportPage() {
  // useSearchParams needs a Suspense boundary for static prerendering.
  return <Suspense fallback={<div className="page"><TableSkeleton /></div>}><SupportDesk /></Suspense>;
}

function SupportDesk() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get('ticket');

  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const dSearch = useDebounced(search, 300);

  const qs = new URLSearchParams({ page: String(page), pageSize: '20', ...(status ? { status } : {}), ...(type ? { type } : {}), ...(dSearch ? { search: dSearch } : {}) });
  const { data, isLoading, mutate } = useSWR(`/api/admin/support?${qs.toString()}`, swrFetcher, { refreshInterval: 15000 });
  const { data: sumRes, mutate: mutateSummary } = useSWR('/api/admin/support/summary', swrFetcher, { refreshInterval: 15000 });
  const rows = (data?.data ?? []) as Ticket[];
  const pg = data?.pagination;
  const sum = sumRes?.data as Summary | undefined;

  const open = (id: string | null) => router.replace(id ? `/support?ticket=${encodeURIComponent(id)}` : '/support', { scroll: false });
  const refresh = () => { mutate(); mutateSummary(); };

  return (
    <div className="page">
      <h1 className="page-title">Support Tickets</h1>
      <p className="page-sub">Requests and grievances raised by customers from the website and app. Click a ticket to reply or change its status.</p>

      {sum && !sum.mailConfigured && (
        <div style={{ marginBottom: 14 }}>
          <Callout tone="amber" icon="✉">
            Email notifications are not configured on the server (set <span className="mono">SMTP_HOST</span>, <span className="mono">MAIL_FROM</span> and <span className="mono">SUPPORT_NOTIFY_TO</span>). Tickets are still saved here — you just won&apos;t get an email for new ones.
          </Callout>
        </div>
      )}

      <div className="row wrap" style={{ gap: 12, marginBottom: 14 }}>
        <Tile label="Needs action" value={sum?.needsAction} tone="amber" />
        <Tile label="Open" value={sum?.open} tone="amber" />
        <Tile label="In progress" value={sum?.in_progress} tone="blue" />
        <Tile label="Resolved" value={sum?.resolved} tone="green" />
        <Tile label="Grievances pending" value={sum?.grievancesOpen} tone="red" />
      </div>

      <Card>
        <div className="row between wrap" style={{ gap: 12, marginBottom: 14 }}>
          <div className="row wrap" style={{ gap: 14 }}>
            <FilterChips options={STATUS_FILTERS as unknown as { key: string; label: string }[]} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
            <FilterChips options={TYPE_FILTERS as unknown as { key: string; label: string }[]} value={type} onChange={(v) => { setType(v); setPage(1); }} />
          </div>
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Ticket #, name, phone, subject…" />
        </div>

        {isLoading ? <TableSkeleton /> : rows.length === 0 ? <Empty label="No tickets match" /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Ticket</th><th>Customer</th><th>Category</th><th>Subject</th><th>Status</th><th>Mail</th><th>Raised</th></tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} onClick={() => open(t.id)} style={t.id === selectedId ? { background: 'var(--teal-bg)' } : undefined}>
                    <td className="mono">{t.ref}{t.type === 'grievance' && <span className="badge tone-red" style={{ marginLeft: 8 }}>Grievance</span>}</td>
                    <td>{t.user.fullName || '—'}<div className="muted mono" style={{ fontSize: 11.5 }}>+91 {t.user.phone}</div></td>
                    <td>{t.categoryLabel.split(' (')[0]}</td>
                    <td style={{ maxWidth: 320 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</div></td>
                    <td><StatusBadge status={t.status} label={STATUS_LABEL[t.status]} /></td>
                    <td>{t.emailSentAt ? <span className="muted" title={`Emailed ${timeAgo(t.emailSentAt)}`}>✓ sent</span> : <span style={{ color: 'var(--amber)' }} title={t.emailError ?? 'Not emailed'}>not sent</span>}</td>
                    <td className="muted" title={dateStr(t.createdAt)}>{timeAgo(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pg && <Pagination page={pg.page} totalPages={pg.totalPages} onPage={setPage} />}
      </Card>

      {selectedId && <TicketPanel key={selectedId} id={selectedId} onClose={() => open(null)} onChanged={refresh} onOpen={open} />}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number | undefined; tone: 'amber' | 'blue' | 'green' | 'red' }) {
  return (
    <div className="card card-pad" style={{ minWidth: 150, flex: '1 1 150px' }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 2, color: `var(--${tone})` }}>{value ?? '—'}</div>
    </div>
  );
}

function TicketPanel({ id, onClose, onChanged, onOpen }: { id: string; onClose: () => void; onChanged: () => void; onOpen: (id: string) => void }) {
  const { data, isLoading, error, mutate } = useSWR(`/api/admin/support/${id}`, swrFetcher);
  const t = data?.data as Detail | undefined;
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

  useEffect(() => { if (t) setNote(t.adminNote ?? ''); }, [t?.id, t?.adminNote]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function patch(body: { status?: Status; adminNote?: string | null }, label: string) {
    setBusy(label); setMsg(null);
    try {
      await apiFetch(`/api/admin/support/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      await mutate(); onChanged();
      setMsg({ tone: 'green', text: label === 'note' ? 'Reply saved — the customer can see it on their Support page.' : 'Status updated.' });
    } catch (e) { setMsg({ tone: 'red', text: (e as Error).message || 'Update failed' }); }
    finally { setBusy(null); }
  }

  async function resend() {
    setBusy('mail'); setMsg(null);
    try {
      await apiFetch(`/api/admin/support/${id}/resend-email`, { method: 'POST' });
      await mutate(); onChanged();
      setMsg({ tone: 'green', text: 'Notification email sent.' });
    } catch (e) { await mutate(); onChanged(); setMsg({ tone: 'red', text: (e as Error).message || 'Email failed' }); }
    finally { setBusy(null); }
  }

  const noteDirty = (note.trim() || null) !== (t?.adminNote ?? null);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,32,0.45)', zIndex: 900, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <aside className="card" style={{ width: '100%', maxWidth: 560, height: '100%', borderRadius: 0, overflowY: 'auto', padding: 22 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Ticket details">
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="mono muted" style={{ fontSize: 12 }}>{t?.ref ?? 'Ticket'}</div>
            <h2 style={{ margin: '4px 0 0', fontSize: 18, lineHeight: 1.3 }}>{t?.subject ?? 'Loading…'}</h2>
          </div>
          <button className="btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {isLoading && <div style={{ marginTop: 18 }}><TableSkeleton rows={5} cols={2} /></div>}
        {error && <div style={{ marginTop: 18 }}><Callout tone="red">Could not load this ticket.</Callout></div>}

        {t && (
          <>
            <div className="row wrap" style={{ gap: 8, margin: '12px 0 16px' }}>
              <StatusBadge status={t.status} label={STATUS_LABEL[t.status]} />
              {t.type === 'grievance' && <span className="badge tone-red">Grievance · reply within 24h</span>}
              <span className="badge tone-grey">{t.categoryLabel}</span>
              <span className="muted" style={{ fontSize: 12 }}>Raised {dateStr(t.createdAt)} · {timeAgo(t.createdAt)}</span>
            </div>

            <Section title="Message">
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 13.5, background: 'var(--bg, #f6f8f8)', borderRadius: 10, padding: 14 }}>{t.body || <span className="muted">No message provided.</span>}</div>
            </Section>

            <Section title="Customer">
              <KV k="Name" v={t.user.fullName || '—'} />
              <KV k="Mobile" v={<a href={`tel:+91${t.user.phone}`}>+91 {t.user.phone}</a>} />
              <KV k="Email" v={t.user.email ? <a href={`mailto:${t.user.email}`}>{t.user.email}</a> : '—'} />
              <KV k="Profile" v={<Link href={`/users/${t.user.id}`}>Open user profile →</Link>} />
            </Section>

            {t.application && (
              <Section title="Linked application">
                <KV k="Reference" v={<Link href={`/loans/${t.application.id}`}>{t.application.ref} →</Link>} />
                <KV k="Amount" v={inrRupees(t.application.amount)} />
                <KV k="Status" v={<StatusBadge status={t.application.status} />} />
              </Section>
            )}

            <Section title="Status">
              <div className="row wrap" style={{ gap: 8 }}>
                {(['open', 'in_progress', 'resolved'] as Status[]).map((s) => (
                  <button key={s} className={`chip-filter ${t.status === s ? 'active' : ''}`} disabled={busy !== null || t.status === s} onClick={() => patch({ status: s }, s)}>{STATUS_LABEL[s]}</button>
                ))}
              </div>
              {t.resolvedAt && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Resolved {dateStr(t.resolvedAt)}</div>}
            </Section>

            <Section title="Reply to customer">
              <textarea className="input" rows={4} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="Write an update — the customer sees this under their ticket on the Support page." style={{ resize: 'vertical', lineHeight: 1.5 }} />
              <div className="row between" style={{ marginTop: 8 }}>
                <span className="muted" style={{ fontSize: 12 }}>{note.length}/2000</span>
                <button className="btn btn-primary" disabled={!noteDirty || busy !== null} onClick={() => patch({ adminNote: note.trim() || null }, 'note')}>{busy === 'note' ? 'Saving…' : 'Save reply'}</button>
              </div>
            </Section>

            {msg && <div style={{ marginBottom: 14 }}><Callout tone={msg.tone === 'green' ? 'blue' : 'red'}>{msg.text}</Callout></div>}

            <Section title="Notification email">
              {t.emailSentAt ? (
                <div className="row between"><span className="muted" style={{ fontSize: 13 }}>✓ Sent to the support inbox {timeAgo(t.emailSentAt)}</span><button className="btn" disabled={busy !== null} onClick={resend}>{busy === 'mail' ? 'Sending…' : 'Resend'}</button></div>
              ) : (
                <div className="row between"><span style={{ fontSize: 13, color: 'var(--amber)' }}>Not sent{t.emailError ? ` — ${t.emailError}` : ''}</span><button className="btn" disabled={busy !== null} onClick={resend}>{busy === 'mail' ? 'Sending…' : 'Send now'}</button></div>
              )}
            </Section>

            {t.otherTickets.length > 0 && (
              <Section title="Other tickets from this customer">
                {t.otherTickets.map((o) => (
                  <div key={o.id} className="row between" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => onOpen(o.id)}>
                    <span style={{ fontSize: 13 }}><span className="mono muted">{o.ref}</span> · {o.subject}</span>
                    <StatusBadge status={o.status} label={STATUS_LABEL[o.status]} />
                  </div>
                ))}
              </Section>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="row" style={{ padding: '5px 0', fontSize: 13.5 }}><span className="muted" style={{ width: 110 }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span></div>;
}
