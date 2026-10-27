'use client';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/api';
import { Callout } from '@/components/ui';
import SentMessages from '@/components/whatsapp/SentMessages';

interface Summary {
  counts: Record<string, Record<string, number>>; stuck: number;
  callbackConfigured: boolean; webhookKeySet: boolean; publicBaseIsHttps: boolean;
}

export default function MessagesPage() {
  const { data: sumRes } = useSWR('/api/admin/messages/summary', swrFetcher, { refreshInterval: 10000 });
  const sum = sumRes?.data as Summary | undefined;
  const wa = sum?.counts?.whatsapp ?? {};

  return (
    <div className="page">
      <h1 className="page-title">Messages</h1>
      <p className="page-sub">WhatsApp and SMS we sent, and what happened to them. A &quot;queued&quot; answer from the provider only means it accepted the message: Delivered or Read below means it reached the phone.</p>

      {sum && !sum.callbackConfigured && (
        <div style={{ marginBottom: 14 }}>
          <Callout tone="amber" icon="⚠">
            WhatsApp delivery reports cannot reach us yet, so every message will stay at &quot;queued&quot;.
            {!sum.webhookKeySet && <> Set <span className="mono">WHATSAPP_WEBHOOK_KEY</span> on the server.</>}
            {!sum.publicBaseIsHttps && <> Set <span className="mono">PUBLIC_BASE_URL</span> to the server&apos;s public https address.</>}
            {' '}Or paste a callback URL in Configs → Voxvalley (<span className="mono">callbackUrl</span>). The URL is <span className="mono">…/api/webhooks/whatsapp?key=&lt;key&gt;</span>.
          </Callout>
        </div>
      )}
      {sum && sum.stuck > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Callout tone="red" icon="!">
            {sum.stuck} WhatsApp message{sum.stuck === 1 ? '' : 's'} accepted by the gateway but with no delivery report after 15 minutes. Check the template approval and sender in the provider portal, quoting the message ID.
          </Callout>
        </div>
      )}

      <div className="row wrap" style={{ gap: 12, marginBottom: 14 }}>
        <Tile label="Delivered (24 h)" value={(wa.delivered ?? 0) + (wa.read ?? 0)} tone="green" />
        <Tile label="Read" value={wa.read ?? 0} tone="teal" />
        <Tile label="Sent, no report" value={wa.sent ?? 0} tone="blue" />
        <Tile label="Queued" value={wa.queued ?? 0} tone="amber" />
        <Tile label="Failed" value={wa.failed ?? 0} tone="red" />
        <Tile label="Stuck 15 min+" value={sum?.stuck} tone="red" />
      </div>

      <SentMessages />
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number | undefined; tone: 'amber' | 'blue' | 'green' | 'red' | 'teal' }) {
  return (
    <div className="card card-pad" style={{ minWidth: 140, flex: '1 1 140px' }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 2, color: `var(--${tone})` }}>{value ?? '—'}</div>
    </div>
  );
}
