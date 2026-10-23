'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { ApplyShell } from '@/components/apply/ApplyShell';
import { Badge, Card, SectionLabel } from '@/components/apply/primitives';
import { fmtINR } from '@/lib/core';
import { useApply } from '@/lib/applyContext';
import { useAccountUser } from '@/hooks/useAccountUser';
import { handoff } from '@/lib/applyApi';
import { useCopy } from '@/lib/i18n';
import { applyFlowCopy } from '@/i18n/apply-flow';

export default function ConfirmPage() {
  const router = useRouter();
  const t = useCopy(applyFlowCopy).confirm;
  const { applicationId, selectedOffer, sessionReady } = useApply();
  const accountUser = useAccountUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for ApplyProvider to sync in from sessionStorage before judging
    // these missing — see applyContext.tsx.
    if (!sessionReady) return;
    if (!applicationId || !selectedOffer) router.replace('/apply/offers');
  }, [sessionReady, applicationId, selectedOffer, router]);

  if (!applicationId || !selectedOffer) return null;
  const lenderName = selectedOffer.lenderName || t.lenderFallback;

  const confirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await handoff(applicationId);
      router.push('/apply/success');
    } catch (e) {
      setError(e instanceof Error ? e.message : t.handoffFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ApplyShell backHref="/apply/offers" stepLabel={t.stepLabel} accountUser={accountUser}>
      <div className="flex flex-col gap-5">
        <Badge tone="warning">{t.fallbackBadge}</Badge>
        <div>
          <h1 className="text-2xl font-extrabold">{t.title}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{t.review(lenderName)}</p>
        </div>

        <Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric k={t.loanAmount} v={fmtINR(selectedOffer.amount)} />
            <Metric k={t.apr} v={`${selectedOffer.apr}%`} />
            <Metric k={t.tenure} v={t.tenureValue(selectedOffer.tenureMonths)} />
            <Metric k={t.monthlyEmi} v={selectedOffer.emi > 0 ? fmtINR(selectedOffer.emi) : '—'} />
          </div>
        </Card>

        <div>
          <SectionLabel>{t.disclosureLabel}</SectionLabel>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t.disclosureA}
            <strong className="text-foreground">{t.disclosureStrong}</strong>{t.disclosureB(lenderName)}
          </p>
        </div>

        <div>
          <SectionLabel>{t.shareLabel(lenderName)}</SectionLabel>
          <div className="flex flex-col gap-2">
            {t.docs.map((d) => (
              <div key={d} className="flex items-center gap-2.5 text-sm">
                <Check className="text-mint h-4 w-4 shrink-0" />
                {d}
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-danger text-sm font-semibold">{error}</p>}

        <button
          onClick={confirm}
          disabled={loading}
          data-voice-gate="confirm-loan"
          className="bg-brand-gradient text-primary-foreground w-full rounded-full py-3.5 text-base font-bold"
        >
          {loading ? t.confirming : t.confirmCta}
        </button>
      </div>
    </ApplyShell>
  );
}

function Metric({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-muted rounded-lg px-3 py-2">
      <div className="text-muted-foreground text-[10px] font-bold uppercase">{k}</div>
      <div className="text-foreground mt-0.5 text-sm font-extrabold">{v}</div>
    </div>
  );
}
