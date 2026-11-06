'use client';

import { useCallback, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ShieldCheck, UploadCloud, CreditCard, Lock } from 'lucide-react';
import { ApplyShell, Stepper, BottomBar } from '@/components/apply/ApplyShell';
import { Card, SectionLabel } from '@/components/apply/primitives';
import { AlertDialog, type AlertContent } from '@/components/apply/AlertDialog';
import { PanReplaceArt } from '@/components/apply/PanReplaceArt';
import { PanVerifyingLoader } from '@/components/apply/PanVerifyingLoader';
import { fetchMe, verifyPan, patchProfile } from '@/lib/applyApi';
import { savePanHandoff, maskPan } from '@/lib/panPrefill';
import { scanPanFromImage } from '@/lib/panScan';
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
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState('');
  // Set to the masked PAN already on file when the entered PAN is a DIFFERENT one:
  // we ask before replacing it (and clearing the old account's identity on Step 2).
  const [replaceMasked, setReplaceMasked] = useState<string | null>(null);
  // Set once the API has verified the PAN: the loader finishes its ticks,
  // then goToDetails() moves on.
  const [verified, setVerified] = useState(false);
  const goToDetails = useCallback(() => router.push('/apply/step-2'), [router]);

  // The PAN field always starts empty: we do not keep the PAN (the server holds it only encrypted, for the
  // lender check), so there is nothing to pre-fill — and a pre-filled PAN would suggest otherwise.

  // PAN photo → number, read on this device (the photo is never uploaded). The PAN is only filled into
  // the field for the visitor to check; nothing is verified until they consent and press Verify.
  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // picking the same photo again must re-run
    if (!file || scanning) return;
    setScanning(true);
    setScanNote('');
    try {
      const res = await scanPanFromImage(file);
      if (res.pan !== null) {
        setPan(res.pan);
        setScanNote(t.scanDone);
        return;
      }
      const msg = { not_image: t.scanNotImage, too_big: t.scanTooBig, not_found: t.scanNotFound, error: t.scanFailed }[res.reason];
      // A toast at the top, not a sheet pinned to the bottom of a phone screen.
      if (res.reason === 'error') toast.warning(msg); else toast.error(msg);
    } finally {
      setScanning(false);
    }
  };

  const panValid = isValidPan(pan);
  // A full-length PAN that fails the format check: say so right away, as a toast
  // plus a red hint under the field, instead of only in the line at the bottom.
  const panWrong = pan.length === 10 && !panValid;
  const onPanChange = (raw: string) => {
    const next = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    if (next.length === 10 && !isValidPan(next) && next !== pan) toast.error(t.panInvalid, { id: 'pan-invalid' });
    setPan(next);
  };
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
    // Seamless fallback when PAN auto-fill can't verify: keep the entered PAN on the
    // profile (encrypted server-side — never persisted raw in the client hand-off) so
    // offers can still run, save a masked hand-off with no prefill, and let the loader
    // hand off to Step 2 for manual entry. No alert, no dead-end.
    const attachPanAndContinue = async () => {
      await patchProfile({ panNumber: pan }).catch(() => {});
      savePanHandoff({ panMasked: maskPan(pan), prefill: {}, aadhaarLinked: null });
      succeeded = true;
      setVerified(true);
    };
    try {
      // PAN Comprehensive (server-cached) → pre-fill for Step 2. The loader
      // runs for exactly as long as this takes, then finishes its ticks.
      const result = await verifyPan(pan);
      if (!result.verified) {
        // A DIFFERENT PAN is already linked to this account. Continuing would land
        // Step 2 pre-filled with the EXISTING identity — the old PAN's holder. Ask
        // before replacing; only then clear that identity and go on. Same PAN on
        // file (a flaky re-check) or none → fall through to manual entry as before.
        if (result.panOnFile && result.samePanOnFile === false) {
          setReplaceMasked(result.maskedPanOnFile ?? ''); // finally{} drops the loader
          return;
        }
        // PAN auto-fill is a best-effort BACKGROUND lookup — never block or alert the
        // applicant when the bureau can't verify. Attach the PAN they entered to their
        // profile (encrypted server-side; the raw PAN is never kept in the client
        // hand-off) so offers can still run, then continue to Step 2 for manual entry
        // with no prefill. Mirrors the app's basicpan "continue manually" fallback.
        await attachPanAndContinue();
        return;
      }
      savePanHandoff({ panMasked: maskPan(pan), prefill: result.prefill ?? {}, aadhaarLinked: result.aadhaarLinked });
      succeeded = true;
      setVerified(true); // loader completes → goToDetails
    } catch {
      // Same seamless fallback for a technical/service error, rate-limit or network drop.
      await attachPanAndContinue();
    } finally {
      // On success the loader stays up until it hands off to Step 2.
      if (!succeeded) setLoading(false);
    }
  };

  // Confirmed replacing a different PAN already on file: clear the old identity on
  // Step 2 (clearedForNewPan + empty prefill) and continue with the new PAN.
  const proceedWithReplacement = async () => {
    setReplaceMasked(null);
    setLoading(true);
    setVerified(false);
    await patchProfile({ panNumber: pan }).catch(() => {});
    savePanHandoff({ panMasked: maskPan(pan), prefill: {}, aadhaarLinked: null, clearedForNewPan: true });
    setVerified(true); // loader completes → goToDetails
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

      <Card className="flex flex-col gap-5 sm:p-7">
        {/* Upload and manual entry side by side, so both fit on one screen. */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2.5 sm:gap-5">
          <div className="flex min-w-0 flex-col">
            <SectionLabel>{t.uploadLabel}</SectionLabel>
            <label
              htmlFor="pan-upload"
              className="border-border hover:border-primary hover:bg-accent/40 group flex flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed p-3 text-center transition-colors sm:p-4"
            >
              <span className="bg-accent grid h-9 w-9 place-items-center rounded-xl transition-transform group-hover:scale-105">
                <UploadCloud className="text-primary h-5 w-5" />
              </span>
              <p className="text-xs font-bold sm:text-sm">{scanning ? t.scanning : t.uploadDrop}</p>
              <p className="text-muted-foreground hidden text-[11px] sm:block">{t.uploadDetect}</p>
              <span className="border-border bg-card rounded-full border px-3 py-1 text-[11px] font-bold">{t.chooseFile}</span>
              <input
                id="pan-upload"
                type="file"
                accept="image/*"
                disabled={scanning}
                onChange={onPickFile}
                aria-busy={scanning}
                className="sr-only"
              />
            </label>
          </div>

          <div className="text-muted-foreground flex flex-col items-center gap-2 pt-6 text-[10px] font-bold">
            <span className="bg-border w-px flex-1" />
            <span className="[writing-mode:vertical-rl] rotate-180 tracking-wider">{t.orManual}</span>
            <span className="bg-border w-px flex-1" />
          </div>

          <label className="flex min-w-0 flex-col gap-1.5 text-sm">
            <span className="text-foreground text-xs font-semibold sm:text-sm">
              {t.panLabel}<span className="text-danger ml-0.5">*</span>
            </span>
            <input
              value={pan}
              maxLength={10}
              onChange={(e) => onPanChange(e.target.value)}
              placeholder="ABCDE1234F"
              aria-invalid={panWrong}
              data-voice-sensitive="pan"
              className={`input-interactive field-input h-11 w-full min-w-0 rounded-xl px-2.5 text-sm font-bold tracking-[0.06em] sm:px-3.5 sm:text-base sm:tracking-[0.15em] ${panWrong ? 'border-danger' : ''}`}
            />
            <span className={`text-[11px] sm:text-xs ${panWrong ? 'text-danger font-semibold' : 'text-muted-foreground'}`}>
              {panWrong ? t.missingPanValid : t.panHint}
            </span>
          </label>
        </div>
        {scanNote && <p role="status" className="text-primary -mt-2 text-xs font-semibold">{scanNote}</p>}

        <label className="bg-accent flex items-start gap-3 rounded-xl p-4">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required className="accent-primary mt-0.5 h-5 w-5 shrink-0" />
          <span className="flex items-start gap-2 text-xs">
            <Lock className="text-primary mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="text-muted-foreground">
              {t.consentA}<strong className="text-foreground">{t.consentStrong}</strong>{t.consentB}
              <a href="/privacy-policy" className="text-primary font-semibold underline">{t.consentLink}</a>{t.consentEnd}
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
      <AlertDialog
        open={!!replaceMasked}
        content={
          replaceMasked
            ? { tone: 'warning', title: t.replaceTitle, message: t.replaceBody.replace('{pan}', replaceMasked) }
            : null
        }
        onClose={() => setReplaceMasked(null)}
        onConfirm={proceedWithReplacement}
        confirmLabel={t.replaceConfirm}
        cancelLabel={t.replaceCancel}
        illustration={replaceMasked ? <PanReplaceArt masked={replaceMasked} /> : undefined}
      />
    </ApplyShell>
  );
}
