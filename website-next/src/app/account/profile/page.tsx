'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { AccountShell } from '@/components/apply/AccountShell';
import { DeleteAccountCard } from '@/components/account/DeleteAccountCard';
import { Card, SectionLabel, TextInput } from '@/components/apply/primitives';
import { useAccount } from '@/lib/accountContext';
import { patchProfile, patchNotifications, uploadAvatar, removeAvatar } from '@/lib/applyApi';
import { useCopy } from '@/lib/i18n';
import { accountCopy } from '@/i18n/account';

export default function ProfilePage() {
  const { user, refresh } = useAccount();
  const t = useCopy(accountCopy);
  const LINKS = [
    { label: t.linkFaqs, href: '/account/faqs' },
    { label: t.linkPrivacy, href: '/account/privacy' },
    { label: t.linkTerms, href: '/account/terms' },
    { label: t.linkPartners, href: '/account/partners' },
    { label: t.linkGrievance, href: '/account/support' },
  ];
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState((user?.fullName as string) || '');
  const [email, setEmail] = useState((user?.email as string) || '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const avatarUrl = (user?.avatarUrl as string | null | undefined) || null;

  const onPickPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // picking the same photo again must re-run
    if (!file || photoBusy) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { toast.error(t.photoWrongType); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error(t.photoTooBig); return; }
    setPhotoBusy(true);
    try {
      await uploadAvatar(file);
      refresh();
      toast.success(t.photoSaved);
    } catch (err) {
      toast.error(err instanceof Error && err.message && err.message !== 'Request failed' ? err.message : t.photoFailed);
    } finally {
      setPhotoBusy(false);
    }
  };

  const onRemovePhoto = async () => {
    if (photoBusy) return;
    setPhotoBusy(true);
    try {
      await removeAvatar();
      refresh();
    } catch {
      toast.error(t.photoFailed);
    } finally {
      setPhotoBusy(false);
    }
  };
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
    setSaveError(null);
    try {
      // Only fields that have a value: an empty email is not a valid email, and sending it made the whole save fail.
      const patch: Record<string, string> = {};
      if (fullName.trim()) patch.fullName = fullName.trim();
      if (email.trim()) patch.email = email.trim();
      await patchProfile(patch);
      refresh();
      setEditing(false);
    } catch (e) {
      // Shown on screen (role=alert) so the voice assistant also sees that it did NOT save.
      setSaveError(e instanceof Error && e.message && e.message !== 'Request failed' ? e.message : t.saveFailed);
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
        <p className="text-muted-foreground text-sm" aria-busy="true">{t.loading}</p>
      </AccountShell>
    );
  }

  return (
    <AccountShell>
      <h1 className="text-2xl font-extrabold">{t.profileTitle}</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">{t.profileSub}</p>

      <div className="flex flex-col gap-5">
        <Card className="flex items-center gap-4">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="bg-brand-gradient grid h-14 w-14 shrink-0 place-items-center rounded-full text-lg font-extrabold text-white">
              {((user.fullName as string) || 'U').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-extrabold">{(user.fullName as string) || t.addYourName}</div>
            <div className="text-muted-foreground text-xs">
              {t.memberSince(user.createdAt ? new Date(user.createdAt as string).getFullYear() : '—')}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-3 text-xs font-bold">
              <button type="button" onClick={() => photoInput.current?.click()} disabled={photoBusy} aria-busy={photoBusy} className="text-primary">
                {photoBusy ? t.photoUploading : avatarUrl ? t.photoChange : t.photoAdd}
              </button>
              {avatarUrl && !photoBusy && (
                <button type="button" onClick={onRemovePhoto} className="text-muted-foreground">
                  {t.photoRemove}
                </button>
              )}
            </div>
            <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickPhoto} className="sr-only" tabIndex={-1} aria-hidden />
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel>{t.personalDetails}</SectionLabel>
            {!editing && (
              <button onClick={() => setEditing(true)} className="text-primary -my-2 -mr-3 rounded-full px-3 py-2 text-xs font-bold">
                {t.edit}
              </button>
            )}
          </div>
          {editing ? (
            <div className="flex flex-col gap-3">
              <TextInput value={fullName} maxLength={120} onChange={(e) => setFullName(e.target.value.replace(/[^A-Za-z '.-]/g, '').slice(0, 120))} placeholder={t.fullNamePlaceholder} />
              <TextInput value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailPlaceholder} type="email" />
              {saveError && (
                <p className="text-danger text-xs font-semibold" role="alert">
                  {saveError}
                </p>
              )}
              <div className="flex gap-2">
                <button onClick={save} disabled={saving} className="bg-brand-gradient text-primary-foreground flex-1 rounded-full py-2.5 text-sm font-bold">
                  {saving ? t.saving : t.saveChanges}
                </button>
                <button onClick={() => setEditing(false)} className="border-border flex-1 rounded-full border py-2.5 text-sm font-bold">
                  {t.cancel}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              <Row k={t.rowFullName} v={(user.fullName as string) || '—'} />
              <Row k={t.rowEmail} v={(user.email as string) || '—'} />
              <Row k={t.rowMobile} v={`+91 ${user.phone}`} last />
            </div>
          )}
        </Card>

        <Card>
          <SectionLabel>{t.notifications}</SectionLabel>
          <ToggleRow label={t.notifLoanUpdates} sub={t.notifLoanUpdatesSub} on={notif.loanUpdates} onToggle={() => toggle('loanUpdates')} />
          <ToggleRow label={t.notifSecurity} sub={t.notifSecuritySub} on={notif.securityAlerts} onToggle={() => toggle('securityAlerts')} />
          <ToggleRow label={t.notifPromo} sub={t.notifPromoSub} on={notif.promoOffers} onToggle={() => toggle('promoOffers')} last />
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

        <DeleteAccountCard />
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
        type="button"
        onClick={onToggle}
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full p-0 transition-colors ${on ? 'bg-primary' : 'bg-muted'}`}
      >
        {/* `left-0.5` is explicit (not left implicit/auto) so the knob's rest
            position doesn't depend on the button's own box model — relying on
            that made it drift a px or two and look slightly off-center /
            clipped against the track's rounded ends. */}
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
  );
}
