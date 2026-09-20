'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, User, MapPin, Briefcase } from 'lucide-react';
import { ApplyShell, Stepper, BottomBar } from '@/components/apply/ApplyShell';
import { Card, Field, TextInput, ChipGroup } from '@/components/apply/primitives';
import { Slider } from '@/components/ui/slider';
import { fmtINR } from '@/lib/core';
import { useApply } from '@/lib/applyContext';
import { patchProfile, createApplication, fetchMe, getApplication } from '@/lib/applyApi';
import { loadDraft, saveDraft } from '@/lib/applyDraft';

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

export default function Step1Page() {
  const router = useRouter();
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
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [residence, setResidence] = useState(RESIDENCE[0]!);
  const [employment, setEmployment] = useState(EMPLOYMENT[0]!);
  const [income, setIncome] = useState('');
  const [company, setCompany] = useState('');
  const [salaryMode, setSalaryMode] = useState(SALARY_MODE[0]!);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Revisiting this step (e.g. "Update details" from the empty-offers screen):
  // apply the local draft first (instant, but possibly stale), then overlay
  // the server's copy once it loads — the server is authoritative, but only
  // overwrite fields it actually has a value for, so an in-progress edit is
  // never clobbered with null.
  useEffect(() => {
    const draft = phone ? loadDraft(phone) : {};
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
    if (draft.city) setCity(draft.city);
    if (draft.state) setState(draft.state);
    if (draft.residence) setResidence(draft.residence);
    if (draft.employment) setEmployment(draft.employment);
    if (draft.income) setIncome(draft.income);
    if (draft.company) setCompany(draft.company);
    if (draft.salaryMode) setSalaryMode(draft.salaryMode);

    fetchMe()
      .then((res) => {
        const user = res?.data?.user;
        if (!user) return;
        if (user.firstName) setFirstName(user.firstName);
        if (user.lastName) setLastName(user.lastName);
        if (user.dob) setDob(String(user.dob).slice(0, 10));
        const g = unslug(GENDERS, user.gender);
        if (g) setGender(g);
        if (user.qualification) setQualification(user.qualification);
        if (user.email) setEmail(user.email);
        if (user.pincode) setPincode(user.pincode);
        if (user.addressLine1) setAddr1(user.addressLine1);
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
      })
      .catch(() => {
        /* not logged in yet, or offline — the draft/defaults above still render */
      });
    if (applicationId) {
      getApplication(applicationId)
        .then((app) => setAmount(app.amount))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const valid =
    firstName.trim() && lastName.trim() && dob && /^\S+@\S+\.\S+$/.test(email) && /^\d{6}$/.test(pincode) &&
    addr1.trim() && city.trim() && state.trim() && /^\d+$/.test(income);

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
      if (phone) {
        saveDraft(phone, {
          amount, purpose, firstName, lastName, dob, gender, qualification, email, pincode,
          addr1, city, state, residence, employment, income, company, salaryMode,
        });
      }
      router.push('/apply/step-2');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ApplyShell backHref="/apply/verify" stepLabel="Step 1 of 3" progressPct={28}>
      <Stepper step={1} />
      <h1 className="text-2xl font-extrabold">Tell us about your loan</h1>
      <p className="text-muted-foreground mt-2 mb-6 text-sm">
        This helps us match you with lenders offering the best rate. Takes about 3 minutes.
      </p>

      <div className="flex flex-col gap-5">
        <Card className="sm:p-7">
          <SectionHead icon={Wallet} label="Loan amount" />
          <div className="bg-accent rounded-2xl p-5">
            <div className="text-primary text-3xl font-extrabold">{fmtINR(amount)}</div>
            <Slider className="mt-4" min={25000} max={1500000} step={25000} value={[amount]} onValueChange={([v]) => v != null && setAmount(v)} />
            <div className="text-muted-foreground mt-2 flex justify-between text-xs font-bold">
              <span>{fmtINR(25000)}</span>
              <span>{fmtINR(1500000)}</span>
            </div>
          </div>
          <p className="text-foreground mt-5 mb-3 text-sm font-semibold">What&apos;s this loan for?</p>
          <ChipGroup options={PURPOSES} value={purpose} onChange={setPurpose} />
        </Card>

        <Card className="sm:p-7">
          <SectionHead icon={User} label="About you" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="First name"><TextInput value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" /></Field>
            <Field label="Last name"><TextInput value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" /></Field>
            <Field label="Date of birth"><TextInput type="date" value={dob} onChange={(e) => setDob(e.target.value)} autoComplete="bday" /></Field>
            <Field label="Gender"><ChipGroup options={GENDERS} value={gender} onChange={setGender} /></Field>
          </div>
          <div className="mt-4">
            <Field label="Qualification"><ChipGroup options={QUALIFICATIONS} value={qualification} onChange={setQualification} /></Field>
          </div>
        </Card>

        <Card className="sm:p-7">
          <SectionHead icon={MapPin} label="Contact & address" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Email"><TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
            <Field label="Pincode"><TextInput inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))} autoComplete="postal-code" /></Field>
          </div>
          <div className="mt-4">
            <Field label="Address line 1"><TextInput value={addr1} onChange={(e) => setAddr1(e.target.value)} autoComplete="address-line1" /></Field>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="City"><TextInput value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" /></Field>
            <Field label="State"><TextInput value={state} onChange={(e) => setState(e.target.value)} autoComplete="address-level1" /></Field>
          </div>
          <div className="mt-4">
            <Field label="Residence type"><ChipGroup options={RESIDENCE} value={residence} onChange={setResidence} /></Field>
          </div>
        </Card>

        <Card className="sm:p-7">
          <SectionHead icon={Briefcase} label="Employment & income" />
          <Field label="Employment type"><ChipGroup options={EMPLOYMENT} value={employment} onChange={setEmployment} /></Field>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Monthly income (₹)"><TextInput inputMode="numeric" value={income} onChange={(e) => setIncome(e.target.value.replace(/\D/g, ''))} /></Field>
            <Field label="Company name"><TextInput value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
          </div>
          <div className="mt-4">
            <Field label="Salary mode"><ChipGroup options={SALARY_MODE} value={salaryMode} onChange={setSalaryMode} /></Field>
          </div>
        </Card>

        {error && <p className="text-danger text-sm font-semibold">{error}</p>}
      </div>

      <BottomBar meta="Step 1 of 3 · ~2 min left">
        <button
          onClick={submit}
          disabled={!valid || loading}
          className={`rounded-full px-6 py-3 text-sm font-bold transition-all ${
            !valid || loading
              ? 'bg-muted text-muted-foreground'
              : 'bg-brand-gradient text-primary-foreground shadow-[var(--shadow-soft)] hover:-translate-y-0.5'
          }`}
        >
          {loading ? 'Saving…' : 'Continue →'}
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
