'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, User, MapPin, Briefcase, BadgeCheck, ShieldCheck } from 'lucide-react';
import { ApplyShell, Stepper, BottomBar } from '@/components/apply/ApplyShell';
import { Card, Field, TextInput, ChipGroup } from '@/components/apply/primitives';
import { Slider } from '@/components/ui/slider';
import { fmtINR } from '@/lib/core';
import { useApply } from '@/lib/applyContext';
import { useAccountUser } from '@/hooks/useAccountUser';
import { patchProfile, createApplication, fetchMe, getApplication, patchApplication, type PanPrefill } from '@/lib/applyApi';
import { loadDraft, saveDraft } from '@/lib/applyDraft';
import { loadPanHandoff, type PanHandoff } from '@/lib/panPrefill';
import { useCopy } from '@/lib/i18n';
import { applyDetailsCopy } from '@/i18n/apply-details';

const PURPOSES = ['Personal use', 'Working capital', 'Medical', 'Education', 'Home renovation', 'Travel', 'Other'];
const GENDERS = ['Male', 'Female', 'Other'];
const QUALIFICATIONS = ['Graduate', 'Post-Graduate', 'Diploma', '12th Pass', 'Other'];
const RESIDENCE = ['Own', 'Rented', 'Family', 'Company'];
const EMPLOYMENT = ['Salaried', 'Self-employed', 'Business owner', 'Gig worker', 'Student', 'Retired', 'Other'];
const SALARY_MODE = ['Bank transfer', 'Cheque', 'Cash'];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
/** Reverse of slug() for the fixed chip sets above — turns the server's enum
 *  value (e.g. "self_employed") back into the exact label the chip renders. */
function unslug(options: string[], value: string | null | undefined): string | null {
  if (!value) return null;
  return options.find((o) => slug(o) === value) ?? null;
}

