'use client';
import React, { useEffect, useState } from 'react';
import useSWR from 'swr';
import { swrFetcher, apiFetch, ApiError, getAdmin } from '@/lib/api';
import { Card, Callout, ConfirmDialog, Empty, TableSkeleton } from '@/components/ui';
import { timeAgo } from '@/lib/format';

/* Phone numbers that may sign in to the app with ONE shared test code (set on the server as TEST_LOGIN_OTP).
 * The code works for these numbers only; it is never shown here. Only super admins can change the list. */

interface TestNumber {
  id: string; phone: string; label: string | null; active: boolean;
  createdBy: string | null; createdAt: string; lastLoginAt: string | null;
}

export default function TestNumbersPage() {
  const { data, error, isLoading, mutate } = useSWR('/api/admin/test-numbers', swrFetcher);
  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'red' | 'blue'; text: string } | null>(null);
  const [removing, setRemoving] = useState<TestNumber | null>(null);
  // Read after mount (not during render) so the server and first client render agree. The API still enforces it.
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => { setCanEdit(getAdmin()?.role === 'super_admin'); }, []);

  const payload = data?.data as { otpConfigured?: boolean; numbers?: TestNumber[] } | undefined;
  const numbers = payload?.numbers ?? [];
  const forbidden = error instanceof ApiError && error.status === 403;

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true); setMsg(null);
    try {
      await fn();
      await mutate();
      if (ok) setMsg({ tone: 'blue', text: ok });
    } catch (e) {
      setMsg({ tone: 'red', text: e instanceof Error ? e.message : 'Something went wrong' });
    } finally { setBusy(false); }
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await apiFetch('/api/admin/test-numbers', { method: 'POST', body: JSON.stringify({ phone, label: label || undefined }) });
      setPhone(''); setLabel('');
    }, 'Number added. It can sign in with the test code right away.');
  };

  if (forbidden) {
    return (
      <div className="page">
        <h1 className="page-title">Test numbers</h1>
        <Card><Empty label="Only super admins can open this page." /></Card>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-title">Test numbers</h1>
      <p className="page-sub">Numbers that can sign in to the app with the shared test code. Use them to try the production build; the code works for these numbers only.</p>

      {payload && !payload.otpConfigured ? (
        <Callout tone="amber" icon="⚠">The test code is not set on this server (<span className="mono">TEST_LOGIN_OTP</span>), so these numbers cannot sign in yet. Numbers can still be listed.</Callout>
      ) : null}
      <Callout tone="grey" icon="ℹ">These numbers run the real flow, not a sandbox: PAN checks and lender calls are real. The test code is held by the server and is not shown here.</Callout>
      {msg ? <Callout tone={msg.tone} icon={msg.tone === 'red' ? '⚠' : '✓'}>{msg.text}</Callout> : null}

      {!canEdit ? <Callout tone="grey" icon="ℹ">Only a super admin can add, switch off or remove numbers. You can see the list.</Callout> : null}

      {canEdit ? <Card title="Add a number">
        <form className="row wrap" style={{ gap: 10 }} onSubmit={add}>
          <input className="input" inputMode="numeric" placeholder="10-digit mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: 220 }} />
          <input className="input" placeholder="Who is it for? (optional)" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} style={{ width: 260 }} />
          <button className="btn btn-primary" type="submit" disabled={busy || phone.trim().length < 10}>Add number</button>
        </form>
      </Card> : null}

      <Card title={`Listed numbers${numbers.length ? ` (${numbers.length})` : ''}`}>
        {isLoading ? <TableSkeleton rows={4} cols={5} /> : error ? (
          <div className="empty">Couldn’t load the list. <button className="btn" onClick={() => mutate()}>Retry</button></div>
        ) : numbers.length === 0 ? <Empty label="No test numbers yet. Add one above." /> : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Number</th><th>For</th><th>Status</th><th>Last signed in</th><th>Added</th>{canEdit ? <th /> : null}</tr></thead>
            <tbody>
              {numbers.map((n) => (
                <tr key={n.id}>
                  <td className="mono">{n.phone}</td>
                  <td>{n.label || <span className="muted">—</span>}</td>
                  <td>
                    <button
                      className="btn" style={{ padding: '4px 10px', fontSize: 11.5 }} disabled={busy || !canEdit}
                      onClick={() => run(() => apiFetch(`/api/admin/test-numbers/${n.id}`, { method: 'PATCH', body: JSON.stringify({ active: !n.active }) }))}
                      title={!canEdit ? (n.active ? 'On' : 'Off') : n.active ? 'Click to switch off' : 'Click to switch on'}
                    >{n.active ? 'On' : 'Off'}</button>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }} title={n.lastLoginAt ?? ''}>{n.lastLoginAt ? timeAgo(n.lastLoginAt) : 'Never'}</td>
                  <td className="muted" style={{ fontSize: 12 }} title={n.createdAt}>{timeAgo(n.createdAt)}{n.createdBy ? ` · ${n.createdBy}` : ''}</td>
                  {canEdit ? <td><button className="btn" style={{ padding: '4px 10px', fontSize: 11.5 }} disabled={busy} onClick={() => setRemoving(n)}>Remove</button></td> : null}
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      {removing ? (
        <ConfirmDialog
          title="Remove this number?" tone="red" confirmLabel="Remove" busy={busy}
          message={<>{removing.phone} will no longer be able to sign in with the test code. Its account and data are not deleted.</>}
          onCancel={() => setRemoving(null)}
          onConfirm={() => { const n = removing; setRemoving(null); void run(() => apiFetch(`/api/admin/test-numbers/${n.id}`, { method: 'DELETE' }), 'Number removed.'); }}
        />
      ) : null}
    </div>
  );
}
