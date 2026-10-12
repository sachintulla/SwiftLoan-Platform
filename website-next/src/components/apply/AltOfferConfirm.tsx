'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCopy } from '@/lib/i18n';
import { altOffersCopy } from '@/i18n/apply-altoffers';

/**
 * "Did you proceed with an offer?" — asked when the visitor has been on the
 * partner's journey and comes back. Esc / backdrop = "Not yet".
 */
export function AltOfferConfirm({
  open,
  onAnswer,
}: {
  open: boolean;
  onAnswer: (proceeded: boolean) => void;
}) {
  const t = useCopy(altOffersCopy);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onAnswer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onAnswer]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4"
      onClick={() => onAnswer(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="alt-confirm-title"
        className="bg-card w-full max-w-sm rounded-3xl p-6 shadow-[var(--shadow-float)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="alt-confirm-title" className="text-lg font-extrabold">{t.confirmTitle}</h2>
        <p className="text-muted-foreground mt-2 text-sm">{t.confirmBody}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            onClick={() => onAnswer(true)}
            data-testid="alt-confirm-yes"
            className="bg-brand-gradient text-primary-foreground w-full rounded-full px-5 py-3 text-sm font-bold"
          >
            {t.confirmYes}
          </button>
          <button
            onClick={() => onAnswer(false)}
            data-testid="alt-confirm-no"
            className="border-border w-full rounded-full border px-5 py-3 text-sm font-bold"
          >
            {t.confirmNo}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
