'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { useCopy } from '@/lib/i18n';
import { applyShellCopy } from '@/i18n/apply-shell';
import { LenderLogo } from './LenderLogo';

/**
 * "You are about to apply with <lender>" pop-up, shown after Apply now and BEFORE anything is sent to the
 * lender. One instance is mounted in the apply layout; `confirmApply()` opens it from the shared
 * useApplyToOffer hook and resolves true on Proceed, false on Cancel / close / Escape / a click outside.
 */
export interface ApplyConfirmRequest {
  lenderName: string;
  logoUrl?: string | null;
}

type Pending = ApplyConfirmRequest & { resolve: (ok: boolean) => void };

let pending: Pending | null = null;
let listener: ((p: Pending | null) => void) | null = null;

/** Ask the visitor to confirm. With no pop-up mounted it resolves true (the apply goes ahead as before). */
export function confirmApply(req: ApplyConfirmRequest): Promise<boolean> {
  if (!listener) return Promise.resolve(true);
  pending?.resolve(false);
  return new Promise<boolean>((resolve) => {
    pending = { ...req, resolve };
    listener?.(pending);
  });
}

export function ApplyConfirm() {
  const t = useCopy(applyShellCopy);
  const [req, setReq] = useState<Pending | null>(null);

  useEffect(() => {
    listener = setReq;
    return () => {
      listener = null;
      pending?.resolve(false);
      pending = null;
    };
  }, []);

  const finish = useCallback((ok: boolean) => {
    const p = pending;
    pending = null;
    setReq(null);
    p?.resolve(ok);
  }, []);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req, finish]);

  if (!req) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="apply-confirm-title"
      onClick={() => finish(false)}
    >
      <div
        className="bg-card relative flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl p-6 pt-8 text-center shadow-[var(--shadow-float)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => finish(false)}
          aria-label={t.cancel}
          className="text-muted-foreground absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-full"
        >
          <X className="h-4 w-4" />
        </button>

        <LenderLogo name={req.lenderName} logoUrl={req.logoUrl} size={72} />

        <div>
          <h2 id="apply-confirm-title" className="text-lg font-extrabold">{req.lenderName}</h2>
          <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{t.applyConfirmBody(req.lenderName)}</p>
        </div>

        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => finish(true)}
            className="bg-brand-gradient text-primary-foreground inline-flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-sm font-bold shadow-[var(--shadow-soft)]"
          >
            {t.applyConfirmProceed}
            <ArrowRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => finish(false)} className="text-muted-foreground w-full rounded-full py-2.5 text-sm font-bold">
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
