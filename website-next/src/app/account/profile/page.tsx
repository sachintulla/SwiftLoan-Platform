'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AccountShell } from '@/components/apply/AccountShell';
import { Card, SectionLabel, TextInput } from '@/components/apply/primitives';
import { useAccount } from '@/lib/accountContext';
import { patchProfile, patchNotifications } from '@/lib/applyApi';

const LINKS = [
  { label: 'FAQs', href: '/faqs' },
  { label: 'Privacy Policy', href: '/privacypolicy' },
  { label: 'Terms of Service', href: '#' },
  { label: 'Lending Partners', href: '#' },
  { label: 'Grievance Redressal', href: '/account/support' },
];

export default function ProfilePage() {
  const { user, refresh } = useAccount();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState((user?.fullName as string) || '');
  const [email, setEmail] = useState((user?.email as string) || '');
  const [saving, setSaving] = useState(false);
  const [notif, setNotif] = useState({
    loanUpdates: !!user?.notifyLoanUpdates,
    securityAlerts: !!user?.notifySecurityAlerts,
    promoOffers: !!user?.notifyPromoOffers,
  });

  // `user` loads asynchronously (AccountProvider's own /me call) — it's still
  // null on this component's first render, so the useState initializers above
  // capture false/'' regardless of the real values. Re-sync once it arrives.
  useEffect(() => {
    if (!user) return;
    setFullName((user.fullName as string) || '');
    setEmail((user.email as string) || '');
    setNotif({
      loanUpdates: !!user.notifyLoanUpdates,
      securityAlerts: !!user.notifySecurityAlerts,
      promoOffers: !!user.notifyPromoOffers,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const save = async () => {
    setSaving(true);
    try {
      await patchProfile({ fullName, email });
      refresh();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (key: keyof typeof notif) => {
    const next = { ...notif, [key]: !notif[key] };
    setNotif(next);
    await patchNotifications({ [key]: next[key] } as any).catch(() => setNotif(notif));
  };

  if (!user) {
    return (
      <AccountShell>
        <p className="text-muted-foreground text-sm">Loading…</p>
      </AccountShell>
    );
  }

  return (
    <AccountShell>
      <h1 className="text-2xl font-extrabold">My profile</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">Manage your details, language and notification preferences.</p>

      <div className="flex flex-col gap-5">
        <Card className="flex items-center gap-4">
          <div className="bg-brand-gradient grid h-14 w-14 place-items-center rounded-full text-lg font-extrabold text-white">
            {((user.fullName as string) || 'U').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="font-extrabold">{(user.fullName as string) || 'Add your name'}</div>
            <div className="text-muted-foreground text-xs">
              Member since {user.createdAt ? new Date(user.createdAt as string).getFullYear() : '—'}
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel>Personal details</SectionLabel>
            {!editing && (
              <button onClick={() => setEditing(true)} className="text-primary text-xs font-bold">
                Edit
              </button>
            )}
          </div>
          {editing ? (
            <div className="flex flex-col gap-3">
              <TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" />
              <TextInput value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" />
              <div className="flex gap-2">
                <button onClick={save} disabled={saving} className="bg-brand-gradient text-primary-foreground flex-1 rounded-full py-2.5 text-sm font-bold">
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button onClick={() => setEditing(false)} className="border-border flex-1 rounded-full border py-2.5 text-sm font-bold">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              <Row k="Full name" v={(user.fullName as string) || '—'} />
              <Row k="Email" v={(user.email as string) || '—'} />
              <Row k="Mobile" v={`+91 ${user.phone}`} last />
            </div>
          )}
        </Card>

        <Card>
          <SectionLabel>Notifications</SectionLabel>
          <ToggleRow label="Loan updates" sub="Status changes on your applications" on={notif.loanUpdates} onToggle={() => toggle('loanUpdates')} />
          <ToggleRow label="Security alerts" sub="New logins & account changes" on={notif.securityAlerts} onToggle={() => toggle('securityAlerts')} />
          <ToggleRow label="Promotional offers" sub="New lender deals & discounts" on={notif.promoOffers} onToggle={() => toggle('promoOffers')} last />
        </Card>

        <Card className="p-1.5">
          {LINKS.map((l, i) => (
            <Link
              key={l.label}
              href={l.href}
              className={`flex items-center gap-3 px-3 py-3 text-sm font-semibold ${i < LINKS.length - 1 ? 'border-border border-b' : ''}`}
            >
              {l.label}
              <span className="text-muted-foreground ml-auto">›</span>
            </Link>
          ))}
        </Card>
      </div>
    </AccountShell>
  );
}

function Row({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <div className={`flex justify-between py-2.5 text-sm ${last ? '' : 'border-border border-b'}`}>
      <span className="text-muted-foreground">{k}</span>
      <strong>{v}</strong>
    </div>
  );
}

function ToggleRow({ label, sub, on, onToggle, last }: { label: string; sub: string; on: boolean; onToggle: () => void; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-3 ${last ? '' : 'border-border border-b'}`}>
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-muted-foreground text-xs">{sub}</div>
      </div>
      <button
        onClick={onToggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-muted'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}
