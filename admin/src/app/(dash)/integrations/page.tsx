'use client';
import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher, apiFetch, ApiError } from '@/lib/api';
import { Card, StatusBadge, TableSkeleton, Empty } from '@/components/ui';

type Provider = 'ello' | 'upshot';

interface Integration {
  provider: Provider;
  enabled: boolean;
  settings: Record<string, unknown>;
  secretKeys: Record<string, boolean>;
}

const META: Record<Provider, { title: string; sub: string; icon: string; required: string[]; requiredSecrets: string[] }> = {
  ello: {
    title: 'Ello — Outbound Voice',
    sub: 'Places AI voice calls for campaigns and re-engagement nudges.',
    icon: '☎',
    required: ['baseUrl', 'assistantId'],
    requiredSecrets: ['apiKey'],
  },
  upshot: {
    title: 'Upshot — Push / WhatsApp / SMS',
    sub: 'Delivers push, WhatsApp, SMS and email nudges to customers.',
    icon: '✉',
    required: ['baseUrl', 'appId'],
    requiredSecrets: ['apiKey'],
  },
};

const PROVIDERS: Provider[] = ['ello', 'upshot'];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function labelFor(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
}

export default function IntegrationsPage() {
  const { data, error, isLoading, mutate } = useSWR('/api/admin/integrations', swrFetcher);
  const { data: defaultsRes, isLoading: loadingDefaults } = useSWR('/api/admin/integrations/defaults', swrFetcher);

  // The API nests these inside the `data` envelope as `{ providers }` and
  // `{ defaults }`. Read both that shape and a bare payload, so neither a
  // crash (`list.find is not a function`) nor a silently empty settings form
  // depends on which one the server happens to send.
  const payload = data?.data as Integration[] | { providers?: Integration[] } | undefined;
  const list: Integration[] = Array.isArray(payload) ? payload : (payload?.providers ?? []);

  type DefaultsMap = Partial<Record<Provider, Record<string, unknown>>>;
  const defaultsPayload = defaultsRes?.data as DefaultsMap | { defaults?: DefaultsMap } | undefined;
  const defaults: DefaultsMap =
    (defaultsPayload && 'defaults' in defaultsPayload
      ? defaultsPayload.defaults
      : (defaultsPayload as DefaultsMap)) ?? {};

  if (error) {
    return (
      <div className="page">
        <h1 className="page-title">Integrations</h1>
        <Card>
          <div className="empty">Could not load integrations — {(error as Error).message}<br />
            <button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Integrations</h1>
      <p className="page-sub">One place to configure every external API. Secret values are never returned by the server — an existing secret shows as “set” and is only overwritten when you type a replacement.</p>

      {isLoading || loadingDefaults ? (
        <Card><TableSkeleton rows={8} cols={3} /></Card>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(430px,1fr))', marginTop: 16, alignItems: 'start' }}>
          {PROVIDERS.map((p) => (
            <ProviderCard
              key={p}
              provider={p}
              integration={list.find((i) => i.provider === p)}
              defaults={(defaults[p] ?? {}) as Record<string, unknown>}
              onSaved={() => mutate()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderCard({ provider, integration, defaults, onSaved }: {
  provider: Provider;
  integration?: Integration;
  defaults: Record<string, unknown>;
  onSaved: () => void;
}) {
  const meta = META[provider];

  // The union of the scaffold keys (from /defaults) and whatever the server has stored,
  // so the operator can always see exactly which settings exist.
  const keys = useMemo(() => {
    const set = new Set<string>([...Object.keys(defaults), ...Object.keys(integration?.settings ?? {})]);
    return Array.from(set);
  }, [defaults, integration?.settings]);

  const secretKeys = useMemo(() => {
    const set = new Set<string>([...meta.requiredSecrets, ...Object.keys(integration?.secretKeys ?? {})]);
    return Array.from(set);
  }, [meta.requiredSecrets, integration?.secretKeys]);

  // Local edit buffer. Nested objects are edited as JSON text.
  const initial = useMemo(() => {
    const out: Record<string, string> = {};
    for (const k of keys) {
      const v = integration?.settings?.[k] !== undefined ? integration.settings[k] : defaults[k];
      out[k] = isObj(v) || Array.isArray(v) ? JSON.stringify(v ?? {}, null, 2) : v == null ? '' : String(v);
    }
    return out;
  }, [keys, integration?.settings, defaults]);

  const [form, setForm] = useState<Record<string, string> | null>(null);
  const values = form ?? initial;
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const isEnabled = enabled ?? integration?.enabled ?? false;

  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [replacing, setReplacing] = useState<Record<string, boolean>>({});

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<unknown>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [confirmCall, setConfirmCall] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  function isJsonField(k: string) {
    const v = integration?.settings?.[k] !== undefined ? integration.settings[k] : defaults[k];
    return isObj(v) || Array.isArray(v) || /Map$/.test(k);
  }

  function setField(k: string, v: string) {
    setForm({ ...values, [k]: v });
    setSaveMsg(null);
  }

  // Required-field readiness: every required setting has a value and every required
  // secret is either already stored or being typed now.
  const missing = [
    ...meta.required.filter((k) => !String(values[k] ?? '').trim()),
    ...meta.requiredSecrets.filter((k) => !integration?.secretKeys?.[k] && !secrets[k]?.trim()),
  ];

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const settings: Record<string, unknown> = {};
      for (const k of keys) {
        const raw = values[k] ?? '';
        if (isJsonField(k)) {
          if (!raw.trim()) { settings[k] = {}; continue; }
          try {
            settings[k] = JSON.parse(raw);
          } catch {
            throw new Error(`"${labelFor(k)}" is not valid JSON`);
          }
        } else {
          settings[k] = raw;
        }
      }
      // Only send secrets the operator actually typed — an empty string means
      // "keep the stored value" server-side, so we omit untouched keys entirely.
      const payloadSecrets: Record<string, string> = {};
      for (const [k, v] of Object.entries(secrets)) if (v.trim()) payloadSecrets[k] = v;

      await apiFetch(`/api/admin/integrations/${provider}`, {
        method: 'PUT',
        body: JSON.stringify({
          enabled: isEnabled,
          settings,
          ...(Object.keys(payloadSecrets).length ? { secrets: payloadSecrets } : {}),
        }),
      });
      setSecrets({});
      setReplacing({});
      setForm(null);
      setEnabled(null);
      setSaveMsg({ ok: true, text: 'Saved' });
      onSaved();
    } catch (e) {
      setSaveMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const body: Record<string, unknown> = {};
      if (provider === 'ello' && confirmCall) { body.confirm = true; body.testPhone = testPhone; }
      const res = await apiFetch(`/api/admin/integrations/${provider}/test`, { method: 'POST', body: JSON.stringify(body) });
      setTestResult(res.data ?? res);
    } catch (e) {
      setTestError(e instanceof ApiError ? `HTTP ${e.status} — ${e.message}` : (e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  const canTestCall = !confirmCall || /\d{6,}/.test(testPhone);

  return (
    <Card
      title={`${meta.icon}  ${meta.title}`}
      sub={meta.sub}
      right={<StatusBadge status={isEnabled ? 'active' : 'not_started'} label={isEnabled ? 'Enabled' : 'Disabled'} />}
    >
      {!integration && (
        <div className="empty" style={{ marginBottom: 14 }}>
          Not configured yet — fill in the fields below and save to create this integration.
        </div>
      )}

      <label className="row" style={{ gap: 8, margin: '10px 0 16px', cursor: 'pointer' }}>
        <input type="checkbox" checked={isEnabled} onChange={(e) => { setEnabled(e.target.checked); setSaveMsg(null); }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Enabled</span>
        <span className="muted" style={{ fontSize: 12 }}>· turn off to stop all outbound traffic to this provider</span>
      </label>

      {/* settings */}
      <div className="nav-section" style={{ padding: 0, marginBottom: 8 }}>Settings</div>
      {keys.length === 0 ? <Empty label="No settings keys advertised by the server" /> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {keys.map((k) => {
            const required = meta.required.includes(k);
            const json = isJsonField(k);
            let jsonErr: string | null = null;
            if (json && (values[k] ?? '').trim()) {
              try { JSON.parse(values[k]); } catch { jsonErr = 'Invalid JSON'; }
            }
            return (
              <div key={k}>
                <label style={{ fontSize: 12.5, fontWeight: 600 }}>
                  {labelFor(k)} {required && <span style={{ color: 'var(--red)' }}>*</span>}
                  {json && <span className="muted" style={{ fontWeight: 400 }}> · JSON</span>}
                </label>
                {json ? (
                  <textarea
                    className="input mono"
                    style={{ marginTop: 6, minHeight: 96, resize: 'vertical', fontSize: 12, borderColor: jsonErr ? 'var(--red)' : undefined }}
                    value={values[k] ?? ''}
                    onChange={(e) => setField(k, e.target.value)}
                    placeholder="{}"
                  />
                ) : (
                  <input
                    className="input"
                    style={{ marginTop: 6, borderColor: required && !String(values[k] ?? '').trim() ? 'var(--amber)' : undefined }}
                    value={values[k] ?? ''}
                    onChange={(e) => setField(k, e.target.value)}
                    placeholder={defaults[k] != null && !isObj(defaults[k]) ? String(defaults[k]) : ''}
                  />
                )}
                {jsonErr && <div style={{ color: 'var(--red)', fontSize: 11.5, marginTop: 4 }}>{jsonErr}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* secrets */}
      <div className="nav-section" style={{ padding: 0, margin: '20px 0 8px' }}>Secrets</div>
      <div style={{ display: 'grid', gap: 12 }}>
        {secretKeys.map((k) => {
          const stored = !!integration?.secretKeys?.[k];
          const editing = replacing[k] || !stored;
          const required = meta.requiredSecrets.includes(k);
          return (
            <div key={k}>
              <div className="row between">
                <label style={{ fontSize: 12.5, fontWeight: 600 }}>
                  {labelFor(k)} {required && <span style={{ color: 'var(--red)' }}>*</span>}
                </label>
                <span className="row" style={{ gap: 8 }}>
                  <StatusBadge status={stored ? 'verified' : 'not_started'} label={stored ? '•••• set' : 'not set'} />
                  {stored && (
                    <button
                      className="btn"
                      style={{ padding: '3px 9px', fontSize: 11.5 }}
                      onClick={() => {
                        const next = { ...replacing, [k]: !replacing[k] };
                        setReplacing(next);
                        if (replacing[k]) setSecrets((s) => { const c = { ...s }; delete c[k]; return c; });
                      }}
                    >{replacing[k] ? 'Cancel' : 'Replace'}</button>
                  )}
                </span>
              </div>
              {editing && (
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  style={{ marginTop: 6 }}
                  value={secrets[k] ?? ''}
                  onChange={(e) => { setSecrets({ ...secrets, [k]: e.target.value }); setSaveMsg(null); }}
                  placeholder={stored ? 'Enter a new value to replace' : 'Paste the key'}
                />
              )}
            </div>
          );
        })}
      </div>

      {missing.length > 0 && (
        <div className="empty" style={{ marginTop: 16, textAlign: 'left', color: 'var(--amber)' }}>
          Required before this integration can work: {missing.map(labelFor).join(', ')}
        </div>
      )}

      <div className="row" style={{ gap: 10, marginTop: 18 }}>
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="btn" disabled={testing || !canTestCall} onClick={runTest}>{testing ? 'Testing…' : 'Test connection'}</button>
        {saveMsg && <span style={{ fontSize: 12.5, color: saveMsg.ok ? 'var(--green)' : 'var(--red)' }}>{saveMsg.text}</span>}
      </div>

      {/* the ello test can place a real phone call — make that an explicit opt-in */}
      {provider === 'ello' && (
        <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
          <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={confirmCall} onChange={(e) => setConfirmCall(e.target.checked)} />
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Place a real test call</span>
          </label>
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
            Off by default the test only checks credentials and reachability. Ticking this dials the number below for real.
          </p>
          {confirmCall && (
            <input
              className="input mono"
              style={{ marginTop: 8 }}
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+91XXXXXXXXXX"
            />
          )}
          {confirmCall && !canTestCall && <div style={{ color: 'var(--red)', fontSize: 11.5, marginTop: 4 }}>Enter a phone number to place a real call.</div>}
        </div>
      )}

      {(testResult != null || testError) && (
        <div style={{ marginTop: 14 }}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Test result</span>
            <StatusBadge status={testError ? 'failed' : 'completed'} label={testError ? 'Failed' : 'OK'} />
          </div>
          <pre
            className="mono"
            style={{ background: 'var(--grey-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, fontSize: 11.5, maxHeight: 280, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >{testError ?? JSON.stringify(testResult, null, 2)}</pre>
        </div>
      )}
    </Card>
  );
}
