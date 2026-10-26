'use client';
// Send a one-off transactional notification (SMS / WhatsApp) to a single
// customer, via POST /api/notify. Pick a customer (or type a phone), choose a
// channel, write the message, send. Delivery status then shows in Messages.
import { useState } from 'react';
import useSWR from 'swr';
import { apiFetch, swrFetcher, ApiError } from '@/lib/api';
import { Card, SearchBox, Callout, StatusBadge } from '@/components/ui';
import { useDebounced } from '@/lib/hooks';

interface CustomerRow { id: string; name?: string | null; phone?: string | null; currentStage: string }
type Channel = 'auto' | 'whatsapp' | 'sms';
interface SendResult { messageId: string | null; channel: string; status: string; customerId: string }

const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'auto', label: 'Auto (WhatsApp → SMS)' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'sms', label: 'SMS' },
];

function asArray<T>(v: unknown): T[] { return Array.isArray(v) ? (v as T[]) : []; }

export default function NotifyPage() {
  const [search, setSearch] = useState('');
  const dSearch = useDebounced(search, 300);
  const [picked, setPicked] = useState<CustomerRow | null>(null);
  const [phone, setPhone] = useState('');
  const [channel, setChannel] = useState<Channel>('auto');
  const [text, setText] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'blue' | 'red'; text: string } | null>(null);

  // Search customers only when there's a query and nobody is picked yet.
  const { data, isLoading } = useSWR(
    !picked && dSearch.trim().length >= 2 ? `/api/admin/customers?pageSize=8&search=${encodeURIComponent(dSearch.trim())}` : null,
    swrFetcher,
  );
  const results = asArray<CustomerRow>((data as { data?: unknown } | undefined)?.data);

  const targetPhone = picked?.phone || phone.trim();
  const dnc = picked?.currentStage === 'lost';
  const canSend = !busy && !dnc && !!targetPhone && (!!text.trim() || !!templateName.trim());

  const pick = (c: CustomerRow) => { setPicked(c); setSearch(''); setMsg(null); };
  const clearPick = () => { setPicked(null); setMsg(null); };

  async function send() {
    setBusy(true); setMsg(null);
    try {
      const body: Record<string, unknown> = { channel };
      if (picked) body.customerId = picked.id; else body.phone = phone.trim();
      if (text.trim()) body.text = text.trim();
      if (templateName.trim()) body.templateName = templateName.trim();
      body.kind = 'admin';
      const res = await apiFetch<SendResult>('/api/notify', { method: 'POST', body: JSON.stringify(body) });
      const d = res.data;
      setMsg({ tone: 'blue', text: `Sent via ${d.channel.toUpperCase()}${d.messageId ? ` · ref ${d.messageId}` : ''}. Track delivery in Messages.` });
      setText(''); setTemplateName('');
    } catch (e) {
      const err = e as ApiError;
      setMsg({ tone: 'red', text: err?.message || 'Could not send the notification.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 680 }}>
      <Card title="Recipient" sub="Pick a customer, or type a 10-digit mobile number.">
        {picked ? (
          <div className="row between" style={{ alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{picked.name || 'Unnamed'} · <span className="mono">{picked.phone}</span></div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Stage: {picked.currentStage}</div>
            </div>
            <button className="btn" onClick={clearPick}>Change</button>
          </div>
        ) : (
          <>
            <SearchBox value={search} onChange={setSearch} placeholder="Search name, phone or email…" />
            {dSearch.trim().length >= 2 && (
              <div style={{ marginTop: 8 }}>
                {isLoading ? (
                  <div className="muted" style={{ fontSize: 13 }}>Searching…</div>
                ) : results.length === 0 ? (
                  <div className="muted" style={{ fontSize: 13 }}>No customer found — you can still send to a phone number below.</div>
                ) : (
                  results.map((c) => (
                    <div key={c.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => pick(c)}>
                      <span style={{ fontSize: 13 }}>{c.name || 'Unnamed'} · <span className="mono muted">{c.phone}</span></span>
                      <StatusBadge status={c.currentStage} label={c.currentStage} />
                    </div>
                  ))
                )}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <label className="muted" style={{ fontSize: 12 }}>…or send to a phone number</label>
              <input className="input mono" value={phone} inputMode="numeric" maxLength={10}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9876543210" style={{ marginTop: 4 }} />
            </div>
          </>
        )}
        {dnc && <div style={{ marginTop: 12 }}><Callout tone="red" icon="⛔">This customer is marked do-not-contact — sending is blocked.</Callout></div>}
      </Card>

      <Card title="Channel">
        <div className="row wrap" style={{ gap: 8 }}>
          {CHANNELS.map((c) => (
            <button key={c.key} className={`chip-filter ${channel === c.key ? 'active' : ''}`} onClick={() => setChannel(c.key)}>{c.label}</button>
          ))}
        </div>
      </Card>

      <Card title="Message" sub="Free text, or a registered template name below. India SMS only delivers when the text matches a DLT-registered template.">
        <textarea className="input" rows={5} value={text} maxLength={4096}
          onChange={(e) => setText(e.target.value)}
          placeholder="Hi Sachin, following up on our call: your ₹2,00,000 offer at 18% is ready…"
          style={{ resize: 'vertical', lineHeight: 1.5 }} />
        <div className="row between" style={{ marginTop: 6 }}>
          <span className="muted" style={{ fontSize: 12 }}>{text.length}/4096</span>
        </div>
        <div style={{ marginTop: 10 }}>
          <label className="muted" style={{ fontSize: 12 }}>Template name (optional — approved WhatsApp template / DLT SMS template id)</label>
          <input className="input" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. offers_ready" style={{ marginTop: 4 }} />
        </div>
      </Card>

      {msg && <Callout tone={msg.tone}>{msg.text}</Callout>}

      <div className="row between">
        <span className="muted" style={{ fontSize: 12 }}>{targetPhone ? `To +91 ${targetPhone}` : 'No recipient selected'}</span>
        <button className="btn btn-primary" disabled={!canSend} onClick={send}>{busy ? 'Sending…' : 'Send notification'}</button>
      </div>
    </div>
  );
}
