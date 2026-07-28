'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@swiftloan.com');
  const [password, setPassword] = useState('admin123');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace('/overview');
    } catch (e) {
      setErr((e as Error).message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#0a3f41,#079fa0)' }}>
      <form onSubmit={submit} className="card" style={{ width: 380, padding: 32 }}>
        <div className="row" style={{ gap: 10, marginBottom: 20 }}>
          <div className="brand-logo" style={{ width: 38, height: 38, fontSize: 18 }}>S</div>
          <div><div style={{ fontWeight: 750, fontSize: 18 }}>SwiftLoan Admin</div><div className="muted" style={{ fontSize: 12 }}>Operations dashboard</div></div>
        </div>
        <label style={{ fontSize: 12.5, fontWeight: 600 }}>Email</label>
        <input className="input" style={{ margin: '6px 0 14px' }} value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" />
        <label style={{ fontSize: 12.5, fontWeight: 600 }}>Password</label>
        <input className="input" style={{ margin: '6px 0 18px' }} value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" />
        {err && <div className="badge tone-red" style={{ marginBottom: 12 }}>{err}</div>}
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted" style={{ fontSize: 11.5, marginTop: 14, marginBottom: 0, textAlign: 'center' }}>Demo: admin@swiftloan.com · admin123</p>
      </form>
    </div>
  );
}
