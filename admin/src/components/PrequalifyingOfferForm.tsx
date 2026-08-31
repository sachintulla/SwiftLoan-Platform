'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { mutate } from 'swr';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui';

// The list page's own useSWR won't know to refetch after a mutation here, so
// invalidate it explicitly (router.refresh only revalidates server components).
const LIST_KEY = '/api/admin/prequalifying-offers';

export interface PrequalifyingOffer {
  id: string;
  lenderName: string;
  logoUrl?: string | null;
  icon: string;
  badge?: string | null;
  amount: number; // paise — firm pre-approved amount
  rate: number; // firm % p.a.
  tenureMonths: number;
  processingFeePercent?: number | null;
  redirectionUrl?: string | null;
  terms?: string | null;
  validTill?: string | null; // ISO
  displayOrder: number;
  active: boolean;
}

const EMPTY: Omit<PrequalifyingOffer, 'id'> = {
  lenderName: '', logoUrl: '', icon: 'account_balance', badge: '',
  amount: 0, rate: 0, tenureMonths: 12, processingFeePercent: null,
  redirectionUrl: '', terms: '', validTill: null, displayOrder: 0, active: true,
};

// Admin thinks in rupees; the API/DB store paise (app-wide convention).
const toRupees = (paise?: number | null) => (paise == null || paise === 0 ? '' : String(paise / 100));
const toPaise = (rupees: string) => (rupees.trim() === '' ? 0 : Math.round(Number(rupees) * 100));
// <input type="date"> wants YYYY-MM-DD; the API returns/accepts an ISO string.
const toDateInput = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');

export function PrequalifyingOfferForm({ offer }: { offer?: PrequalifyingOffer }) {
  const router = useRouter();
  const isEdit = !!offer;
  const [form, setForm] = useState<Omit<PrequalifyingOffer, 'id'>>(offer ?? EMPTY);
  const [amountRupees, setAmountRupees] = useState(toRupees(offer?.amount));
  const [validTillDate, setValidTillDate] = useState(toDateInput(offer?.validTill));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      ...form,
      amount: toPaise(amountRupees),
      validTill: validTillDate ? new Date(validTillDate + 'T23:59:59').toISOString() : null,
      logoUrl: form.logoUrl || null,
      redirectionUrl: form.redirectionUrl || null,
      badge: form.badge || null,
      terms: form.terms || null,
    };
    try {
      if (isEdit) await apiFetch(`/api/admin/prequalifying-offers/${offer!.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      else await apiFetch('/api/admin/prequalifying-offers', { method: 'POST', body: JSON.stringify(payload) });
      await mutate(LIST_KEY);
      router.push('/prequalifying');
    } catch (err: any) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!offer || !confirm(`Delete the "${offer.lenderName}" pre-qualifying offer? This can't be undone.`)) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/prequalifying-offers/${offer.id}`, { method: 'DELETE' });
      await mutate(LIST_KEY);
      router.push('/prequalifying');
    } catch (err: any) {
      setError(err?.message || 'Delete failed');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Card title="Lender">
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <label className="field">
            <span className="field-label">Lender name *</span>
            <input className="input" required value={form.lenderName} onChange={(e) => set('lenderName', e.target.value)} placeholder="IDFC First Bank" />
          </label>
          <label className="field">
            <span className="field-label">Badge (optional)</span>
            <input className="input" value={form.badge ?? ''} onChange={(e) => set('badge', e.target.value)} placeholder="Pre-approved" />
          </label>
          <label className="field">
            <span className="field-label">Logo image URL</span>
            <input className="input" value={form.logoUrl ?? ''} onChange={(e) => set('logoUrl', e.target.value)} placeholder="https://…/idfc-logo.png" />
          </label>
          <label className="field">
            <span className="field-label">Fallback icon (Material Symbol name)</span>
            <input className="input" value={form.icon} onChange={(e) => set('icon', e.target.value)} placeholder="account_balance" />
          </label>
        </div>
      </Card>

      <Card title="Firm offer" className="mt-16">
        <p className="page-sub" style={{ marginTop: 0 }}>These are shown to the user as a firm pre-approval — not a range. Accepting skips the eligibility check and hands off to the lender.</p>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          <label className="field">
            <span className="field-label">Pre-approved amount (₹) *</span>
            <input className="input" type="number" min={0} required value={amountRupees} onChange={(e) => setAmountRupees(e.target.value)} placeholder="500000" />
          </label>
          <label className="field">
            <span className="field-label">Interest rate (% p.a.) *</span>
            <input className="input" type="number" step="0.01" min={0} required value={form.rate || ''} onChange={(e) => set('rate', Number(e.target.value))} placeholder="12.5" />
          </label>
          <label className="field">
            <span className="field-label">Tenure (months) *</span>
            <input className="input" type="number" min={1} required value={form.tenureMonths || ''} onChange={(e) => set('tenureMonths', Number(e.target.value))} placeholder="36" />
          </label>
          <label className="field">
            <span className="field-label">Processing fee (% of amount)</span>
            <input className="input" type="number" step="0.01" min={0} value={form.processingFeePercent ?? ''} onChange={(e) => set('processingFeePercent', e.target.value === '' ? null : Number(e.target.value))} placeholder="1.5" />
          </label>
          <label className="field">
            <span className="field-label">Valid till (optional)</span>
            <input className="input" type="date" value={validTillDate} onChange={(e) => setValidTillDate(e.target.value)} />
          </label>
        </div>
      </Card>

      <Card title="Handoff & terms" className="mt-16">
        <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 14 }}>
          <label className="field">
            <span className="field-label">Lender handoff URL (opened after PAN + KYC on Accept)</span>
            <input className="input" value={form.redirectionUrl ?? ''} onChange={(e) => set('redirectionUrl', e.target.value)} placeholder="https://www.idfcfirstbank.com/personal-loan/apply" />
          </label>
          <label className="field">
            <span className="field-label">Terms / eligibility note (shown on the card)</span>
            <input className="input" value={form.terms ?? ''} onChange={(e) => set('terms', e.target.value)} placeholder="Salaried, net income ≥ ₹30,000/mo" />
          </label>
        </div>
      </Card>

      <Card title="Display" className="mt-16">
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 480 }}>
          <label className="field">
            <span className="field-label">Display order (lower shows first)</span>
            <input className="input" type="number" value={form.displayOrder} onChange={(e) => set('displayOrder', Number(e.target.value))} />
          </label>
        </div>
        <label className="row" style={{ gap: 8, marginTop: 14 }}>
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
          <span>Active (visible in the app)</span>
        </label>
      </Card>

      {error && <p style={{ color: 'var(--red, #c0392b)', marginTop: 14 }}>{error}</p>}

      <div className="row" style={{ gap: 10, marginTop: 20 }}>
        <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create offer'}</button>
        <button className="btn" type="button" onClick={() => router.push('/prequalifying')} disabled={saving}>Cancel</button>
        {isEdit && (
          <button className="btn" type="button" style={{ marginLeft: 'auto', color: 'var(--red, #c0392b)' }} onClick={onDelete} disabled={saving}>
            Delete offer
          </button>
        )}
      </div>
    </form>
  );
}
