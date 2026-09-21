'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApplyShell } from '@/components/apply/ApplyShell';
import { PrimaryButton } from '@/components/apply/primitives';
import { useApply } from '@/lib/applyContext';
import { requestOtp, verifyOtp } from '@/lib/session';

const RESEND_SECONDS = 29;

export default function VerifyOtpPage() {
  const router = useRouter();
  const { phone, sessionReady, setApplicationId } = useApply();
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Wait for ApplyProvider's own mount effect to sync `phone` in from
    // sessionStorage before judging it missing — otherwise this fires on the
    // very first render (still the SSR-safe default) and bounces a visitor
    // who actually has a phone stored, before it's had a chance to load.
    if (!sessionReady) return;
    if (!phone) router.replace('/apply');
  }, [sessionReady, phone, router]);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [seconds]);

  const code = digits.join('');

  const setDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, '').slice(-1);
    // Functional update: a fast sequence of keystrokes (or an OS-level autofill)
    // can fire several onChange events before React commits the first one —
    // reading `digits` from the closure dropped every digit but the last.
    setDigits((prev) => {
      const next = [...prev];
      next[i] = clean;
      return next;
    });
    if (clean && i < 5) inputs.current[i + 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    setDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? next[i] ?? '';
      return next;
    });
    inputs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  const submit = async () => {
    if (code.length !== 6 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await verifyOtp(phone, code);
      setApplicationId(result.applicationId);
      // replace, not push: once verified, this OTP screen is a spent
      // one-time gate — it can't be meaningfully "gone back to" (there's
      // nothing to re-verify), so it shouldn't stay in browser history.
      // With push, the browser's own Back button (not just the in-app one)
      // landed a just-verified visitor straight back on the OTP entry form.
      router.replace(result.hasApplication ? '/account' : '/apply/step-1');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid or expired code.');
      setDigits(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (seconds > 0) return;
    setSeconds(RESEND_SECONDS);
    setError(null);
    try {
      await requestOtp(phone);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resend OTP.');
    }
  };

  return (
    <ApplyShell backHref="/apply" backLabel="Edit number" stepLabel="Verify OTP" progressPct={12} center>
      <div className="flex flex-col items-center gap-6">
        <div>
          <h1 className="text-2xl font-extrabold">Verify your number</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            We&apos;ve sent a 6-digit code to <strong className="text-foreground">+91 {phone}</strong>
          </p>
        </div>

        <div className="flex gap-2.5">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              onPaste={onPaste}
              inputMode="numeric"
              maxLength={1}
              className={`input-interactive field-input h-14 w-12 rounded-xl text-center text-xl font-bold ${d ? 'border-primary bg-accent' : ''}`}
            />
          ))}
        </div>

        {error && <p className="text-danger text-xs font-semibold">{error}</p>}

        <span className="bg-warning-soft text-warning rounded-full px-3 py-1.5 text-xs font-bold">
          {seconds > 0 ? `⏱ Resend OTP in 0:${String(seconds).padStart(2, '0')}` : (
            <button onClick={resend} className="underline">Resend OTP</button>
          )}
        </span>

        <div className="w-full max-w-xs">
          <PrimaryButton onClick={submit} disabled={code.length !== 6} loading={loading}>
            Verify &amp; Continue
          </PrimaryButton>
        </div>
      </div>
    </ApplyShell>
  );
}
