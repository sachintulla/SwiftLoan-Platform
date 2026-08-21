'use client';
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  apiFetch, clearSession, getAdmin, getTotpEnabled, setTotpEnabled, setMustChangePassword, mustChangePassword,
} from '@/lib/api';
import { Card, StatusBadge } from '@/components/ui';
import { useAdminSession } from '@/lib/useAdminSession';
import { PasswordHints } from '@/components/PasswordHints';
import { passwordOk } from '@/lib/password';

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="page"><h1 className="page-title">Account &amp; security</h1></div>}>
      <AccountInner />
    </Suspense>
  );
}

function AccountInner() {
  const params = useSearchParams();
  // Resolved after mount, never during render — see useAdminSession.ts. Reading these
  // inline previously made the server emit "Change your password…" while the client
  // emitted "Signed in as <email> · …", a text-content hydration mismatch.
  const { admin, locked } = useAdminSession();

  // Either the login response or a 428 from any endpoint can force a rotation.
  const forced = params.get('mustChange') === '1' || locked;

  return (
    <div className="page">
      <h1 className="page-title">Account &amp; security</h1>
      <p className="page-sub">
        {admin?.email ? <>Signed in as <b>{admin.email}</b>{admin.role ? ` · ${admin.role}` : ''}. </> : null}
        Change your password and manage two-factor authentication.
      </p>

      {forced && (
        <div className="card card-pad" style={{ marginTop: 16, borderColor: 'var(--amber)' }}>
          <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--amber)' }}>Password change required</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
            You cannot use the rest of the dashboard until you set a new password below.
          </p>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <ChangePasswordCard />
      </div>

      {!forced && (
        <div style={{ marginTop: 16 }}>
          <TwoFactorCard />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Change password                                                     */
/* ------------------------------------------------------------------ */

function ChangePasswordCard() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const mismatch = confirm.length > 0 && pw !== confirm;
  const canSave = !!current && passwordOk(pw) && !!confirm && !mismatch && !saving;

  async function save() {
    setSaving(true); setErr('');
    try {
      await apiFetch('/api/admin/auth/change-password', {
        method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: pw }),
      });
      // The server revokes every session, so this token is already dead.
      setMustChangePassword(false);
      setDone(true);
      setCurrent(''); setPw(''); setConfirm('');
      setTimeout(() => { clearSession(); router.replace('/login'); }, 1800);
    } catch (e) {
      setErr((e as Error).message || 'Could not change the password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Password" sub="Changing your password signs out every session, including this one.">
      {done ? (
        <div className="badge tone-green" style={{ whiteSpace: 'normal' }}>
          Password changed. Signing you out — please sign in again…
        </div>
      ) : (
        <div style={{ maxWidth: 420, display: 'grid', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600 }}>Current password</label>
            <input className="input" style={{ marginTop: 6 }} type="password" autoComplete="current-password" value={current} onChange={(e) => { setCurrent(e.target.value); setErr(''); }} />
          </div>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600 }}>New password</label>
            <input className="input" style={{ marginTop: 6 }} type="password" autoComplete="new-password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(''); }} />
            <PasswordHints value={pw} />
          </div>
          <div>
            <label style={{ fontSize: 12.5, fontWeight: 600 }}>Confirm new password</label>
            <input className="input" style={{ marginTop: 6, borderColor: mismatch ? 'var(--red)' : undefined }} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {mismatch && <div style={{ color: 'var(--red)', fontSize: 11.5, marginTop: 4 }}>The two passwords do not match.</div>}
          </div>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn btn-primary" disabled={!canSave} onClick={save}>{saving ? 'Updating…' : 'Change password'}</button>
            {err && <span style={{ fontSize: 12.5, color: 'var(--red)' }}>{err}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Two-factor authentication                                           */
/* ------------------------------------------------------------------ */

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
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
    >{copied ? 'Copied' : label}</button>
  );
}

function TwoFactorCard() {
  // Same SSR caveat as above: a lazy `useState(() => getTotpEnabled())` initializer
  // would run on the server (where localStorage does not exist) and disagree with the
  // client. `totp` from the hook is resolved after mount; local state still tracks the
  // enable/disable actions on this page.
  const { totp } = useAdminSession();
  const [enabled, setEnabled] = useState<boolean>(false);
  useEffect(() => { setEnabled(totp); }, [totp]);

  // setup → enable
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [ackRecovery, setAckRecovery] = useState(false);

  // disable
  const [disabling, setDisabling] = useState(false);
  const [disablePw, setDisablePw] = useState('');

  async function startSetup() {
    setBusy(true); setErr(''); setRecovery(null);
    try {
      const res = await apiFetch<{ secret: string; otpauthUri: string }>('/api/admin/auth/2fa/setup', { method: 'POST' });
      const d = res.data;
      if (!d?.secret) throw new Error('The server did not return a setup secret');
      setSetup({ secret: d.secret, otpauthUri: d.otpauthUri || '' });
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }

  async function enable() {
    setBusy(true); setErr('');
    try {
      const res = await apiFetch<{ enabled: boolean; recoveryCodes: string[] }>('/api/admin/auth/2fa/enable', {
        method: 'POST', body: JSON.stringify({ totp: code.trim() }),
      });
      const codes = Array.isArray(res.data?.recoveryCodes) ? res.data.recoveryCodes : [];
      setEnabled(true);
      setTotpEnabled(true);
      setSetup(null);
      setCode('');
      setRecovery(codes);
      setAckRecovery(false);
    } catch (e) {
      setErr((e as Error).message || 'That code was not accepted');
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setErr('');
    try {
      await apiFetch('/api/admin/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password: disablePw }) });
      setEnabled(false);
      setTotpEnabled(false);
      setDisabling(false);
      setDisablePw('');
      setRecovery(null);
    } catch (e) {
      setErr((e as Error).message || 'Could not turn off 2FA');
    } finally { setBusy(false); }
  }

  function downloadCodes(codes: string[]) {
    const blob = new Blob([`SwiftLoan Admin — recovery codes\n\n${codes.join('\n')}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'swiftloan-recovery-codes.txt';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // One-time reveal. Nothing here is ever re-fetched or persisted.
  if (recovery) {
    return (
      <Card title="Save your recovery codes" sub="This is the only time these codes will ever be shown.">
        <div className="card card-pad" style={{ borderColor: 'var(--red)', background: 'var(--red-bg)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>Shown once — they cannot be retrieved later</div>
          <p style={{ fontSize: 12.5, margin: '6px 0 0' }}>
            Each code signs you in once if you lose your authenticator. Store them somewhere safe before you close this.
            Leaving this page discards them permanently.
          </p>
        </div>

        <div className="mono" style={{ marginTop: 14, padding: 14, background: 'var(--grey-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8, fontSize: 13 }}>
          {recovery.map((c) => <span key={c}>{c}</span>)}
        </div>

        <div className="row" style={{ gap: 10, marginTop: 14 }}>
          <CopyButton text={recovery.join('\n')} label="Copy all" />
          <button className="btn" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => downloadCodes(recovery)}>Download .txt</button>
        </div>

        <label className="row" style={{ gap: 8, marginTop: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={ackRecovery} onChange={(e) => setAckRecovery(e.target.checked)} />
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>I have saved these codes somewhere safe</span>
        </label>

        <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={!ackRecovery} onClick={() => setRecovery(null)}>
          Done
        </button>
      </Card>
    );
  }

  return (
    <Card
      title="Two-factor authentication"
      sub="A time-based code from an authenticator app, required at every sign-in."
      right={<StatusBadge status={enabled ? 'active' : 'not_started'} label={enabled ? 'On' : 'Off'} />}
    >
      {enabled ? (
        <>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
            2FA is on for this account. You will be asked for a code — or one of your recovery codes — each time you sign in.
          </p>
          {disabling ? (
            <div style={{ maxWidth: 380, marginTop: 14 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600 }}>Confirm with your password</label>
              <input className="input" style={{ marginTop: 6 }} type="password" autoComplete="current-password" value={disablePw} onChange={(e) => { setDisablePw(e.target.value); setErr(''); }} />
              <div className="row" style={{ gap: 10, marginTop: 12 }}>
                <button className="btn" style={{ color: 'var(--red)', borderColor: 'var(--red)' }} disabled={busy || !disablePw} onClick={disable}>
                  {busy ? 'Turning off…' : 'Turn off 2FA'}
                </button>
                <button className="btn" onClick={() => { setDisabling(false); setDisablePw(''); setErr(''); }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="btn" style={{ marginTop: 14 }} onClick={() => { setDisabling(true); setErr(''); }}>Turn off 2FA</button>
          )}
        </>
      ) : setup ? (
        <>
          <p style={{ fontSize: 12.5, margin: 0 }}>
            Add this account to your authenticator app, then enter the 6-digit code it shows.
          </p>

          <div style={{ marginTop: 14, padding: 14, background: 'var(--grey-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', display: 'grid', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Setup key</div>
              <div className="row between" style={{ gap: 10, marginTop: 4 }}>
                <span className="mono" style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{setup.secret}</span>
                <CopyButton text={setup.secret} />
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Choose “enter a setup key manually” in your app and paste this.</div>
            </div>

            {setup.otpauthUri && (
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>otpauth link</div>
                <div className="row between" style={{ gap: 10, marginTop: 4 }}>
                  <a className="mono" href={setup.otpauthUri} style={{ fontSize: 11.5, color: 'var(--brand)', overflowWrap: 'anywhere' }}>{setup.otpauthUri}</a>
                  <CopyButton text={setup.otpauthUri} />
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                  Opening this on a phone hands it straight to the authenticator app. No QR code is rendered here — the setup key above does the same job.
                </div>
              </div>
            )}
          </div>

          <div style={{ maxWidth: 260, marginTop: 14 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600 }}>Code from the app</label>
            <input className="input mono" style={{ marginTop: 6, letterSpacing: '.25em' }} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code} onChange={(e) => { setCode(e.target.value); setErr(''); }} />
          </div>

          <div className="row" style={{ gap: 10, marginTop: 14 }}>
            <button className="btn btn-primary" disabled={busy || code.trim().length < 6} onClick={enable}>{busy ? 'Verifying…' : 'Turn on 2FA'}</button>
            <button className="btn" onClick={() => { setSetup(null); setCode(''); setErr(''); }}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
            2FA is off. Turning it on adds a one-time code to every sign-in and gives you a set of recovery codes.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={busy} onClick={startSetup}>
            {busy ? 'Preparing…' : 'Set up 2FA'}
          </button>
        </>
      )}

      {err && <div style={{ fontSize: 12.5, color: 'var(--red)', marginTop: 12 }}>{err}</div>}
    </Card>
  );
}
