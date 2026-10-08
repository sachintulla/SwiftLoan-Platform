'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, UploadCloud, CreditCard, Lock } from 'lucide-react';
import { ApplyShell, Stepper, BottomBar } from '@/components/apply/ApplyShell';
import { Card, SectionLabel } from '@/components/apply/primitives';
import { AlertDialog, type AlertContent } from '@/components/apply/AlertDialog';
import { PanVerifyingLoader } from '@/components/apply/PanVerifyingLoader';
import { fetchMe, verifyPan } from '@/lib/applyApi';
import { savePanHandoff } from '@/lib/panPrefill';
import { useAccountUser } from '@/hooks/useAccountUser';
import { useCopy } from '@/lib/i18n';
import { applyFlowCopy } from '@/i18n/apply-flow';

const PAN_HOLDER_CODES = 'ABCFGHJLPT';
function isValidPan(v: string) {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v) && PAN_HOLDER_CODES.includes(v[3] ?? '');
}

/**
 * Popup content comes straight from the API response — no copy is written
 * here. Only the icon tone is chosen locally: red when the PAN itself failed,
 * amber when the service couldn't be reached / retry is the answer.
 */
function alertFromError(e: unknown, fallback: string): AlertContent {
  const status = (e as { status?: number })?.status;
  return {
    tone: status === 400 || status === 409 ? 'error' : 'warning',
    message: e instanceof Error && e.message ? e.message : fallback,
  };
}

