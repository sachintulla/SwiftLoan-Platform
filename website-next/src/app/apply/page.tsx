'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { ApplyShell } from '@/components/apply/ApplyShell';
import { PrimaryButton } from '@/components/apply/primitives';
import { useApply } from '@/lib/applyContext';
import { fetchMe } from '@/lib/applyApi';
import { bootstrapSession, requestOtp } from '@/lib/session';
import { useCopy } from '@/lib/i18n';
import { applyFlowCopy } from '@/i18n/apply-flow';

const PHONE_RE = /^[6-9]\d{9}$/;

export default function ApplyPhonePage() {
  const router = useRouter();
  const t = useCopy(applyFlowCopy).phone;
  const { setPhone, setApplicationId } = useApply();
  // True until we know whether a live login session already exists. Held so a
  // signed-in visitor never sees the phone form flash before being redirected.
  const [checking, setChecking] = useState(true);
  const [value, setValue] = useState('');
  // Must be an explicit opt-in, never pre-checked — same reasoning as the
  // Step 1 PAN-consent checkbox.
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Already signed in (the httpOnly refresh cookie is still valid)? Skip the
  // phone + OTP gate entirely and go where a fresh login would have landed.
  // `replace`, so Back from the dashboard doesn't bounce through this page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (await bootstrapSession()) {
          const body = await fetchMe();
          if (cancelled) return;
          setApplicationId(body.data.applicationId ?? null);
          router.replace(body.data.hasApplication ? '/account' : '/apply/step-1');
          return;
        }
      } catch {
        /* session unusable — fall through to the normal phone form */
      }
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const valid = PHONE_RE.test(value) && terms;

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      await requestOtp(value);
      setPhone(value);
      router.push('/apply/verify');
    } catch (e) {
      setError(e instanceof Error ? e.message : t.sendFailed);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <ApplyShell stepLabel={t.stepLabel} center>
        <div className="text-muted-foreground py-16 text-center text-sm" aria-busy="true">{t.loading}</div>
      </ApplyShell>
    );
  }

  return (
    <ApplyShell stepLabel={t.stepLabel} center>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-extrabold">{t.title}</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {t.subtitle}
          </p>
        </div>

        <div className="border-border rounded-2xl border bg-card p-5 text-left shadow-[var(--shadow-soft)]">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-foreground font-semibold">{t.mobileLabel}</span>
            <div className="input-interactive flex h-11 items-center gap-2 rounded-xl px-3.5">
              <span className="text-muted-foreground text-sm font-semibold">+91</span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={10}
                placeholder="98765 43210"
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 10))}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                className="field-input h-full w-full bg-transparent text-sm font-medium outline-none"
              />
            </div>
          </label>

          <label className="bg-muted mt-4 flex items-start gap-3 rounded-xl p-3.5 text-xs">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required className="accent-primary mt-0.5 h-5 w-5 shrink-0" />
            <span className="text-muted-foreground">
              {t.termsA}<a className="text-primary font-semibold underline">{t.termsLink}</a>{t.termsAnd}
              <a href="/privacypolicy" className="text-primary font-semibold underline">{t.privacyLink}</a>{t.termsB}
            </span>
          </label>

          {error && <p className="text-danger mt-3 text-xs font-semibold">{error}</p>}

          <div className="mt-4">
            <PrimaryButton onClick={submit} disabled={!valid} loading={loading}>
              {t.sendOtp}
            </PrimaryButton>
          </div>
          <p className="text-muted-foreground mt-3 flex items-center justify-center gap-1 text-center text-[11px]">
            <Lock className="h-3 w-3" /> {t.noSpam}
          </p>
        </div>
      </div>
    </ApplyShell>
  );
}
