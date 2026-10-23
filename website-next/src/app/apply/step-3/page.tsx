'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, MapPin } from 'lucide-react';
import { ApplyShell, Stepper, BottomBar } from '@/components/apply/ApplyShell';
import { Card, Field, TextInput, ChipGroup } from '@/components/apply/primitives';
import { patchProfile } from '@/lib/applyApi';
import { loadPanHandoff } from '@/lib/panPrefill';
import { useAccountUser } from '@/hooks/useAccountUser';
import { useCopy } from '@/lib/i18n';
import { applyFlowCopy } from '@/i18n/apply-flow';

const MARITAL = ['Single', 'Married', 'Other'];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');

export default function Step3MoreDetailsPage() {
  const router = useRouter();
  const t = useCopy(applyFlowCopy).more;
  const accountUser = useAccountUser();
  const [marital, setMarital] = useState(MARITAL[0]!);
  const [altMobile, setAltMobile] = useState('');
  const [altEmail, setAltEmail] = useState('');
  const [landmark, setLandmark] = useState('');
  const [district, setDistrict] = useState('');
  const [obligations, setObligations] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // District from the Step 1 PAN lookup, when it had one.
  useEffect(() => {
    const p = loadPanHandoff()?.prefill;
    if (p?.district) setDistrict((cur) => cur || p.district!);
  }, []);

  const save = async () => {
    const patch: Record<string, unknown> = { maritalStatus: slug(marital) };
    if (altMobile) patch.alternateMobile = altMobile;
    if (altEmail) patch.alternateEmail = altEmail;
    if (landmark) patch.landmark = landmark;
    if (district) patch.district = district;
    if (obligations) patch.monthlyObligations = Number(obligations);
    await patchProfile(patch);
  };

  const continueNext = async () => {
    setLoading(true);
    setError(null);
    try {
      await save();
      router.push('/apply/finding');
    } catch (e) {
      setError(e instanceof Error ? e.message : t.saveFailed);
      router.push('/apply/finding');
    } finally {
      setLoading(false);
    }
  };

  const skip = () => router.push('/apply/finding');

  return (
    <ApplyShell backHref="/apply/step-2" stepLabel={t.stepLabel} progressPct={74} accountUser={accountUser}>
      <Stepper step={3} />
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-extrabold">{t.title}</h1>
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-bold">{t.optionalBadge}</span>
      </div>
      <p className="text-muted-foreground mt-2 mb-6 text-sm">
        {t.subtitle}
      </p>

      <div className="flex flex-col gap-5">
        <Card className="sm:p-7">
          <SectionHead icon={Heart} label={t.personal} />
          <Field label={t.maritalStatus}><ChipGroup options={MARITAL} value={marital} onChange={setMarital} renderLabel={(o) => t.marital[o] ?? o} /></Field>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t.altMobile}><TextInput inputMode="numeric" maxLength={10} value={altMobile} onChange={(e) => setAltMobile(e.target.value.replace(/\D/g, ''))} placeholder={t.optional} /></Field>
            <Field label={t.altEmail}><TextInput type="email" value={altEmail} onChange={(e) => setAltEmail(e.target.value)} placeholder={t.optional} /></Field>
          </div>
        </Card>

        <Card className="sm:p-7">
          <SectionHead icon={MapPin} label={t.address} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t.landmark}><TextInput value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder={t.optional} /></Field>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t.district}><TextInput value={district} onChange={(e) => setDistrict(e.target.value)} placeholder={t.optional} /></Field>
            <Field label={t.obligations}><TextInput inputMode="numeric" value={obligations} onChange={(e) => setObligations(e.target.value.replace(/\D/g, ''))} placeholder={t.optional} /></Field>
          </div>
        </Card>

        {error && <p className="text-danger text-sm font-semibold">{error}</p>}
      </div>

      <BottomBar meta={t.meta}>
        <button onClick={skip} data-voice-gate="skip-step" className="border-border bg-card text-foreground rounded-full border px-6 py-3 text-sm font-bold">
          {t.skip}
        </button>
        <button
          onClick={continueNext}
          disabled={loading}
          className="bg-brand-gradient text-primary-foreground shadow-[var(--shadow-soft)] rounded-full px-6 py-3 text-sm font-bold transition-all hover:-translate-y-0.5"
        >
          {loading ? t.saving : t.seeOffers}
        </button>
      </BottomBar>
    </ApplyShell>
  );
}

function SectionHead({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="mb-5 flex items-center gap-2.5">
      <span className="bg-accent grid h-9 w-9 shrink-0 place-items-center rounded-xl">
        <Icon className="text-primary h-4 w-4" />
      </span>
      <p className="text-primary text-xs font-bold tracking-wide uppercase">{label}</p>
    </div>
  );
}
