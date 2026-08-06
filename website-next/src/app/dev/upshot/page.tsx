'use client';

import { useEffect, useState } from 'react';
import { UPSHOT_EVENTS, COMMON_ATTRIBUTES } from '@/lib/upshotEvents';
import { upshotEvent, upshotIdentify } from '@/components/UpshotWeb';

/**
 * Dev-only: fire the whole event catalogue into Upshot.
 *
 * Upshot's dashboard can only build a campaign against an event it has already
 * received, so each one has to be sent at least once before the messaging can
 * be authored. This page does that in one click, with the same attribute types
 * the real events use — Upshot infers an attribute's type from the first event
 * it sees, so sending `amount` as a string here would make it a string forever.
 *
 * Not linked from anywhere and blocked outside development.
 */
export default function UpshotDevPage() {
  const [ready, setReady] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      if ((window as unknown as { __upshotReady?: boolean }).__upshotReady) {
        setReady(true);
        clearInterval(t);
      }
    }, 500);
    return () => clearInterval(t);
  }, []);

  if (process.env.NODE_ENV !== 'development') {
    return <main style={{ padding: 40, fontFamily: 'system-ui' }}>Not available.</main>;
  }

  const say = (s: string) => setLog((l) => [...l, s]);

  async function fireAll() {
    setBusy(true);
    setLog([]);

    // Identify first: an event with no known user is far less useful, and the
    // profile must exist before a campaign can target it.
    upshotIdentify({
      phone: '9876543210',
      name: 'Catalogue Seed',
      email: 'catalogue@swiftloan.test',
      city: 'Pune',
    });
    say('identify → +919876543210 (Catalogue Seed)');

    for (const e of UPSHOT_EVENTS) {
      const attrs = { ...COMMON_ATTRIBUTES, ...e.attributes, seeded: true };
      upshotEvent(e.name, attrs);
      say(`${e.name}  ${JSON.stringify(e.attributes)}`);
      // Small gap so the SDK's dispatcher batches rather than drops.
      await new Promise((r) => setTimeout(r, 120));
    }

    say('');
    say(`done — ${UPSHOT_EVENTS.length} events queued.`);
    say('Upshot dispatches on its own interval; allow a minute before checking the dashboard.');
    setBusy(false);
  }

  return (
    <main style={{ padding: 40, fontFamily: 'system-ui', maxWidth: 860, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 4 }}>Upshot event catalogue</h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        Fires every SwiftLoan event once so it becomes selectable when authoring
        campaigns on the Upshot dashboard. Development only.
      </p>

      <div
        style={{
          padding: '10px 14px',
          borderRadius: 10,
          background: ready ? '#e8f6ee' : '#fff4e5',
          border: `1px solid ${ready ? '#b6e0c6' : '#ffd8a8'}`,
          margin: '16px 0',
          fontSize: 14,
        }}
      >
        {ready
          ? 'Upshot SDK initialised — ready to send.'
          : 'Waiting for the Upshot SDK… if this never turns green, NEXT_PUBLIC_UPSHOT_APP_ID / _OWNER_ID are missing.'}
      </div>

      <button
        onClick={fireAll}
        disabled={!ready || busy}
        style={{
          padding: '10px 18px',
          borderRadius: 8,
          border: 0,
          background: ready && !busy ? '#079FA0' : '#c9d4d4',
          color: '#fff',
          fontWeight: 600,
          cursor: ready && !busy ? 'pointer' : 'not-allowed',
        }}
      >
        {busy ? 'Sending…' : `Fire all ${UPSHOT_EVENTS.length} events`}
      </button>

      {log.length > 0 && (
        <pre
          style={{
            marginTop: 20, padding: 16, borderRadius: 10, background: '#0f2a2b',
            color: '#cfe8e8', fontSize: 12.5, lineHeight: 1.6, overflowX: 'auto',
          }}
        >
          {log.join('\n')}
        </pre>
      )}

      <h2 style={{ fontSize: 17, marginTop: 32 }}>Catalogue</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #e4eeed' }}>
            <th style={{ padding: '8px 6px' }}>Event</th>
            <th style={{ padding: '8px 6px' }}>Source</th>
            <th style={{ padding: '8px 6px' }}>Attributes</th>
          </tr>
        </thead>
        <tbody>
          {UPSHOT_EVENTS.map((e) => (
            <tr key={e.name} style={{ borderBottom: '1px solid #eef4f3' }}>
              <td style={{ padding: '7px 6px', fontFamily: 'ui-monospace, monospace' }}>{e.name}</td>
              <td style={{ padding: '7px 6px', color: '#5C6E6E' }}>{e.source}</td>
              <td style={{ padding: '7px 6px', color: '#5C6E6E' }}>
                {Object.keys(e.attributes).join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
