'use client';
// One simple page for everything voice/messaging-related: is it connected, what
// key does it use, which agent answers which job, and what that agent says.
// Deliberately hides the rarely-touched plumbing (webhook field mappings,
// request paths, etc.) behind "Advanced" — a normal admin should be able to
// read this page top to bottom without knowing what any of that means.
import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher, apiFetch, ApiError, getAdmin } from '@/lib/api';
import { Card, StatusBadge, TableSkeleton, Empty, FilterChips } from '@/components/ui';

type Provider = 'ello' | 'upshot' | 'infobip';

interface Integration {
  provider: Provider;
  enabled: boolean;
  settings: Record<string, unknown>;
  secretKeys: Record<string, boolean>;
}

/** The only settings a normal admin should see up front; everything else the
 * provider ships is still editable under "Advanced", just out of the way. */
const ESSENTIAL: Record<Provider, string[]> = {
  ello: ['baseUrl'],
  upshot: ['baseUrl', 'appId'],
  // sender and defaultTemplate are up front because a send fails without them,
  // and the failure ("no template") is far less obvious than a missing key.
  infobip: ['baseUrl', 'sender', 'defaultTemplate', 'defaultLanguage'],
};

const META: Record<Provider, { title: string; sub: string; icon: string; requiredSecrets: string[] }> = {
  ello: { title: 'Voice calling (Ello)', sub: 'Places the outbound calls and powers the mic widgets.', icon: '☎', requiredSecrets: ['apiKey'] },
  upshot: { title: 'Messaging (Upshot)', sub: 'Sends push, WhatsApp, SMS and email nudges.', icon: '✉', requiredSecrets: ['apiKey'] },
  infobip: { title: 'WhatsApp (Infobip)', sub: 'Sends WhatsApp messages to customers from the dashboard.', icon: '💬', requiredSecrets: ['apiKey'] },
};

function labelFor(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
}
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const SUB_TABS = [
  { key: 'ello', label: '☎  Voice calling' },
  { key: 'agents', label: '🗣  Voice agents' },
  { key: 'upshot', label: '✉  Messaging' },
  { key: 'infobip', label: '💬  WhatsApp' },
  { key: 'api-keys', label: '🔑  API keys' },
] as const;
type SubTab = (typeof SUB_TABS)[number]['key'];

