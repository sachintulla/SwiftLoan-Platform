'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, SectionLabel } from '@/components/apply/primitives';
import { deleteAccount } from '@/lib/applyApi';
import { useCopy } from '@/lib/i18n';
import { accountDeleteCopy } from '@/i18n/account-delete';

// Same codes the server accepts (server/src/lib/accountDeletion.ts).
const REASON_CODES = ['no_longer_needed', 'privacy', 'too_many_contacts', 'better_option', 'poor_experience', 'duplicate_account', 'other'];
const DETAILS_MAX = 500;
const DETAILS_MIN_OTHER = 5;

/**
 * Self-service account deletion. NOTE: only real errors may use the `text-danger` class here — the voice layer
 * (lib/voice-dom.ts collectMessages) reads that class as an on-screen error message, so decorative red uses an arbitrary value.
 * Deliberate on purpose: a reason is mandatory, "Something else" needs a few
 * words, and the person types a confirmation word before the button works. The reason is stored anonymously
 * (no user id or phone). Everything in here is marked `data-voice-sensitive`, so the voice assistant can
 * neither fill the confirmation nor delete the account — it is the visitor's own decision.
 */
export function DeleteAccountCard() {
  const t = useCopy(accountDeleteCopy);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detailsOk = reason !== 'other' || details.trim().length >= DETAILS_MIN_OTHER;
  const confirmed = typed.trim().toUpperCase() === t.confirmWord;
  const ready = !!reason && detailsOk && confirmed && !busy;

  const close = () => {
    setOpen(false);
    setReason('');
    setDetails('');
    setTyped('');
    setError(null);
  };

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount({ reason, details: details.trim() || undefined });
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error && e.message && e.message !== 'Request failed' ? e.message : t.failed);
      setBusy(false);
    }
  };

  return (
    <Card data-voice-sensitive="delete-account">
      <SectionLabel>{t.title}</SectionLabel>
      <p className="text-muted-foreground text-sm">{t.sub}</p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-voice-sensitive="delete-account"
          className="border-danger mt-4 rounded-full border px-5 py-2.5 text-sm font-bold text-[color:var(--danger)]"
        >
          {t.open}
        </button>
      ) : (
        <div className="mt-4 flex flex-col gap-4" data-voice-sensitive="delete-account">
          <div className="border-danger/40 bg-danger/5 rounded-xl border p-3.5 text-sm">
            <p className="font-bold text-[color:var(--danger)]">{t.warnTitle}</p>
            <p className="mt-1">{t.warnBody}</p>
            <p className="text-muted-foreground mt-2 text-xs">{t.activeLoan}</p>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-bold">{t.reasonLabel}</legend>
            <div className="flex flex-col gap-1.5">
              {REASON_CODES.map((code) => (
                <label key={code} className="border-border flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-semibold">
                  <input
                    type="radio"
                    name="delete-reason"
                    value={code}
                    checked={reason === code}
                    onChange={() => setReason(code)}
                    data-voice-sensitive="delete-account"
                  />
                  {t.reasons[code]}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1.5 text-sm font-bold">
            <span>
              {t.detailsLabel}{' '}
              {reason !== 'other' && <span className="text-muted-foreground font-medium">{t.detailsOptional}</span>}
            </span>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, DETAILS_MAX))}
              placeholder={t.detailsPlaceholder}
              rows={3}
              maxLength={DETAILS_MAX}
              data-voice-sensitive="delete-account"
              className="field-input w-full rounded-xl px-3.5 py-2.5 text-sm font-medium"
            />
            {reason === 'other' && !detailsOk && <span className="text-danger text-xs font-semibold">{t.detailsRequired}</span>}
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-bold">
            <span>{t.confirmLabel(t.confirmWord)}</span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              data-voice-sensitive="delete-account"
              className="input-interactive field-input h-11 w-full rounded-xl px-3.5 text-sm font-medium"
            />
          </label>

          {error && (
            <p className="text-danger text-xs font-semibold" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={!ready}
              aria-busy={busy || undefined}
              data-voice-sensitive="delete-account"
              className={`flex-1 rounded-full px-5 py-3 text-sm font-bold ${ready ? 'bg-danger text-white' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
            >
              {busy ? t.deleting : t.confirmCta}
            </button>
            <button type="button" onClick={close} disabled={busy} className="border-border flex-1 rounded-full border px-5 py-3 text-sm font-bold">
              {t.cancel}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