export default function Step2BasicsPage() {
  const router = useRouter();
  const t = useCopy(applyDetailsCopy);
  const accountUser = useAccountUser();
  const { phone, applicationId, setApplicationId } = useApply();
  // Plain SSR-safe defaults — matches what the server renders. localStorage
  // only exists on the client, so reading it here (or at module scope) would
  // make the client's first render disagree with the server-rendered HTML and
  // React would throw a hydration-mismatch error. The draft is applied below,
  // inside the effect, which only ever runs on the client after hydration.
  const [amount, setAmount] = useState(325000);
  const [purpose, setPurpose] = useState(PURPOSES[0]!);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState(GENDERS[0]!);
  const [qualification, setQualification] = useState(QUALIFICATIONS[0]!);
  const [email, setEmail] = useState('');
  const [pincode, setPincode] = useState('');
  const [addr1, setAddr1] = useState('');
  const [addr2, setAddr2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [residence, setResidence] = useState(RESIDENCE[0]!);
  const [employment, setEmployment] = useState(EMPLOYMENT[0]!);
  const [income, setIncome] = useState('');
  const [company, setCompany] = useState('');
  const [salaryMode, setSalaryMode] = useState(SALARY_MODE[0]!);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Avoids re-querying the same pincode on every re-render/keystroke
  // elsewhere on the page.
  const lastLookedUpPinRef = useRef<string | null>(null);
  // The PAN verified on Step 1 — attached to the application created here.
  const panRef = useRef<string | null>(null);
  const [fromPan, setFromPan] = useState(false);
  // Shown as the "PAN verified" confirmation card at the top.
  const [panInfo, setPanInfo] = useState<PanHandoff | null>(null);

  // `phone` and `applicationId` start empty/null (SSR-safe) and are synced in
  // from sessionStorage by ApplyProvider's own mount effect a tick after this
  // one — so their loaders are separate effects keyed on the value itself,
  // not folded into the one-time effect below, or they'd silently run once
  // with the not-yet-synced default and never get a second chance.
  useEffect(() => {
    if (!phone) return;
    const draft = loadDraft(phone);
    if (draft.amount != null) setAmount(draft.amount);
    if (draft.purpose) setPurpose(draft.purpose);
    if (draft.firstName) setFirstName(draft.firstName);
    if (draft.lastName) setLastName(draft.lastName);
    if (draft.dob) setDob(draft.dob);
    if (draft.gender) setGender(draft.gender);
    if (draft.qualification) setQualification(draft.qualification);
    if (draft.email) setEmail(draft.email);
    if (draft.pincode) setPincode(draft.pincode);
    if (draft.addr1) setAddr1(draft.addr1);
    if (draft.addr2) setAddr2(draft.addr2);
    if (draft.city) setCity(draft.city);
    if (draft.state) setState(draft.state);
    if (draft.residence) setResidence(draft.residence);
    if (draft.employment) setEmployment(draft.employment);
    if (draft.income) setIncome(draft.income);
    if (draft.company) setCompany(draft.company);
    if (draft.salaryMode) setSalaryMode(draft.salaryMode);
  }, [phone]);

  useEffect(() => {
    if (!applicationId) return;
    getApplication(applicationId)
      .then((app) => setAmount(app.amount))
      .catch(() => {});
  }, [applicationId]);

  // Revisiting this step (e.g. "Update details" from the empty-offers
  // screen): the server profile is authoritative, but only overwrite fields
  // it actually has a value for, so an in-progress edit (or the draft applied
  // above) is never clobbered with null. Independent of phone/applicationId —
  // runs once, keyed off the access token already held in memory.
  //
  // Then the PAN Comprehensive details from Step 1 go on top: they're the
  // verified identity, so name/DOB/gender/address from the PAN win over older
  // profile values. Only fields the PAN actually returned are touched.
  useEffect(() => {
    const handoff = loadPanHandoff();
    const applyPan = (p: PanPrefill) => {
      let any = false;
      const put = (v: string | undefined, set: (x: string) => void) => { if (v) { set(v); any = true; } };
      put(p.firstName, setFirstName);
      put(p.lastName, setLastName);
      put(p.dob, setDob);
      put(p.gender ? unslug(GENDERS, p.gender) ?? undefined : undefined, setGender);
      put(p.email, setEmail);
      put(p.pincode, setPincode);
      put(p.addressLine1, setAddr1);
      put(p.addressLine2, setAddr2);
      put(p.city, setCity);
      put(p.state, setState);
      if (any) setFromPan(true);
      if (handoff) setPanInfo(handoff);
    };
    // PAN comes first now — without a verified one, start from Step 1.
    const requirePan = (profilePan?: string | null) => {
      panRef.current = handoff?.pan || profilePan || null;
      if (!panRef.current) router.replace('/apply/step-1');
    };
    fetchMe()
      .then((res) => {
        const user = res?.data?.user;
        requirePan(user?.panNumber);
        if (!user) { if (handoff) applyPan(handoff.prefill); return; }
        if (user.firstName) setFirstName(user.firstName);
        if (user.lastName) setLastName(user.lastName);
        if (user.dob) setDob(String(user.dob).slice(0, 10));
        const g = unslug(GENDERS, user.gender);
        if (g) setGender(g);
        if (user.qualification) setQualification(user.qualification);
        if (user.email) setEmail(user.email);
        if (user.pincode) setPincode(user.pincode);
        if (user.addressLine1) setAddr1(user.addressLine1);
        if (user.addressLine2) setAddr2(user.addressLine2);
        if (user.city) setCity(user.city);
        if (user.state) setState(user.state);
        const r = unslug(RESIDENCE, user.residenceType);
        if (r) setResidence(r);
        const e = unslug(EMPLOYMENT, user.employment);
        if (e) setEmployment(e);
        if (user.monthlyIncome != null) setIncome(String(user.monthlyIncome));
        if (user.company) setCompany(user.company);
        if (user.loanPurpose) setPurpose(user.loanPurpose);
        if (user.salaryMode) setSalaryMode(user.salaryMode);
        if (handoff) applyPan(handoff.prefill);
      })
      .catch(() => {
        /* not logged in yet, or offline — the draft/defaults above still render */
        requirePan(null);
        if (handoff) applyPan(handoff.prefill);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fill city/state from the pincode once it's a complete 6-digit code,
  // via India Post's public Pincode API (free, no key). Best-effort only —
  // an unmatched/invalid pincode or a network hiccup must never block typing
  // or show an error; the user can still fill city/state by hand either way.
  useEffect(() => {
    if (pincode.length !== 6 || pincode === lastLookedUpPinRef.current) return;
    lastLookedUpPinRef.current = pincode;
    let cancelled = false;
    (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, { signal: controller.signal });
        clearTimeout(timer);
        const json = await res.json();
        const po = json?.[0]?.PostOffice?.[0];
        if (cancelled || !po) return;
        if (po.District) setCity(po.District);
        if (po.State) setState(po.State);
      } catch {
        // Silently ignore — city/state stay editable by hand.
      }
    })();
    return () => { cancelled = true; };
  }, [pincode]);

  const missing: string[] = [];
  if (!firstName.trim()) missing.push(t.missing.firstName);
  if (!lastName.trim()) missing.push(t.missing.lastName);
  if (!dob) missing.push(t.missing.dob);
  if (!/^\S+@\S+\.\S+$/.test(email)) missing.push(t.missing.email);
  if (!/^\d{6}$/.test(pincode)) missing.push(t.missing.pincode);
  if (!addr1.trim()) missing.push(t.missing.addr1);
  if (!city.trim()) missing.push(t.missing.city);
  if (!state.trim()) missing.push(t.missing.state);
  if (!/^\d+$/.test(income)) missing.push(t.missing.income);
  const valid = missing.length === 0;

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      await patchProfile({
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`.trim(),
        email,
        dob: new Date(dob).toISOString(),
        gender: slug(gender),
        pincode,
        addressLine1: addr1,
        ...(addr2.trim() ? { addressLine2: addr2.trim() } : {}),
        city,
        state,
        residenceType: slug(residence),
        employment: slug(employment),
        monthlyIncome: Number(income),
        company,
        qualification,
        loanPurpose: purpose,
        salaryMode,
      });
      const application = await createApplication({
        amount,
        purpose,
        employment: slug(employment),
        monthlyIncome: Number(income),
        residenceType: slug(residence),
      });
      setApplicationId(application.id);
      // Attach the Step 1 PAN (sets status pan_pending, as the old Step 3 did).
      if (panRef.current) await patchApplication(application.id, { panNumber: panRef.current });
      if (phone) {
        saveDraft(phone, {
          amount, purpose, firstName, lastName, dob, gender, qualification, email, pincode,
          addr1, addr2, city, state, residence, employment, income, company, salaryMode,
        });
      }
      router.push('/apply/step-3');
    } catch (e) {
      setError(e instanceof Error ? e.message : t.saveFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ApplyShell backHref="/apply/step-1" stepLabel={t.stepLabel} progressPct={52} accountUser={accountUser}>
      <Stepper step={2} />
      <h1 className="text-2xl font-extrabold">{t.title}</h1>
      <p className="text-muted-foreground mt-2 mb-6 text-sm">
        {t.subtitle}
      </p>
      {panInfo && <PanConfirmation info={panInfo} prefilled={fromPan} />}

      <div className="flex flex-col gap-5">
        <Card className="sm:p-7">
          <SectionHead icon={Wallet} label={t.secLoanAmount} />
          <div className="bg-accent rounded-2xl p-5">
            <div className="text-primary text-3xl font-extrabold">{fmtINR(amount)}</div>
            <Slider className="mt-4" aria-label={t.loanAmountAria} min={25000} max={1500000} step={25000} value={[amount]} onValueChange={([v]) => v != null && setAmount(v)} />
            <div className="text-muted-foreground mt-2 flex justify-between text-xs font-bold">
              <span>{fmtINR(25000)}</span>
              <span>{fmtINR(1500000)}</span>
            </div>
          </div>
          <p className="text-foreground mt-5 mb-3 text-sm font-semibold">{t.purposeQuestion}</p>
          <ChipGroup label={t.purposeQuestion} options={PURPOSES} value={purpose} renderLabel={(o) => t.options[o] ?? o} onChange={setPurpose} />
        </Card>

        <Card className="sm:p-7">
          <SectionHead icon={User} label={t.secAboutYou} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t.firstName} required><TextInput value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" /></Field>
            <Field label={t.lastName} required><TextInput value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" /></Field>
            <Field label={t.dob} required><TextInput type="date" value={dob} onChange={(e) => setDob(e.target.value)} autoComplete="bday" /></Field>
            <Field label={t.gender}><ChipGroup options={GENDERS} value={gender} renderLabel={(o) => t.options[o] ?? o} onChange={setGender} /></Field>
          </div>
          <div className="mt-4">
            <Field label={t.qualification}><ChipGroup options={QUALIFICATIONS} value={qualification} renderLabel={(o) => t.options[o] ?? o} onChange={setQualification} /></Field>
          </div>
        </Card>

        <Card className="sm:p-7">
          <SectionHead icon={MapPin} label={t.secContact} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t.email} required><TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
            <Field label={t.pincode} required><TextInput inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))} autoComplete="postal-code" /></Field>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t.addr1} required><TextInput value={addr1} onChange={(e) => setAddr1(e.target.value)} autoComplete="address-line1" /></Field>
            <Field label={t.addr2}><TextInput value={addr2} onChange={(e) => setAddr2(e.target.value)} autoComplete="address-line2" placeholder={t.optional} /></Field>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t.city} required><TextInput value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" /></Field>
            <Field label={t.state} required><TextInput value={state} onChange={(e) => setState(e.target.value)} autoComplete="address-level1" /></Field>
          </div>
          <div className="mt-4">
            <Field label={t.residenceType}><ChipGroup options={RESIDENCE} value={residence} renderLabel={(o) => t.options[o] ?? o} onChange={setResidence} /></Field>
          </div>
        </Card>

        <Card className="sm:p-7">
          <SectionHead icon={Briefcase} label={t.secEmployment} />
          <Field label={t.employmentType}><ChipGroup options={EMPLOYMENT} value={employment} renderLabel={(o) => t.options[o] ?? o} onChange={setEmployment} /></Field>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t.monthlyIncome} required><TextInput inputMode="numeric" value={income} onChange={(e) => setIncome(e.target.value.replace(/\D/g, ''))} /></Field>
            <Field label={t.company}><TextInput value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
          </div>
          <div className="mt-4">
            <Field label={t.salaryMode}><ChipGroup options={SALARY_MODE} value={salaryMode} renderLabel={(o) => t.options[o] ?? o} onChange={setSalaryMode} /></Field>
          </div>
        </Card>

        {error && <p className="text-danger text-sm font-semibold">{error}</p>}
        {!valid && !error && (
          <p className="text-muted-foreground text-xs">
            <span className="text-danger font-semibold">{t.requiredToContinue}</span> {missing.join(', ')}{t.sentenceEnd}
          </p>
        )}
      </div>

      <BottomBar meta={t.meta}>
        <button
          onClick={submit}
          disabled={!valid || loading}
          className={`rounded-full px-6 py-3 text-sm font-bold transition-all ${
            !valid || loading
              ? 'bg-muted text-muted-foreground'
              : 'bg-brand-gradient text-primary-foreground shadow-[var(--shadow-soft)] hover:-translate-y-0.5'
          }`}
        >
          {loading ? t.saving : t.continue}
        </button>
      </BottomBar>
    </ApplyShell>
  );
}

/** "30XXXXXXXX00" → "30XX XXXX XX00" (display only — it arrives already masked). */
function formatMaskedAadhaar(m: string) {
  return m.replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ');
}

/** Confirmation of what the PAN lookup returned, shown at the top of Step 2. */
function PanConfirmation({ info, prefilled }: { info: PanHandoff; prefilled: boolean }) {
  const t = useCopy(applyDetailsCopy);
  const name = info.prefill.fullName;
  const masked = info.prefill.maskedAadhaar;
  const panMasked = `${info.pan.slice(0, 2)}XXXX${info.pan.slice(-4)}`;
  return (
    <div className="border-mint/40 bg-accent/60 mb-6 rounded-2xl border p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="bg-mint grid h-10 w-10 shrink-0 place-items-center rounded-full text-white">
          <BadgeCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-extrabold">{t.panVerified}</p>
          {name && <p className="text-foreground mt-0.5 truncate text-sm font-semibold">{name}</p>}
          <p className="text-muted-foreground mt-0.5 font-mono text-xs tracking-wider">{panMasked}</p>
        </div>
      </div>
      {(info.aadhaarLinked != null || masked) && (
        <div className="border-border mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          {info.aadhaarLinked != null && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                info.aadhaarLinked ? 'bg-mint/15 text-primary' : 'bg-warning-soft text-warning'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {info.aadhaarLinked ? t.aadhaarLinked : t.aadhaarNotLinked}
            </span>
          )}
          {masked && (
            <span className="bg-card border-border text-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs font-semibold tracking-wider">
              {t.aadhaarPrefix} {formatMaskedAadhaar(masked)}
            </span>
          )}
        </div>
      )}
      {prefilled && (
        <p className="text-muted-foreground mt-3 text-xs">
          {t.panFilled}
        </p>
      )}
    </div>
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
