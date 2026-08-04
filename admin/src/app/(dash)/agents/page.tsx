'use client';
// Which Ello agent answers for each role. The point of this page is that a role can
// silently fall back to the workspace default agent — the calls still go out, but with
// a generic prompt instead of the role's own. That fallback is correct behaviour and
// must therefore be *visible*, not inferred from an absence.
import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher, apiFetch, getAdmin } from '@/lib/api';
import { Card, StatCard, StatusBadge, TableSkeleton, Empty } from '@/components/ui';

const ROLE_ORDER = ['leadCallback', 'campaign', 'companion', 'adminNavigator'] as const;
type RoleKey = (typeof ROLE_ORDER)[number];

interface RoleRow {
  role: string;
  agentId?: string | null;
  dedicated?: boolean;
  source?: string | null;
  label?: string | null;
  direction?: string | null;
  purpose?: string | null;
}
interface RolesPayload { roles?: RoleRow[]; dedicated?: number; shared?: number; unconfigured?: number }

interface AgentRow {
  id: string; name?: string | null; type?: string | null;
  status?: boolean | string | null; voiceEngine?: string | null; phoneNumber?: string | null;
}
interface AgentsPayload { agents?: AgentRow[]; error?: string | null }

// An override typed into the dashboard vs. an env var vs. the workspace default are
// three different explanations for "why did this agent take the call?".
function sourceBadge(source: string | null | undefined, dedicated: boolean) {
  if (!source) return <span className="badge tone-grey">unknown</span>;
  if (source === 'dashboard') return <span className="badge tone-teal">set here</span>;
  if (source === 'unconfigured') return <span className="badge tone-red">unconfigured</span>;
  if (source === 'workspace default') return <span className="badge tone-amber">workspace default</span>;
  // ELLO_AGENT_* style env var
  return <span className="badge tone-blue" title={source}>{dedicated ? 'env var' : source}</span>;
}

