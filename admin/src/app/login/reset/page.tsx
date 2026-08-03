'use client';
import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { PasswordHints } from '@/components/PasswordHints';
import { passwordOk } from '@/lib/password';

const WRAP: React.CSSProperties = {
  minHeight: '100vh', display: 'grid', placeItems: 'center',
  background: 'linear-gradient(135deg,#0a3f41,#079fa0)',
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={WRAP} />}>
      <ResetInner />
    </Suspense>
  );
}

function ResetInner() {
  const router = useRouter();
  const token = useSearchParams().get('token') || '';

  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const mismatch = confirm.length > 0 && pw !== confirm;
  const canSave = !!token && passwordOk(pw) && !mismatch && confirm.length > 0 && !saving;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      await apiFetch('/api/admin/auth/reset-password', {
        method: 'POST', body: JSON.stringify({ token, newPassword: pw }),
      });
      setDone(true);
      setPw(''); setConfirm('');
    } catch (e) {
      setErr((e as Error).message || 'Could not reset the password');
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return (
      <div style={WRAP}>
        <div className="card" style={{ width: 380, padding: 32 }}>
          <div style={{ fontWeight: 750, fontSize: 17 }}>Reset link is incomplete</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 16px' }}>
            This page needs the <span className="mono">token</span> from the reset email. Open the link from the
            email again, or request a new one.
          </p>
          <Link className="btn btn-primary" style={{ display: 'block', textAlign: 'center' }} href="/login">Back to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={WRAP}>
      <form onSubmit={submit} className="card" style={{ width: 400, padding: 32 }}>
        <div style={{ fontWeight: 750, fontSize: 17 }}>Choose a new password</div>

        {done ? (
          <>
            <div className="badge tone-green" style={{ marginTop: 16, whiteSpace: 'normal', textAlign: 'left' }}>
              Password updated. Sign in with your new password.
            </div>
            <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={() => router.replace('/login')}>
              Go to sign in
            </button>
          </>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 16px' }}>
              All existing sessions for this account will be signed out.
            </p>

            <label style={{ fontSize: 12.5, fontWeight: 600 }}>New password</label>
            <input className="input" style={{ marginTop: 6 }} type="password" autoComplete="new-password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(''); }} />
            <PasswordHints value={pw} />

            <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginTop: 14 }}>Confirm new password</label>
            <input
              className="input"
              style={{ marginTop: 6, borderColor: mismatch ? 'var(--red)' : undefined }}
              type="password" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
            />
            {mismatch && <div style={{ color: 'var(--red)', fontSize: 11.5, marginTop: 4 }}>The two passwords do not match.</div>}

            {err && <div className="badge tone-red" style={{ margin: '14px 0 0', whiteSpace: 'normal', textAlign: 'left' }}>{err}</div>}

            <button className="btn btn-primary" style={{ width: '100%', marginTop: 18 }} disabled={!canSave}>
              {saving ? 'Updating…' : 'Update password'}
            </button>
            <Link className="btn" style={{ display: 'block', textAlign: 'center', marginTop: 10 }} href="/login">Cancel</Link>
          </>
        )}
      </form>
    </div>
  );
}
