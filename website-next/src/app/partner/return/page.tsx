'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApplyShell } from '@/components/apply/ApplyShell';
import { PrimaryButton, SecondaryButton } from '@/components/apply/primitives';
import { useAccountUser } from '@/hooks/useAccountUser';
import { useApply } from '@/lib/applyContext';
import { markAltOfferApplied } from '@/lib/altOffers';
import { PENDING_KEY, parsePending } from '@/lib/altOfferLogic';
import { useCopy } from '@/lib/i18n';
import { altOffersCopy } from '@/i18n/apply-altoffers';

/**
 * Where the partner (YMPL) sends the applicant back to after their journey
 * (server YUBI_RETURN_URL → https://swiftloan.ai/partner/return). The page asks
 * whether they proceeded, so the application is recorded in My Applications
 * exactly as the app records the "Proceed" tap.
 */
export default function PartnerReturnPage() {
  const router = useRouter();
  const t = useCopy(altOffersCopy);
  const accountUser = useAccountUser();
  const { applicationId } = useApply();
  const [state, setState] = useState<'ask' | 'saving' | 'added'>('ask');
  // Inside the "Explore lenders" tab's iframe: don't render a nested shell — tell the page
  // that embeds us the visitor is back, and it asks "did you proceed?" in its own UI.
  // 'unknown' until mounted, so the shell never flashes inside the frame before we know.
  const [frame, setFrame] = useState<'unknown' | 'frame' | 'top'>('unknown');
  useEffect(() => {
    if (window.self !== window.top) {
      setFrame('frame');
      window.parent.postMessage({ type: 'sl-alt-return' }, window.location.origin);
    } else {
      setFrame('top');
    }
  }, []);

  const answer = async (proceeded: boolean) => {
    let pending = null;
    try {
      pending = parsePending(sessionStorage.getItem(PENDING_KEY));
      sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
    if (!proceeded) return router.push('/apply/offers');
    // The tab we opened remembers which application; if the visitor landed here in a
    // fresh tab, fall back to the application this session is working on.
    const target = pending?.applicationId ?? applicationId;
    if (!target) return router.push('/account');
    setState('saving');
    const r = await markAltOfferApplied(target).catch(() => null);
    setState(r?.applied ? 'added' : 'ask');
    if (!r?.applied) router.push('/account');
  };

  if (frame !== 'top') {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center" aria-busy="true">
        <p className="text-muted-foreground text-sm font-semibold">{frame === 'frame' ? t.returning : ''}</p>
      </div>
    );
  }

  return (
    <ApplyShell center accountUser={accountUser}>
      <h1 className="text-xl font-extrabold">{t.returnTitle}</h1>
      {state === 'added' ? (
        <>
          <p className="text-muted-foreground mt-2 mb-6 text-sm" role="status">{t.added}</p>
          <PrimaryButton onClick={() => router.push('/account')}>{t.returnGo}</PrimaryButton>
        </>
      ) : (
        <>
          <p className="text-muted-foreground mt-2 mb-6 text-sm">{t.returnBody}</p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <PrimaryButton onClick={() => answer(true)} disabled={state === 'saving'}>{t.returnYes}</PrimaryButton>
            <SecondaryButton onClick={() => answer(false)} disabled={state === 'saving'}>{t.returnNo}</SecondaryButton>
          </div>
        </>
      )}
    </ApplyShell>
  );
}