export default function AgentsPage() {
  const { data: rolesRes, error: rolesError, isLoading: rolesLoading, mutate } = useSWR('/api/admin/agents/roles', swrFetcher);
  const { data: agentsRes, error: agentsError, isLoading: agentsLoading } = useSWR('/api/admin/agents', swrFetcher);

  const admin = getAdmin();
  const isSuper = admin?.role === 'super_admin';

  // Defensive reads: `roles` is nested under `data`, but tolerate a bare array too so a
  // shape change degrades to an empty state instead of `roles.map is not a function`.
  const rolesPayload = rolesRes?.data as RolesPayload | RoleRow[] | undefined;
  const roles: RoleRow[] = Array.isArray(rolesPayload) ? rolesPayload : (Array.isArray(rolesPayload?.roles) ? rolesPayload!.roles! : []);
  const counts = Array.isArray(rolesPayload) ? {} : (rolesPayload ?? {});

  const agentsPayload = agentsRes?.data as AgentsPayload | AgentRow[] | undefined;
  const agents: AgentRow[] = Array.isArray(agentsPayload) ? agentsPayload : (Array.isArray(agentsPayload?.agents) ? agentsPayload!.agents! : []);
  const agentsProviderError = Array.isArray(agentsPayload) ? null : (agentsPayload?.error ?? null);

  // Order the API rows by the canonical role order, then append anything unexpected.
  const ordered = useMemo(() => {
    const known = ROLE_ORDER.map((r) => roles.find((x) => x.role === r)).filter(Boolean) as RoleRow[];
    const extra = roles.filter((x) => !(ROLE_ORDER as readonly string[]).includes(x.role));
    return [...known, ...extra];
  }, [roles]);

  const sharedCount = typeof counts.shared === 'number' ? counts.shared : ordered.filter((r) => r.dedicated === false).length;
  const dedicatedCount = typeof counts.dedicated === 'number' ? counts.dedicated : ordered.filter((r) => r.dedicated === true).length;
  const unconfiguredCount = typeof counts.unconfigured === 'number' ? counts.unconfigured : ordered.filter((r) => r.source === 'unconfigured').length;

  // Draft overrides keyed by role. '' means "clear the override".
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty = Object.keys(draft).length > 0;

  function pick(role: string, value: string) {
    const current = ordered.find((r) => r.role === role);
    // A dedicated assignment is the only thing the select can be "already" set to;
    // a shared/default row shows the default option, so any pick is a change.
    const currentValue = current?.dedicated ? (current.agentId ?? '') : '';
    setMsg(null);
    setDraft((d) => {
      const next = { ...d };
      if (value === currentValue) delete next[role];
      else next[role] = value;
      return next;
    });
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      // The PUT echoes back `{ agents: {...} }` rather than the roles payload, so we
      // re-read /agents/roles instead of trusting the response body.
      const res = await apiFetch<{ agents?: Record<string, string> }>('/api/admin/agents/roles', {
        method: 'PUT',
        body: JSON.stringify({ agents: draft }),
      });
      setDraft({});
      setMsg({ ok: true, text: res.message || 'Agent roles updated' });
      await mutate();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  if (rolesError) {
    return (
      <div className="page">
        <h1 className="page-title">Voice agents</h1>
        <div style={{ marginTop: 16 }}>
          <Card>
            <div className="empty">Could not load agent roles — {(rolesError as Error).message}
              <div><button className="btn" style={{ marginTop: 12 }} onClick={() => mutate()}>Retry</button></div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Voice agents</h1>
      <p className="page-sub">
        Each role is answered by one Ello agent. A role without its own agent falls back to the workspace
        default — the call still happens, but with a generic prompt rather than the role&apos;s own.
      </p>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', marginTop: 16 }}>
        <StatCard label="Roles" value={rolesLoading ? '—' : ordered.length} tone="blue" icon="◉" foot="leadCallback · campaign · companion · adminNavigator" />
        <StatCard label="Dedicated agent" value={rolesLoading ? '—' : dedicatedCount} tone="green" icon="✓" foot="has its own prompt" />
        <StatCard label="Sharing the default" value={rolesLoading ? '—' : sharedCount} tone={sharedCount > 0 ? 'amber' : 'grey'} icon="⚠" foot="generic prompt" />
        <StatCard label="Unconfigured" value={rolesLoading ? '—' : unconfiguredCount} tone={unconfiguredCount > 0 ? 'red' : 'grey'} icon="•" foot="no agent resolves" />
      </div>

      {!rolesLoading && sharedCount > 0 && (
        <div style={{ marginTop: 16 }}>
          <Card>
            <div className="row wrap" style={{ gap: 12 }}>
              <span className="badge tone-amber">Action needed</span>
              <b style={{ fontSize: 13.5 }}>
                {sharedCount} of {ordered.length || 4} roles {sharedCount === 1 ? 'is' : 'are'} sharing the workspace default agent.
              </b>
              <span className="muted" style={{ fontSize: 12.5 }}>
                Those calls used a generic prompt. Assign a dedicated agent below to give each role its own script.
              </span>
            </div>
          </Card>
        </div>
      )}

      {!isSuper && (
        <div style={{ marginTop: 16 }}>
          <Card>
            <div className="empty" style={{ textAlign: 'left' }}>
              Read-only — assigning agents to roles is restricted to <b>super_admin</b>. You can see which agent
              answers each role, but the server will reject a change from this account.
            </div>
          </Card>
        </div>
      )}

      {agentsProviderError && (
        <div style={{ marginTop: 16 }}>
          <Card>
            <div className="empty" style={{ textAlign: 'left', color: 'var(--amber)' }}>
              Could not list agents from the Ello workspace — <span className="mono">{agentsProviderError}</span>.
              The roles below still show what the server resolves; the picker just has nothing to choose from.
            </div>
          </Card>
        </div>
      )}
      {agentsError && (
        <div style={{ marginTop: 16 }}>
          <Card>
            <div className="empty" style={{ textAlign: 'left', color: 'var(--amber)' }}>
              Could not reach the agents endpoint — {(agentsError as Error).message}. Assignment is unavailable.
            </div>
          </Card>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Card
          title="Role assignments"
          sub="Which agent takes the call, and why that one"
          right={isSuper ? (
            <div className="row" style={{ gap: 10 }}>
              {msg && <span style={{ fontSize: 12.5, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.text}</span>}
              {dirty && <button className="btn" disabled={saving} onClick={() => { setDraft({}); setMsg(null); }}>Discard</button>}
              <button className="btn btn-primary" disabled={saving || !dirty} onClick={save}>{saving ? 'Saving…' : 'Save assignments'}</button>
            </div>
          ) : undefined}
        >
          {rolesLoading ? <TableSkeleton rows={4} cols={5} /> : ordered.length === 0 ? (
            <Empty label="The server returned no agent roles" />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Direction</th>
                    <th>Resolved agent</th>
                    <th>Source</th>
                    <th style={{ minWidth: 240 }}>{isSuper ? 'Assign' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((r) => {
                    const dedicated = r.dedicated === true;
                    const selected = draft[r.role] !== undefined
                      ? draft[r.role]
                      : (dedicated ? (r.agentId ?? '') : '');
                    const named = agents.find((a) => a.id === r.agentId);
                    return (
                      <tr key={r.role} style={{ cursor: 'default' }}>
                        <td>
                          <b style={{ fontSize: 13 }}>{r.label || r.role}</b>
                          <div className="mono muted" style={{ fontSize: 11 }}>{r.role}</div>
                          {r.purpose && <div className="muted" style={{ fontSize: 11.5, marginTop: 4, maxWidth: 340, lineHeight: 1.45 }}>{r.purpose}</div>}
                        </td>
                        <td className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{r.direction || '—'}</td>
                        <td>
                          {r.agentId ? (
                            <>
                              <div className="mono" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>{r.agentId}</div>
                              {named?.name && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{named.name}</div>}
                            </>
                          ) : <span className="muted">none</span>}
                        </td>
                        <td>{sourceBadge(r.source, dedicated)}</td>
                        <td>
                          {isSuper ? (
                            <>
                              <select
                                className="input"
                                style={{ fontSize: 12.5 }}
                                value={selected}
                                disabled={saving}
                                onChange={(e) => pick(r.role, e.target.value)}
                              >
                                <option value="">— use workspace default —</option>
                                {agents.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {(a.name || a.id) + (a.phoneNumber ? ` · ${a.phoneNumber}` : '')}
                                  </option>
                                ))}
                                {/* keep a currently-assigned agent selectable even if the workspace listing omits it */}
                                {dedicated && r.agentId && !agents.some((a) => a.id === r.agentId) && (
                                  <option value={r.agentId}>{r.agentId} (not in workspace listing)</option>
                                )}
                              </select>
                              {agentsLoading && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>loading agents…</div>}
                              {!agentsLoading && agents.length === 0 && (
                                <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>no agents available to pick</div>
                              )}
                              {draft[r.role] !== undefined && (
                                <div style={{ fontSize: 11, marginTop: 4, color: 'var(--blue)' }}>
                                  {draft[r.role] ? 'will be assigned on save' : 'will be cleared back to the default on save'}
                                </div>
                              )}
                            </>
                          ) : (
                            <StatusBadge
                              status={dedicated ? 'completed' : r.source === 'unconfigured' ? 'failed' : 'pending'}
                              label={dedicated ? 'Dedicated' : r.source === 'unconfigured' ? 'Unconfigured' : 'Shared default'}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title={`Agents on the Ello workspace (${agents.length})`} sub="The real agents this dashboard can assign">
          {agentsLoading ? <TableSkeleton rows={3} cols={5} /> : agents.length === 0 ? (
            <Empty label={agentsProviderError ? 'Ello did not return an agent list' : 'No agents found on the workspace'} />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Name</th><th>Agent id</th><th>Type</th><th>Voice engine</th><th>Phone</th><th>Status</th></tr></thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.id} style={{ cursor: 'default' }}>
                      <td><b style={{ fontSize: 13 }}>{a.name || '—'}</b></td>
                      <td className="mono" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>{a.id}</td>
                      <td className="muted" style={{ fontSize: 12.5 }}>{a.type || '—'}</td>
                      <td className="muted" style={{ fontSize: 12.5 }}>{a.voiceEngine || '—'}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{a.phoneNumber || '—'}</td>
                      <td>
                        <StatusBadge
                          status={a.status === true || a.status === 'active' ? 'active' : 'not_started'}
                          label={a.status === true || a.status === 'active' ? 'Active' : 'Inactive'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
