'use client';
import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { login, apiFetch, ApiError } from '@/lib/api';

const WRAP: React.CSSProperties = {
  minHeight: '100vh', display: 'grid', placeItems: 'center',
  background: 'linear-gradient(135deg,#0a3f41,#079fa0)',
};

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary during prerender.
  return (
    <Suspense fallback={<div style={WRAP} />}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  // /login?reason=idle is set by the 440 handler in lib/api.
  const idle = params.get('reason') === 'idle';

  const [email, setEmail] = useState('admin@swiftloan.com');
  const [password, setPassword] = useState('admin123');
  const [step, setStep] = useState<'credentials' | 'totp'>('credentials');
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);

  async function attempt(extra: { totp?: string; recoveryCode?: string } = {}) {
    setErr(''); setLocked(false); setLoading(true);
    try {
      const res = await login({ email: email.trim(), password, ...extra });
      // 2FA challenge: HTTP 200, no tokens. Ask for the code instead of navigating.
      if (res.totpRequired && !res.accessToken) {
        setStep('totp');
        setCode('');
        return;
      }
      router.replace(res.mustChangePassword ? '/account?mustChange=1' : '/overview');
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      const msg = (e as Error).message || 'Login failed';
      if (status === 423) { setLocked(true); setErr(msg); setStep('credentials'); }
      else setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step === 'credentials') return void attempt();
    if (useRecovery) return void attempt({ recoveryCode: code.trim() });
    return void attempt({ totp: code.trim() });
  }

  if (forgot) {
    return (
      <div style={WRAP}>
        <ForgotPanel email={email} onBack={() => setForgot(false)} />
      </div>
    );
  }

  return (
    <div style={WRAP}>
      <form onSubmit={submit} className="card" style={{ width: 380, padding: 32 }}>
        <div className="row" style={{ gap: 10, marginBottom: 20 }}>
          <div className="brand-logo" style={{ width: 38, height: 38, fontSize: 18 }}>S</div>
          <div><div style={{ fontWeight: 750, fontSize: 18 }}>SwiftLoan Admin</div><div className="muted" style={{ fontSize: 12 }}>Operations dashboard</div></div>
        </div>

        {idle && step === 'credentials' && (
          <div className="badge tone-amber" style={{ marginBottom: 14 }}>
            You were signed out because the session was idle. Please sign in again.
          </div>
        )}

        {step === 'credentials' ? (
          <>
            <label style={{ fontSize: 12.5, fontWeight: 600 }}>Email</label>
            <input className="input" style={{ margin: '6px 0 14px' }} value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" />
            <label style={{ fontSize: 12.5, fontWeight: 600 }}>Password</label>
            <input className="input" style={{ margin: '6px 0 18px' }} value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" />
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Two-factor authentication</div>
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 14px' }}>
              {useRecovery
                ? 'Enter one of the recovery codes you saved when you turned on 2FA. Each code works once.'
                : `Enter the 6-digit code from your authenticator app for ${email}.`}
            </p>
            <label style={{ fontSize: 12.5, fontWeight: 600 }}>{useRecovery ? 'Recovery code' : 'Authenticator code'}</label>
            <input
              className="input mono"
              style={{ margin: '6px 0 10px', letterSpacing: useRecovery ? 'normal' : '0.25em' }}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode={useRecovery ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              placeholder={useRecovery ? 'xxxx-xxxx' : '123456'}
              autoFocus
            />
            <button
              type="button"
              className="btn"
              style={{ border: 'none', background: 'none', padding: 0, fontSize: 12, color: 'var(--brand)', marginBottom: 16 }}
              onClick={() => { setUseRecovery((v) => !v); setCode(''); setErr(''); }}
            >
              {useRecovery ? 'Use an authenticator code instead' : 'Use a recovery code instead'}
            </button>
          </>
        )}

        {err && (
          <div className={`badge ${locked ? 'tone-amber' : 'tone-red'}`} style={{ marginBottom: 12, whiteSpace: 'normal', textAlign: 'left' }}>
            {err}
          </div>
        )}

        <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading || (step === 'totp' && !code.trim())}>
          {loading ? 'Signing in…' : step === 'totp' ? 'Verify and sign in' : 'Sign in'}
        </button>

        <div className="row between" style={{ marginTop: 14 }}>
          {step === 'totp' ? (
            <button type="button" className="btn" style={{ border: 'none', background: 'none', padding: 0, fontSize: 12, color: 'var(--text-dim)' }}
              onClick={() => { setStep('credentials'); setErr(''); setCode(''); setUseRecovery(false); }}>
              ← Back
            </button>
          ) : <span />}
          <button type="button" className="btn" style={{ border: 'none', background: 'none', padding: 0, fontSize: 12, color: 'var(--brand)' }}
            onClick={() => { setForgot(true); setErr(''); }}>
            Forgot password?
          </button>
        </div>

        {step === 'credentials' && (
          <p className="muted" style={{ fontSize: 11.5, marginTop: 14, marginBottom: 0, textAlign: 'center' }}>Demo: admin@swiftloan.com · admin123</p>
        )}
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Forgot password                                                     */
/* ------------------------------------------------------------------ */

function ForgotPanel({ email: initial, onBack }: { email: string; onBack: () => void }) {
  const [email, setEmail] = useState(initial);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [err, setErr] = useState('');

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setErr('');
    try {
      const res = await apiFetch<{ sent?: boolean; devToken?: string }>('/api/admin/auth/forgot-password', {
        method: 'POST', body: JSON.stringify({ email: email.trim() }),
      });
      setSent(true);
      setDevToken(res.data?.devToken ?? null);
    } catch (e) {
      setErr((e as Error).message || 'Could not send the reset email');
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} className="card" style={{ width: 380, padding: 32 }}>
      <div style={{ fontWeight: 750, fontSize: 17 }}>Reset your password</div>
      <p className="muted" style={{ fontSize: 12, margin: '6px 0 16px' }}>
        We&apos;ll email a reset link if an account exists for this address.
      </p>

      {sent ? (
        <>
          <div className="badge tone-green" style={{ whiteSpace: 'normal', textAlign: 'left' }}>
            If that account exists, a reset link is on its way.
          </div>
          {/* dev convenience only — the server returns devToken outside production */}
          {devToken && (
            <div style={{ marginTop: 14, padding: 12, background: 'var(--grey-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>Development only</div>
              <a className="mono" style={{ fontSize: 11.5, color: 'var(--brand)', overflowWrap: 'anywhere' }} href={`/login/reset?token=${encodeURIComponent(devToken)}`}>
                /login/reset?token={devToken}
              </a>
            </div>
          )}
          <button type="button" className="btn" style={{ width: '100%', marginTop: 16 }} onClick={onBack}>Back to sign in</button>
        </>
      ) : (
        <>
          <label style={{ fontSize: 12.5, fontWeight: 600 }}>Email</label>
          <input className="input" style={{ margin: '6px 0 16px' }} value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" />
          {err && <div className="badge tone-red" style={{ marginBottom: 12, whiteSpace: 'normal' }}>{err}</div>}
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={sending || !email.trim()}>
            {sending ? 'Sending…' : 'Send reset link'}
          </button>
          <button type="button" className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onBack}>Back to sign in</button>
        </>
      )}
    </form>
  );
}
