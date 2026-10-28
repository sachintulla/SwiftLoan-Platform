'use client';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import SentMessages from '@/components/whatsapp/SentMessages';

interface Summary {
  counts: Record<string, Record<string, number>>; stuck: number;
  callbackConfigured: boolean; webhookKeySet: boolean; publicBaseIsHttps: boolean;
}

export default function MessagesPage() {
  const { data: sumRes } = useSWR('/api/admin/messages/summary', swrFetcher, { refreshInterval: 10000 });
  const sum = sumRes?.data as Summary | undefined;
  const wa = sum?.counts?.whatsapp ?? {};

  const sms = sum?.counts?.sms ?? {};
  const n = (k: string) => (wa[k] ?? 0) + (sms[k] ?? 0);

  return (
    <div className="page">
      <div className="row wrap" style={{ gap: 12, marginBottom: 14 }}>
        <Tile label="Delivered (24 h)" value={n('delivered') + n('read')} tone="green" />
        <Tile label="Waiting (24 h)" value={n('queued') + n('sent')} tone="amber" />
        <Tile label="Failed (24 h)" value={n('failed')} tone="red" />
      </div>

      <SentMessages />
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number | undefined; tone: 'amber' | 'blue' | 'green' | 'red' | 'teal' }) {
  return (
    <div className="card card-pad" style={{ minWidth: 120, flex: '1 1 120px', padding: '12px 16px' }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 2, color: `var(--${tone})` }}>{value ?? '—'}</div>
    </div>
  );
}