export default function Step1PanPage() {
  const router = useRouter();
  const t = useCopy(applyFlowCopy).pan;
  // Non-null once a login session exists: swaps in the account sidebar (with
  // Log out) and sends "Back" to the dashboard rather than the marketing site.
  const accountUser = useAccountUser();
  const [pan, setPan] = useState('');
  // Consent must be an explicit, unforced opt-in — it authorizes a credit-report
  // pull, so it must never start pre-checked.
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<AlertContent | null>(null);
  // Set once the API has verified the PAN: the loader finishes its ticks,
  // then goToDetails() moves on.
  const [verified, setVerified] = useState(false);
  const goToDetails = useCallback(() => router.push('/apply/step-2'), [router]);

  // Returning applicant ("Update details", a second loan): start from the PAN
  // already on their profile. Re-verifying it is served from the server's PAN
  // cache, so it never costs a second paid Aurix call.
  useEffect(() => {
    fetchMe()
      .then((res) => {
        const saved = res?.data?.user?.panNumber;
        if (saved) setPan((cur) => cur || String(saved));
      })
      .catch(() => { /* not logged in yet / offline — empty field is fine */ });
  }, []);

  const panValid = isValidPan(pan);
  const valid = panValid && consent;
  const missing: string[] = [];
  if (!panValid) missing.push(pan ? t.missingPanValid : t.missingPan);
  if (!consent) missing.push(t.missingConsent);

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setVerified(false);
    window.scrollTo({ top: 0 });
    let succeeded = false;
    try {
      // PAN Comprehensive (server-cached) → pre-fill for Step 2. The loader
      // runs for exactly as long as this takes, then finishes its ticks.
      const result = await verifyPan(pan);
      if (!result.verified) {
        setAlert({ tone: 'error', message: result.message || t.fallbackError });
        return;
      }
      savePanHandoff({ pan, prefill: result.prefill ?? {}, aadhaarLinked: result.aadhaarLinked });
      succeeded = true;
      setVerified(true); // loader completes → goToDetails
    } catch (e) {
      setAlert(alertFromError(e, t.fallbackError));
    } finally {
      // On success the loader stays up until it hands off to Step 2.
      if (!succeeded) setLoading(false);
    }
  };

  // While verifying, the loader replaces the form inside the same shell —
  // brand rail stays, and it reads as its own page within the funnel.
  if (loading) {
    return (
      <ApplyShell stepLabel={t.stepLabel} progressPct={40} accountUser={accountUser}>
        <Stepper step={1} />
        <PanVerifyingLoader done={verified} onFinished={goToDetails} />
      </ApplyShell>
    );
  }

  return (
    <ApplyShell
      backHref={accountUser ? '/account' : '/'}
      backLabel={accountUser ? t.backDashboard : t.backHome}
      stepLabel={t.stepLabel}
      progressPct={28}
      accountUser={accountUser}
    >
      <Stepper step={1} />
      <div className="mb-7 flex items-start gap-3.5">
        <span className="bg-accent grid h-11 w-11 shrink-0 place-items-center rounded-2xl">
          <CreditCard className="text-primary h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold">{t.title}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t.subtitle}</p>
        </div>
      </div>

      <Card className="flex flex-col gap-6 sm:p-7">
        <div>
          <SectionLabel>{t.uploadLabel}</SectionLabel>
          <label
            htmlFor="pan-upload"
            className="border-border hover:border-primary hover:bg-accent/40 group flex cursor-pointer flex-col items-center gap-2.5 rounded-2xl border-2 border-dashed p-8 text-center transition-colors"
          >
            <span className="bg-accent grid h-12 w-12 place-items-center rounded-2xl transition-transform group-hover:scale-105">
              <UploadCloud className="text-primary h-6 w-6" />
            </span>
            <p className="text-sm font-bold">{t.uploadDrop}</p>
            <p className="text-muted-foreground text-xs">{t.uploadDetect}</p>
            <span className="border-border bg-card mt-1 rounded-full border px-4 py-2 text-xs font-bold">{t.chooseFile}</span>
            <input id="pan-upload" type="file" accept="image/*,.pdf" className="sr-only" />
          </label>
        </div>

        <div className="text-muted-foreground flex items-center gap-3 text-xs font-bold">
          <span className="bg-border h-px flex-1" />
          {t.orManual}
          <span className="bg-border h-px flex-1" />
        </div>

        <label className="flex max-w-xs flex-col gap-1.5 text-sm">
          <span className="text-foreground font-semibold">
            {t.panLabel}<span className="text-danger ml-0.5">*</span>
          </span>
          <input
            value={pan}
            maxLength={10}
            onChange={(e) => setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="ABCDE1234F"
            data-voice-sensitive="pan"
            className="input-interactive field-input h-12 rounded-xl px-3.5 text-base font-bold tracking-[0.15em]"
          />
          <span className="text-muted-foreground text-xs">{t.panHint}</span>
        </label>

        <label className="bg-accent flex items-start gap-3 rounded-xl p-4">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required className="accent-primary mt-0.5 h-5 w-5 shrink-0" />
          <span className="flex items-start gap-2 text-xs">
            <Lock className="text-primary mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="text-muted-foreground">
              {t.consentA}<strong className="text-foreground">{t.consentStrong}</strong>{t.consentB}
              <a href="/privacypolicy" className="text-primary font-semibold underline">{t.consentLink}</a>{t.consentEnd}
            </span>
          </span>
        </label>
      </Card>

      <div className="text-muted-foreground mt-4 flex items-center gap-2 text-xs">
        <ShieldCheck className="text-mint h-4 w-4 shrink-0" />
        {t.encryption}
      </div>

      {!valid && (
        <p className="text-muted-foreground mt-3 text-xs">
          <span className="text-danger font-semibold">{t.requiredLabel}</span> {missing.join(t.requiredJoin)}{t.requiredEnd}
        </p>
      )}

      <BottomBar meta={t.meta}>
        <button
          onClick={submit}
          disabled={!valid || loading}
          data-voice-gate="verify-pan"
          className={`rounded-full px-6 py-3 text-sm font-bold transition-all ${
            !valid || loading
              ? 'bg-muted text-muted-foreground'
              : 'bg-brand-gradient text-primary-foreground shadow-[var(--shadow-soft)] hover:-translate-y-0.5'
          }`}
        >
          {loading ? t.verifying : t.verifyCta}
        </button>
      </BottomBar>
      <AlertDialog open={!!alert} content={alert} onClose={() => setAlert(null)} />
    </ApplyShell>
  );
}
