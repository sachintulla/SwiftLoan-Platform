'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { mutate } from 'swr';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui';

// The list page's own useSWR('/api/admin/preapproved-plans') won't know to
// refetch after a mutation here — router.refresh() only revalidates server
// components, not client-side SWR caches — so invalidate it explicitly.
const LIST_KEY = '/api/admin/preapproved-plans';

export interface PreApprovedPlan {
  id: string;
  lenderName: string;
  logoUrl?: string | null;
  icon: string;
  exploreUrl?: string | null;
  badge?: string | null;
  maxAmount?: number | null; // paise
  amountAtApproval: boolean;
  rateMin?: number | null;
  rateMax?: number | null;
  rateAtApproval: boolean;
  tenureMinMonths?: number | null;
  tenureMaxMonths?: number | null;
  tags: string[];
  displayOrder: number;
  active: boolean;
}

const EMPTY: Omit<PreApprovedPlan, 'id'> = {
  lenderName: '', logoUrl: '', icon: 'account_balance', exploreUrl: '', badge: '',
  maxAmount: null, amountAtApproval: false,
  rateMin: null, rateMax: null, rateAtApproval: false,
  tenureMinMonths: null, tenureMaxMonths: null,
  tags: [], displayOrder: 0, active: true,
};

// Admin thinks in rupees; the API/DB store paise (app-wide convention).
const toRupees = (paise?: number | null) => (paise == null ? '' : String(paise / 100));
const toPaise = (rupees: string) => (rupees.trim() === '' ? null : Math.round(Number(rupees) * 100));

export function PreApprovedPlanForm({ plan }: { plan?: PreApprovedPlan }) {
  const router = useRouter();
  const isEdit = !!plan;
  const [form, setForm] = useState<Omit<PreApprovedPlan, 'id'>>(plan ?? EMPTY);
  const [maxAmountRupees, setMaxAmountRupees] = useState(toRupees(plan?.maxAmount));
  const [tagsText, setTagsText] = useState((plan?.tags ?? []).join(', '));
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
      maxAmount: form.amountAtApproval ? null : toPaise(maxAmountRupees),
      tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean),
      logoUrl: form.logoUrl || null,
      exploreUrl: form.exploreUrl || null,
      badge: form.badge || null,
    };
    try {
      if (isEdit) await apiFetch(`/api/admin/preapproved-plans/${plan!.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      else await apiFetch('/api/admin/preapproved-plans', { method: 'POST', body: JSON.stringify(payload) });
      await mutate(LIST_KEY);
      router.push('/preapproved');
    } catch (err: any) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!plan || !confirm(`Delete the "${plan.lenderName}" plan? This can't be undone.`)) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/preapproved-plans/${plan.id}`, { method: 'DELETE' });
      await mutate(LIST_KEY);
      router.push('/preapproved');
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
            <input className="input" required value={form.lenderName} onChange={(e) => set('lenderName', e.target.value)} placeholder="IDFC" />
          </label>
          <label className="field">
            <span className="field-label">Badge (optional)</span>
            <input className="input" value={form.badge ?? ''} onChange={(e) => set('badge', e.target.value)} placeholder="Best rate" />
          </label>
          <label className="field">
            <span className="field-label">Logo image URL</span>
            <input className="input" value={form.logoUrl ?? ''} onChange={(e) => set('logoUrl', e.target.value)} placeholder="https://…/idfc-logo.png" />
          </label>
          <label className="field">
            <span className="field-label">Fallback icon (Material Symbol name)</span>
            <input className="input" value={form.icon} onChange={(e) => set('icon', e.target.value)} placeholder="account_balance" />
          </label>
          <label className="field">
            <span className="field-label">Explore URL (opened in-browser from &quot;Explore Plan&quot;)</span>
            <input className="input" value={form.exploreUrl ?? ''} onChange={(e) => set('exploreUrl', e.target.value)} placeholder="https://www.idfcfirstbank.com/personal-loan" />
          </label>
        </div>
      </Card>

      <Card title="Amount" className="mt-16">
        <label className="row" style={{ gap: 8, marginBottom: 10 }}>
          <input type="checkbox" checked={form.amountAtApproval} onChange={(e) => set('amountAtApproval', e.target.checked)} />
          <span>Amount decided at approval (no cap shown — e.g. MoneyView)</span>
        </label>
        {!form.amountAtApproval && (
          <label className="field" style={{ maxWidth: 240 }}>
            <span className="field-label">Max amount (₹)</span>
            <input className="input" type="number" min={0} value={maxAmountRupees} onChange={(e) => setMaxAmountRupees(e.target.value)} placeholder="300000" />
          </label>
        )}
      </Card>

      <Card title="Interest rate" className="mt-16">
        <label className="row" style={{ gap: 8, marginBottom: 10 }}>
          <input type="checkbox" checked={form.rateAtApproval} onChange={(e) => set('rateAtApproval', e.target.checked)} />
          <span>Rate decided at approval (no range shown — e.g. UnitySFB)</span>
        </label>
        {!form.rateAtApproval && (
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 480 }}>
            <label className="field">
              <span className="field-label">Min rate (% p.a.)</span>
              <input className="input" type="number" step="0.01" value={form.rateMin ?? ''} onChange={(e) => set('rateMin', e.target.value === '' ? null : Number(e.target.value))} placeholder="10" />
            </label>
            <label className="field">
              <span className="field-label">Max rate (% p.a.)</span>
              <input className="input" type="number" step="0.01" value={form.rateMax ?? ''} onChange={(e) => set('rateMax', e.target.value === '' ? null : Number(e.target.value))} placeholder="20.1" />
            </label>
          </div>
        )}
      </Card>

      <Card title="Tenure" className="mt-16">
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 480 }}>
          <label className="field">
            <span className="field-label">Min tenure (months)</span>
            <input className="input" type="number" min={1} value={form.tenureMinMonths ?? ''} onChange={(e) => set('tenureMinMonths', e.target.value === '' ? null : Number(e.target.value))} placeholder="12" />
          </label>
          <label className="field">
            <span className="field-label">Max tenure (months)</span>
            <input className="input" type="number" min={1} value={form.tenureMaxMonths ?? ''} onChange={(e) => set('tenureMaxMonths', e.target.value === '' ? null : Number(e.target.value))} placeholder="84" />
          </label>
        </div>
      </Card>

      <Card title="Display" className="mt-16">
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <label className="field">
            <span className="field-label">Extra tags (comma-separated, for outlier cards)</span>
            <input className="input" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="Lowest income entry, ROI on offer" />
          </label>
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
        <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create plan'}</button>
        <button className="btn" type="button" onClick={() => router.push('/preapproved')} disabled={saving}>Cancel</button>
        {isEdit && (
          <button className="btn" type="button" style={{ marginLeft: 'auto', color: 'var(--red, #c0392b)' }} onClick={onDelete} disabled={saving}>
            Delete plan
          </button>
        )}
      </div>
    </form>
  );
}
