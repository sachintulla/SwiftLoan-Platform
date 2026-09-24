'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, UploadCloud, CreditCard, Lock } from 'lucide-react';
import { ApplyShell, Stepper, BottomBar } from '@/components/apply/ApplyShell';
import { Card, SectionLabel } from '@/components/apply/primitives';
import { fetchMe, verifyPan } from '@/lib/applyApi';
import { savePanHandoff } from '@/lib/panPrefill';

const PAN_HOLDER_CODES = 'ABCFGHJLPT';
function isValidPan(v: string) {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v) && PAN_HOLDER_CODES.includes(v[3] ?? '');
}

export default function Step1PanPage() {
  const router = useRouter();
  const [pan, setPan] = useState('');
  // Consent must be an explicit, unforced opt-in — it authorizes a credit-report
  // pull, so it must never start pre-checked.
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  if (!panValid) missing.push(pan ? 'a valid 10-character PAN number' : 'your PAN number');
  if (!consent) missing.push('consent to the authorization below');

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      // PAN Comprehensive (server-cached) → pre-fill for Step 2.
      const result = await verifyPan(pan);
      if (!result.verified) {
        setError(result.message || 'We couldn’t verify this PAN. Please check the number and try again.');
        return;
      }
      savePanHandoff({ pan, prefill: result.prefill ?? {} });
      router.push('/apply/step-2');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not verify PAN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ApplyShell backHref="/" backLabel="Back to home" stepLabel="Step 1 of 3" progressPct={28}>
      <Stepper step={1} />
      <div className="mb-7 flex items-start gap-3.5">
        <span className="bg-accent grid h-11 w-11 shrink-0 place-items-center rounded-2xl">
          <CreditCard className="text-primary h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold">Verify your PAN</h1>
          <p className="text-muted-foreground mt-1 text-sm">We&apos;ll use your PAN to verify your identity and fill in your details for you.</p>
        </div>
      </div>

      <Card className="flex flex-col gap-6 sm:p-7">
        <div>
          <SectionLabel>Upload PAN card</SectionLabel>
          <label
            htmlFor="pan-upload"
            className="border-border hover:border-primary hover:bg-accent/40 group flex cursor-pointer flex-col items-center gap-2.5 rounded-2xl border-2 border-dashed p-8 text-center transition-colors"
          >
            <span className="bg-accent grid h-12 w-12 place-items-center rounded-2xl transition-transform group-hover:scale-105">
              <UploadCloud className="text-primary h-6 w-6" />
            </span>
            <p className="text-sm font-bold">Drag &amp; drop your PAN card here, or click to upload</p>
            <p className="text-muted-foreground text-xs">We&apos;ll auto-detect your PAN number — accurate &amp; instant</p>
            <span className="border-border bg-card mt-1 rounded-full border px-4 py-2 text-xs font-bold">Choose file</span>
            <input id="pan-upload" type="file" accept="image/*,.pdf" className="sr-only" />
          </label>
        </div>

        <div className="text-muted-foreground flex items-center gap-3 text-xs font-bold">
          <span className="bg-border h-px flex-1" />
          OR ENTER MANUALLY
          <span className="bg-border h-px flex-1" />
        </div>

        <label className="flex max-w-xs flex-col gap-1.5 text-sm">
          <span className="text-foreground font-semibold">
            PAN number<span className="text-danger ml-0.5">*</span>
          </span>
          <input
            value={pan}
            maxLength={10}
            onChange={(e) => setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="ABCDE1234F"
            className="input-interactive field-input h-12 rounded-xl px-3.5 text-base font-bold tracking-[0.15em]"
          />
          <span className="text-muted-foreground text-xs">10-character alphanumeric code printed on your PAN card</span>
        </label>

        <label className="bg-accent flex items-start gap-3 rounded-xl p-4">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required className="accent-primary mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex items-start gap-2 text-xs">
            <Lock className="text-primary mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="text-muted-foreground">
              I authorize SwiftLoan and its RBI-registered lending partners to verify my PAN and fetch my credit report — this is
              a <strong className="text-foreground">soft check</strong> and won&apos;t affect my credit score. Read our{' '}
              <a href="/privacypolicy" className="text-primary font-semibold underline">Privacy Policy</a>.
            </span>
          </span>
        </label>
      </Card>

      <div className="text-muted-foreground mt-4 flex items-center gap-2 text-xs">
        <ShieldCheck className="text-mint h-4 w-4 shrink-0" />
        Bank-grade encryption — your PAN is never shared without your consent
      </div>

      {error && <p className="text-danger mt-3 text-sm font-semibold">{error}</p>}
      {!valid && !error && (
        <p className="text-muted-foreground mt-3 text-xs">
          <span className="text-danger font-semibold">Required to continue:</span> {missing.join(' and ')}.
        </p>
      )}

      <BottomBar meta="Step 1 of 3 · ~3 min left">
        <button
          onClick={submit}
          disabled={!valid || loading}
          className={`rounded-full px-6 py-3 text-sm font-bold transition-all ${
            !valid || loading
              ? 'bg-muted text-muted-foreground'
              : 'bg-brand-gradient text-primary-foreground shadow-[var(--shadow-soft)] hover:-translate-y-0.5'
          }`}
        >
          {loading ? 'Verifying…' : 'Verify PAN & continue →'}
        </button>
      </BottomBar>
    </ApplyShell>
  );
}
