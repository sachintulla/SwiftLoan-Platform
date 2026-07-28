'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { swrFetcher, apiFetch, API_BASE } from '@/lib/api';
import { Card } from '@/components/ui';
import { inr } from '@/lib/format';

interface Build {
  key: string; label: string; description: string; applicationId: string; url: string; context: boolean;
}
interface Manifest { version: string; deepLinkScheme: string; builds: Build[] }

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn" style={{ padding: '6px 10px', fontSize: 12 }} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch {}
    }}>{done ? 'Copied ✓' : 'Copy'}</button>
  );
}

export default function AppBuilds() {
  const { data } = useSWR('/api/downloads/manifest', swrFetcher);
  const manifest = data?.data as Manifest | undefined;

  // context-link generator state
  const [name, setName] = useState('');
  const [product, setProduct] = useState('Personal Loan');
  const [amount, setAmount] = useState('500000');
  const [gen, setGen] = useState<{ landingUrl: string; deepLink: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true); setGen(null);
    try {
      const res = await apiFetch<{ landingUrl: string; deepLink: string; token: string }>('/api/context/create', {
        method: 'POST',
        body: JSON.stringify({
          name: name || undefined,
          product,
          amount: Math.round((Number(amount) || 0) * 100),
          summary: `${name ? name + ' — ' : ''}interested in a ${inr(Math.round((Number(amount) || 0) * 100))} ${product.toLowerCase()} (generated from admin).`,
          source: 'admin',
        }),
      });
      setGen(res.data);
    } finally { setBusy(false); }
  }

  return (
    <Card title="Get the app" sub="Two builds live for download — share the context build's link so a lead resumes their journey in-app.">
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
        {(manifest?.builds ?? []).map((b) => (
          <div key={b.key} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="row between">
              <span className="badge" style={{ background: b.context ? 'var(--teal-bg)' : 'var(--grey-bg)', color: b.context ? 'var(--teal)' : 'var(--text-dim)' }}>{b.context ? 'Context-aware' : 'Generic'}</span>
              <span className="muted mono" style={{ fontSize: 11 }}>v{manifest?.version}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{b.label}</div>
            <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, minHeight: 36 }}>{b.description}</div>
            <div className="muted mono" style={{ fontSize: 11 }}>{b.applicationId}</div>
            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              <a className="btn btn-primary" style={{ flex: 1, textAlign: 'center' }} href={b.url} target="_blank" rel="noopener">⬇ Download APK</a>
              <CopyBtn text={b.url} />
            </div>
          </div>
        ))}
        {!manifest && <div className="muted" style={{ padding: 8 }}>Loading builds…</div>}
      </div>

      {/* context-link generator */}
      <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <div style={{ fontWeight: 650, fontSize: 13.5, marginBottom: 2 }}>Generate a context link</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>Creates a tracked download link that carries a lead&apos;s context — the app opens continuing their journey.</div>
        <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
          <div><label style={{ fontSize: 11.5, fontWeight: 600 }}>Name</label><input className="input" style={{ width: 150 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul" /></div>
          <div><label style={{ fontSize: 11.5, fontWeight: 600 }}>Product</label>
            <select className="input" style={{ width: 150 }} value={product} onChange={(e) => setProduct(e.target.value)}>
              <option>Personal Loan</option><option>Business Loan</option>
            </select>
          </div>
          <div><label style={{ fontSize: 11.5, fontWeight: 600 }}>Amount (₹)</label><input className="input" style={{ width: 130 }} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <button className="btn btn-primary" disabled={busy} onClick={generate}>{busy ? 'Generating…' : 'Generate link'}</button>
        </div>

        {gen && (
          <div style={{ marginTop: 14, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'grid', gap: 10 }}>
            <div>
              <div className="muted" style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>SHAREABLE DOWNLOAD LINK (landing page)</div>
              <div className="row" style={{ gap: 8 }}>
                <input className="input mono" style={{ fontSize: 12 }} readOnly value={gen.landingUrl} />
                <CopyBtn text={gen.landingUrl} />
                <a className="btn" style={{ padding: '8px 12px' }} href={gen.landingUrl} target="_blank" rel="noopener">Open</a>
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>DEEP LINK (opens installed app with context)</div>
              <div className="row" style={{ gap: 8 }}>
                <input className="input mono" style={{ fontSize: 12 }} readOnly value={gen.deepLink} />
                <CopyBtn text={gen.deepLink} />
              </div>
            </div>
            <div className="muted" style={{ fontSize: 11 }}>Token <b className="mono">{gen.token}</b> · resolves to the saved context via {API_BASE}/api/context/{gen.token}</div>
          </div>
        )}
      </div>
    </Card>
  );
}