export default function ConfigsPage() {
  const [tab, setTab] = useState<SubTab>('ello');
  const { data, error, isLoading, mutate } = useSWR('/api/admin/integrations', swrFetcher);
  const { data: defaultsRes, isLoading: loadingDefaults } = useSWR('/api/admin/integrations/defaults', swrFetcher);

  const payload = data?.data as Integration[] | { providers?: Integration[] } | undefined;
  const list: Integration[] = Array.isArray(payload) ? payload : (payload?.providers ?? []);

  type DefaultsMap = Partial<Record<Provider, Record<string, unknown>>>;
  const defaultsPayload = defaultsRes?.data as DefaultsMap | { defaults?: DefaultsMap } | undefined;
  const defaults: DefaultsMap =
    (defaultsPayload && 'defaults' in defaultsPayload ? defaultsPayload.defaults : (defaultsPayload as DefaultsMap)) ?? {};

  if (error) {
    return (
      <div className="page">
        <h1 className="page-title">Configs</h1>
        <Card>
          <div className="empty">Could not load configuration — {(error as Error).message}<br />
            <button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="row between wrap" style={{ gap: 16, alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">Configs</h1>
          <p className="page-sub">Connect the voice and messaging providers, then decide which voice agent handles each job.</p>
        </div>
        <FilterChips options={SUB_TABS as unknown as { key: SubTab; label: string }[]} value={tab} onChange={setTab} />
      </div>

      {isLoading || loadingDefaults ? (
        <Card><TableSkeleton rows={6} cols={2} /></Card>
      ) : (
        <div style={{ marginTop: 16 }}>
          {tab === 'ello' && (
            <ProviderCard
              provider="ello"
              integration={list.find((i) => i.provider === 'ello')}
              defaults={(defaults.ello ?? {}) as Record<string, unknown>}
              onSaved={() => mutate()}
            />
          )}
          {tab === 'agents' && <VoiceAgents />}
          {tab === 'upshot' && (
            <ProviderCard
              provider="upshot"
              integration={list.find((i) => i.provider === 'upshot')}
              defaults={(defaults.upshot ?? {}) as Record<string, unknown>}
              onSaved={() => mutate()}
            />
          )}
          {tab === 'infobip' && (
            <ProviderCard
              provider="infobip"
              integration={list.find((i) => i.provider === 'infobip')}
              defaults={(defaults.infobip ?? {}) as Record<string, unknown>}
              onSaved={() => mutate()}
            />
          )}
          {tab === 'api-keys' && <ApiKeysPanel />}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── connection card ─────────────────────────── */

function ProviderCard({ provider, integration, defaults, onSaved }: {
  provider: Provider;
  integration?: Integration;
  defaults: Record<string, unknown>;
  onSaved: () => void;
}) {
  const meta = META[provider];
  const essentialKeys = ESSENTIAL[provider];
  const advancedKeys = useMemo(() => {
    const set = new Set<string>([...Object.keys(defaults), ...Object.keys(integration?.settings ?? {})]);
    essentialKeys.forEach((k) => set.delete(k));
    return Array.from(set);
  }, [defaults, integration?.settings, essentialKeys]);

  const allKeys = [...essentialKeys, ...advancedKeys];

  const initial = useMemo(() => {
    const out: Record<string, string> = {};
    for (const k of allKeys) {
      const v = integration?.settings?.[k] !== undefined ? integration.settings[k] : defaults[k];
      out[k] = isObj(v) || Array.isArray(v) ? JSON.stringify(v ?? {}, null, 2) : v == null ? '' : String(v);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integration?.settings, defaults]);

  const [form, setForm] = useState<Record<string, string> | null>(null);
  const values = form ?? initial;
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const isEnabled = enabled ?? integration?.enabled ?? false;

  const [secret, setSecret] = useState('');
  const [replacingSecret, setReplacingSecret] = useState(false);
  const secretKey = meta.requiredSecrets[0];
  const secretStored = !!integration?.secretKeys?.[secretKey];

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function isJsonField(k: string) {
    const v = integration?.settings?.[k] !== undefined ? integration.settings[k] : defaults[k];
    return isObj(v) || Array.isArray(v);
  }
  function setField(k: string, v: string) {
    setForm({ ...values, [k]: v });
    setSaveMsg(null);
  }

  const ready = essentialKeys.every((k) => String(values[k] ?? '').trim()) && (secretStored || secret.trim());

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const settings: Record<string, unknown> = {};
      for (const k of allKeys) {
        const raw = values[k] ?? '';
        if (isJsonField(k)) {
          if (!raw.trim()) { settings[k] = {}; continue; }
          try { settings[k] = JSON.parse(raw); } catch { throw new Error(`"${labelFor(k)}" is not valid JSON`); }
        } else {
          settings[k] = raw;
        }
      }
      await apiFetch(`/api/admin/integrations/${provider}`, {
        method: 'PUT',
        body: JSON.stringify({
          enabled: isEnabled,
          settings,
          ...(secret.trim() ? { secrets: { [secretKey]: secret.trim() } } : {}),
        }),
      });
      setSecret('');
      setReplacingSecret(false);
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

  async function testConnection() {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await apiFetch<{ ready?: boolean; missing?: string[] }>(`/api/admin/integrations/${provider}/test`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const ok = res.data?.ready !== false;
      setTestMsg({ ok, text: ok ? 'Looks good — connection details are complete' : `Missing: ${(res.data?.missing ?? []).join(', ')}` });
    } catch (e) {
      setTestMsg({ ok: false, text: e instanceof ApiError ? e.message : (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card
      title={`${meta.icon}  ${meta.title}`}
      sub={meta.sub}
      right={<StatusBadge status={isEnabled ? 'active' : 'not_started'} label={isEnabled ? 'Connected' : 'Off'} />}
    >
      <label className="row" style={{ gap: 8, margin: '4px 0 16px', cursor: 'pointer' }}>
        <input type="checkbox" checked={isEnabled} onChange={(e) => { setEnabled(e.target.checked); setSaveMsg(null); }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Turn on</span>
      </label>

      <div style={{ display: 'grid', gap: 12, maxWidth: 460 }}>
        {essentialKeys.map((k) => (
          <div key={k}>
            <label style={{ fontSize: 12.5, fontWeight: 600 }}>{labelFor(k)}</label>
            <input
              className="input"
              style={{ marginTop: 6 }}
              value={values[k] ?? ''}
              onChange={(e) => setField(k, e.target.value)}
              placeholder={defaults[k] != null && !isObj(defaults[k]) ? String(defaults[k]) : ''}
            />
          </div>
        ))}

        <div>
          <div className="row between">
            <label style={{ fontSize: 12.5, fontWeight: 600 }}>API key</label>
            {secretStored && (
              <button className="btn" style={{ padding: '3px 9px', fontSize: 11.5 }} onClick={() => setReplacingSecret((v) => !v)}>
                {replacingSecret ? 'Cancel' : 'Replace'}
              </button>
            )}
          </div>
          {secretStored && !replacingSecret ? (
            <div style={{ marginTop: 6 }}><StatusBadge status="verified" label="•••• saved" /></div>
          ) : (
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              style={{ marginTop: 6 }}
              value={secret}
              onChange={(e) => { setSecret(e.target.value); setSaveMsg(null); }}
              placeholder="Paste the key"
            />
          )}
        </div>
      </div>

      {advancedKeys.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>Advanced settings</summary>
          <div style={{ display: 'grid', gap: 12, marginTop: 12, maxWidth: 460 }}>
            {advancedKeys.map((k) => {
              const json = isJsonField(k);
              return (
                <div key={k}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>{labelFor(k)}{json && <span className="muted" style={{ fontWeight: 400 }}> · JSON</span>}</label>
                  {json ? (
                    <textarea
                      className="input mono"
                      style={{ marginTop: 6, minHeight: 80, resize: 'vertical', fontSize: 11.5 }}
                      value={values[k] ?? ''}
                      onChange={(e) => setField(k, e.target.value)}
                    />
                  ) : (
                    <input className="input" style={{ marginTop: 6 }} value={values[k] ?? ''} onChange={(e) => setField(k, e.target.value)} />
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {!ready && (
        <div className="empty" style={{ marginTop: 16, textAlign: 'left', color: 'var(--amber)' }}>
          Fill in {essentialKeys.map(labelFor).join(', ')} and the API key to turn this on.
        </div>
      )}

      <div className="row" style={{ gap: 10, marginTop: 18 }}>
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="btn" disabled={testing} onClick={testConnection}>{testing ? 'Checking…' : 'Check connection'}</button>
        {(saveMsg || testMsg) && (
          <span style={{ fontSize: 12.5, color: (saveMsg ?? testMsg)!.ok ? 'var(--green)' : 'var(--red)' }}>
            {(saveMsg ?? testMsg)!.text}
          </span>
        )}
      </div>
    </Card>
  );
}

/* ─────────────────────────── voice agents ─────────────────────────── */

interface RoleRow {
  role: string;
  agentId?: string | null;
  dedicated?: boolean;
  label?: string | null;
  purpose?: string | null;
}
interface AgentRow { id: string; name?: string | null; type?: string | null }

const ROLE_ORDER = ['leadCallback', 'campaign', 'companion', 'websiteCompanion', 'adminNavigator'] as const;

function VoiceAgents() {
  const { data: rolesRes, error: rolesError, isLoading: rolesLoading, mutate: mutateRoles } = useSWR('/api/admin/agents/roles', swrFetcher);
  const { data: agentsRes, isLoading: agentsLoading, mutate: mutateAgents } = useSWR('/api/admin/agents', swrFetcher);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const admin = getAdmin();
  const isSuper = admin?.role === 'super_admin';

  const rolesPayload = rolesRes?.data as { roles?: RoleRow[] } | RoleRow[] | undefined;
  const roles: RoleRow[] = Array.isArray(rolesPayload) ? rolesPayload : (rolesPayload?.roles ?? []);
  const ordered = useMemo(() => {
    const known = ROLE_ORDER.map((r) => roles.find((x) => x.role === r)).filter(Boolean) as RoleRow[];
    const extra = roles.filter((x) => !(ROLE_ORDER as readonly string[]).includes(x.role));
    return [...known, ...extra];
  }, [roles]);

  const agentsPayload = agentsRes?.data as { agents?: AgentRow[] } | AgentRow[] | undefined;
  const agents: AgentRow[] = Array.isArray(agentsPayload) ? agentsPayload : (agentsPayload?.agents ?? []);

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function pick(role: string, agentId: string, currentValue: string) {
    setMsg(null);
    setDraft((d) => {
      const next = { ...d };
      if (agentId === currentValue) delete next[role];
      else next[role] = agentId;
      return next;
    });
  }

  async function saveAssignments() {
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch('/api/admin/agents/roles', { method: 'PUT', body: JSON.stringify({ agents: draft }) });
      setDraft({});
      setMsg({ ok: true, text: 'Saved' });
      await mutateRoles();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const dirty = Object.keys(draft).length > 0;

  if (rolesError) {
    return (
      <Card title="☎  Voice agents">
        <div className="empty">Could not load — {(rolesError as Error).message}</div>
      </Card>
    );
  }

  return (
    <Card
      title="☎  Voice agents"
      sub="Which agent handles each job, and what it says"
      right={isSuper ? (
        <div className="row" style={{ gap: 10 }}>
          {msg && <span style={{ fontSize: 12.5, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.text}</span>}
          {dirty && <button className="btn" disabled={saving} onClick={() => { setDraft({}); setMsg(null); }}>Discard</button>}
          <button className="btn btn-primary" disabled={saving || !dirty} onClick={saveAssignments}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      ) : undefined}
    >
      {rolesLoading ? <TableSkeleton rows={5} cols={2} /> : ordered.length === 0 ? (
        <Empty label="No voice jobs found" />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {ordered.map((r) => {
            const currentValue = r.dedicated ? (r.agentId ?? '') : '';
            const selected = draft[r.role] !== undefined ? draft[r.role] : currentValue;
            return (
              <React.Fragment key={r.role}>
                <div className="row between" style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 13 }}>{r.label || r.role}</b>
                    {r.purpose && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{r.purpose}</div>}
                  </div>
                  <div className="row" style={{ gap: 8, flexShrink: 0 }}>
                    {isSuper ? (
                      <select
                        className="input"
                        style={{ fontSize: 12.5, minWidth: 200 }}
                        value={selected}
                        disabled={saving}
                        onChange={(e) => pick(r.role, e.target.value, currentValue)}
                      >
                        <option value="">— default agent —</option>
                        {agents.map((a) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                      </select>
                    ) : (
                      <StatusBadge status={r.dedicated ? 'completed' : 'pending'} label={r.dedicated ? 'Dedicated' : 'Default'} />
                    )}
                    {isSuper && r.agentId && (
                      <button className="btn" style={{ fontSize: 11.5, padding: '5px 10px' }} onClick={() => setExpandedId(expandedId === r.agentId ? null : r.agentId!)}>
                        {expandedId === r.agentId ? 'Hide script' : 'Edit script'}
                      </button>
                    )}
                  </div>
                </div>
                {expandedId === r.agentId && r.agentId && (
                  <PromptEditor agentId={r.agentId} onClose={() => setExpandedId(null)} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {isSuper && (
        <div style={{ marginTop: 16 }}>
          {adding ? (
            <AddAgentForm onDone={() => { setAdding(false); mutateAgents(); }} onCancel={() => setAdding(false)} />
          ) : (
            <button className="btn" onClick={() => setAdding(true)}>+ Add a new voice agent</button>
          )}
        </div>
      )}
      {agentsLoading && <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>loading agents…</div>}
    </Card>
  );
}

function AddAgentForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'inbound' | 'outbound' | 'chat' | 'hybrid'>('hybrid');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) { setMsg('Give it a name first'); return; }
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch('/api/admin/agents', { method: 'POST', body: JSON.stringify({ name: name.trim(), type }) });
      onDone();
    } catch (e) {
      setMsg((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', maxWidth: 460 }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <input className="input" placeholder="Agent name" value={name} onChange={(e) => { setName(e.target.value); setMsg(null); }} />
        <select className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="hybrid">hybrid (calls + chat)</option>
          <option value="outbound">outbound calls only</option>
          <option value="inbound">inbound calls only</option>
          <option value="chat">chat only</option>
        </select>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn-primary" disabled={saving} onClick={create}>{saving ? 'Creating…' : 'Create'}</button>
          <button className="btn" onClick={onCancel}>Cancel</button>
          {msg && <span style={{ fontSize: 12.5, color: 'var(--red)' }}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}

function PromptEditor({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const { data, error, isLoading } = useSWR(`/api/admin/agents/${agentId}`, swrFetcher);
  const agent = data?.data as { type?: string; prompt?: string } | undefined;
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const value = draft ?? agent?.prompt ?? '';

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch(`/api/admin/agents/${agentId}`, { method: 'PUT', body: JSON.stringify({ type: agent?.type || 'hybrid', prompt: value }) });
      setMsg({ ok: true, text: 'Saved' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 12, background: 'var(--grey-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
      {isLoading ? (
        <div className="muted" style={{ fontSize: 12.5 }}>Loading…</div>
      ) : error ? (
        <div style={{ color: 'var(--red)', fontSize: 12.5 }}>Could not load — {(error as Error).message}</div>
      ) : (
        <>
          <textarea
            className="input mono"
            style={{ minHeight: 200, resize: 'vertical', fontSize: 12, width: '100%' }}
            value={value}
            onChange={(e) => { setDraft(e.target.value); setMsg(null); }}
            placeholder="What this agent says and does…"
          />
          <div className="row" style={{ gap: 10, marginTop: 10 }}>
            <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save script'}</button>
            <button className="btn" onClick={onClose}>Close</button>
            {msg && <span style={{ fontSize: 12.5, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.text}</span>}
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────── API keys ─────────────────────────── */
//
// Static keys a third party (an Ello agent's tool config, today) presents to
// call INTO our API — the reverse direction from the provider cards above,
// which hold credentials WE use to call THEM. See server/src/lib/apiKeys.ts.

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
  revokedAt: string | null;
}

function ApiKeyCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn"
      style={{ padding: '4px 10px', fontSize: 11.5 }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard blocked — the value is on screen to copy by hand */ }
      }}
    >{copied ? 'Copied' : 'Copy'}</button>
  );
}

function fmtDate(v: string | null) {
  if (!v) return '—';
  return new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function ApiKeysPanel() {
  const { data, error, isLoading, mutate } = useSWR('/api/admin/api-keys', swrFetcher);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // The ONE moment the plaintext exists client-side — never persisted, never
  // re-fetchable. Cleared the instant the admin navigates away or creates
  // another key.
  const [justCreated, setJustCreated] = useState<{ name: string; key: string } | null>(null);

  const admin = getAdmin();
  const isSuper = admin?.role === 'super_admin';

  const payload = data?.data as { keys?: ApiKeyRow[] } | undefined;
  const keys: ApiKeyRow[] = payload?.keys ?? [];

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setMsg(null);
    try {
      const res = await apiFetch<ApiKeyRow & { key: string }>('/api/admin/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      });
      setJustCreated({ name: trimmed, key: res.data.key });
      setName('');
      await mutate();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || 'Could not create key' });
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    setRevokingId(id);
    setMsg(null);
    try {
      await apiFetch(`/api/admin/api-keys/${id}/revoke`, { method: 'POST' });
      await mutate();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || 'Could not revoke key' });
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <Card
      title="🔑  API keys"
      sub="Give one of these to a third party (e.g. an Ello agent's tool config) so it can call our /api/conversations endpoints — history lookup and call-summary saves. Each key is shown in full exactly once, at creation."
    >
      {justCreated && (
        <div className="card card-pad" style={{ borderColor: 'var(--red)', background: 'var(--red-bg)', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>
            Shown once — copy “{justCreated.name}” now, it cannot be retrieved later
          </div>
          <div className="row" style={{ gap: 10, marginTop: 10, alignItems: 'center' }}>
            <code
              className="mono"
              style={{ padding: '8px 12px', background: 'var(--grey-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, wordBreak: 'break-all' }}
            >
              {justCreated.key}
            </code>
            <ApiKeyCopyButton text={justCreated.key} />
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => setJustCreated(null)}>
              Done — I've copied it
            </button>
          </div>
        </div>
      )}

      {isSuper && (
        <div className="row" style={{ gap: 10, marginBottom: 16 }}>
          <input
            className="input"
            style={{ maxWidth: 320 }}
            placeholder="Name this key, e.g. “Ello lead-callback agent”"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create(); }}
          />
          <button className="btn btn-primary" disabled={creating || !name.trim()} onClick={create}>
            {creating ? 'Creating…' : 'Create key'}
          </button>
        </div>
      )}
      {!isSuper && (
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
          Only a super admin can create or revoke API keys.
        </p>
      )}
      {msg && <div style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 12 }}>{msg.text}</div>}

      {isLoading ? (
        <TableSkeleton rows={3} cols={5} />
      ) : error ? (
        <div className="empty">Could not load — {(error as Error).message}</div>
      ) : keys.length === 0 ? (
        <Empty label="No API keys yet" />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Key</th>
              <th>Created</th>
              <th>Last used</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td><code className="mono" style={{ fontSize: 12 }}>{k.keyPrefix}…</code></td>
                <td>{fmtDate(k.createdAt)}</td>
                <td>{fmtDate(k.lastUsedAt)}</td>
                <td><StatusBadge status={k.revoked ? 'revoked' : 'active'} /></td>
                <td>
                  {isSuper && !k.revoked && (
                    <button
                      className="btn"
                      style={{ padding: '4px 10px', fontSize: 11.5 }}
                      disabled={revokingId === k.id}
                      onClick={() => revoke(k.id)}
                    >
                      {revokingId === k.id ? 'Revoking…' : 'Revoke'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
