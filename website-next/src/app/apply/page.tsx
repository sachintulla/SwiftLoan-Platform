'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { ApplyShell } from '@/components/apply/ApplyShell';
import { PrimaryButton } from '@/components/apply/primitives';
import { useApply } from '@/lib/applyContext';
import { requestOtp } from '@/lib/session';

const PHONE_RE = /^[6-9]\d{9}$/;

export default function ApplyPhonePage() {
  const router = useRouter();
  const { setPhone } = useApply();
  const [value, setValue] = useState('');
  // Must be an explicit opt-in, never pre-checked — same reasoning as the
  // Step 3 PAN-consent checkbox.
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      setError(e instanceof Error ? e.message : 'Could not send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ApplyShell stepLabel="Get started" center>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-extrabold">Let&apos;s get you funded</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Enter your mobile number — we&apos;ll send a one-time code to verify it&apos;s you.
          </p>
        </div>

        <div className="border-border rounded-2xl border bg-card p-5 text-left shadow-[var(--shadow-soft)]">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-foreground font-semibold">Mobile number</span>
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
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required className="accent-primary mt-0.5" />
            <span className="text-muted-foreground">
              I agree to SwiftLoan&apos;s <a className="text-primary font-semibold underline">Terms of Service</a> and{' '}
              <a href="/privacypolicy" className="text-primary font-semibold underline">Privacy Policy</a>, and consent to being
              contacted about my loan application.
            </span>
          </label>

          {error && <p className="text-danger mt-3 text-xs font-semibold">{error}</p>}

          <div className="mt-4">
            <PrimaryButton onClick={submit} disabled={!valid} loading={loading}>
              Send OTP
            </PrimaryButton>
          </div>
          <p className="text-muted-foreground mt-3 flex items-center justify-center gap-1 text-center text-[11px]">
            <Lock className="h-3 w-3" /> We never share your number or make spam calls.
          </p>
        </div>
      </div>
    </ApplyShell>
  );
}
