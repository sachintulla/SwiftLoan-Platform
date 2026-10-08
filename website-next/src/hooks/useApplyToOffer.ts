'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApply } from '@/lib/applyContext';
import { applyOffer, type Offer } from '@/lib/applyApi';
import { useCopy } from '@/lib/i18n';
import { applyShellCopy } from '@/i18n/apply-shell';

/**
 * Apply to one of the application's offers — the single path both the
 * offers list and the compare view use: records the per-lender application,
 * remembers the chosen offer, then continues on the lender's own page (or
 * the confirm step when the offer has no redirection URL).
 */
export function useApplyToOffer() {
  const router = useRouter();
  const t = useCopy(applyShellCopy);
  const { applicationId, setSelectedOffer } = useApply();
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = async (offer: Offer) => {
    if (!applicationId || applyingId) return;
    setApplyingId(offer.id);
    setError(null);
    try {
      await applyOffer(applicationId, offer.id);
      setSelectedOffer({
        id: offer.id,
        lenderName: offer.lenderName ?? offer.partner?.name ?? null,
        redirectionUrl: offer.redirectionUrl,
        amount: offer.amount,
        apr: offer.apr,
        emi: offer.emi,
        tenureMonths: offer.tenureMonths,
      });
      router.push(offer.redirectionUrl ? '/apply/lender' : '/apply/confirm');
    } catch (e) {
      setError(e instanceof Error ? e.message : t.applyFailed);
      setApplyingId(null);
    }
  };

  return { apply, applyingId, error, setError };
}
