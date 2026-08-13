import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { Field, Chips, Slider, PrimaryButton, StepBadge } from '../components/Controls';
import { Calendar, formatDob, useDobVoiceTarget } from '../components/Calendar';
import { StepDots } from '../components/StepDots';
import { colors, font, inr } from '../theme/tokens';
import { useStore } from '../state/store';
import { api, ApiError, isAuthed } from '../api/client';

const RES_TYPES = ['Own', 'Rented', 'Family', 'Company'];
const RES_TYPE_SLUG: Record<string, string> = { Own: 'own', Rented: 'rented', Family: 'family', Company: 'company' };

const EMPS = ['Salaried', 'Self-employed', 'Business owner', 'Gig worker', 'Student', 'Retired', 'Other'];
const EMP_SLUG: Record<string, string> = {
  Salaried: 'salaried',
  'Self-employed': 'self_employed',
  'Business owner': 'business_owner',
  'Gig worker': 'gig_worker',
  Student: 'student',
  Retired: 'retired',
  Other: 'other',
};

export default function Basic() {
  const { state, set, go, showToast } = useStore();
  const [dob, setDob] = useState<{ y: number; m: number; d: number } | null>(null);
  useDobVoiceTarget(dob, setDob);
  const [busy, setBusy] = useState(false);

  // Auto-fill from whatever's already saved server-side.
  useEffect(() => {
    if (!isAuthed()) return;
    api.me().then((r: any) => {
      const user = r.user;
      if (!user) return;
      if (!state.basicFirst && user.firstName) set({ basicFirst: user.firstName });
      if (!state.basicLast && user.lastName) set({ basicLast: user.lastName });
      if (!state.basicEmail && user.email) set({ basicEmail: user.email });
      if (!state.basicPin && user.pincode) set({ basicPin: user.pincode });
      if (!state.aboutGender && user.gender) set({ aboutGender: user.gender });
      if (!state.basicIncome && user.monthlyIncome) set({ basicIncome: String(user.monthlyIncome) });
      if (!state.basicCompany && user.company) set({ basicCompany: user.company });
      // Returning-user prefill for the Aurix-required fields so they don't
      // re-enter what they already gave us last time.
      if (!state.basicQualification && user.qualification) set({ basicQualification: user.qualification });
      if (!state.basicLoanPurpose && user.loanPurpose) set({ basicLoanPurpose: user.loanPurpose });
      if (!state.optSalaryMode && user.salaryMode) set({ optSalaryMode: user.salaryMode });
      if (!state.optAddr1 && user.addressLine1) set({ optAddr1: user.addressLine1 });
      if (!state.optCity && user.city) set({ optCity: user.city });
      if (!state.optState && user.state) set({ optState: user.state });
      if (!state.basicRes && user.residenceType) {
        const label = RES_TYPES.find(r => RES_TYPE_SLUG[r] === user.residenceType);
        if (label) set({ basicRes: label });
      }
      if (!state.basicEmp && user.employment) {
        const label = EMPS.find(e => EMP_SLUG[e] === user.employment);
        if (label) set({ basicEmp: label });
      }
      if (!dob && user.dob) {
        const d = new Date(user.dob);
        setDob({ y: d.getFullYear(), m: d.getMonth(), d: d.getDate() });
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onContinue = async () => {
    // PAN + soft-enquiry consent were captured on the previous (PAN-first) step.
    // These are required by the lender (Aurix) to return offers, so enforce them
    // here rather than letting the offer call fail later.
    if (!/^\S+@\S+\.\S+$/.test(state.basicEmail.trim())) { showToast('Please enter a valid email.'); return; }
    if (!state.basicLoanPurpose) { showToast('Please select a loan purpose.'); return; }
    if (!state.basicQualification) { showToast('Please select your qualification.'); return; }
    if (!state.optSalaryMode) { showToast('Please select your salary mode.'); return; }
    if (!state.optAddr1.trim() || !state.optCity.trim() || !state.optState.trim()) { showToast('Please enter your address (line 1, city, state).'); return; }
    if (!isAuthed()) {
      showToast('Please verify your mobile number to continue.');
      go('mobile');
      return;
    }
    setBusy(true);
    try {
      const fullName = [state.basicFirst, state.basicLast].filter(Boolean).join(' ').trim();
      const { user }: any = await api.updateProfile({
        ...(state.basicFirst ? { firstName: state.basicFirst } : {}),
        ...(state.basicLast ? { lastName: state.basicLast } : {}),
        ...(fullName ? { fullName } : {}),
        ...(state.basicEmail ? { email: state.basicEmail } : {}),
        ...(dob ? { dob: new Date(Date.UTC(dob.y, dob.m, dob.d)).toISOString() } : {}),
        ...(state.aboutGender ? { gender: state.aboutGender } : {}),
        ...(state.basicPin ? { pincode: state.basicPin } : {}),
        ...(state.basicRes && RES_TYPE_SLUG[state.basicRes] ? { residenceType: RES_TYPE_SLUG[state.basicRes] } : {}),
        ...(state.basicEmp && EMP_SLUG[state.basicEmp] ? { employment: EMP_SLUG[state.basicEmp] } : {}),
        ...(state.basicIncome ? { monthlyIncome: parseInt(state.basicIncome, 10) || 0 } : {}),
        ...(state.basicCompany ? { company: state.basicCompany } : {}),
        // Aurix-required: qualification + loan purpose.
        ...(state.basicQualification ? { qualification: state.basicQualification } : {}),
        ...(state.basicLoanPurpose ? { loanPurpose: state.basicLoanPurpose } : {}),
        // Lender-required income mode + current address.
        ...(state.optSalaryMode ? { salaryMode: state.optSalaryMode } : {}),
        ...(state.optAddr1.trim() ? { addressLine1: state.optAddr1.trim() } : {}),
        ...(state.optCity.trim() ? { city: state.optCity.trim() } : {}),
        ...(state.optState.trim() ? { state: state.optState.trim() } : {}),
      });
      set({
        authUser: user,
        pdName: user.fullName || state.pdName,
        pdEmail: user.email || state.pdEmail,
        pdDob: user.dob ? new Date(user.dob).toISOString().slice(0, 10) : state.pdDob,
      });

      const { application }: any = await api.createApplication({
        amount: state.appAmount,
        tenureMonths: state.appTenure || 12,
        loanType: 'personal',
      });
      set({ applicationId: application.id });
      // Persist the PAN captured on the first step now that the application exists.
      if (state.panNumber) {
        await api.updateApplication(application.id, { panNumber: state.panNumber }).catch(() => {});
      }
      go('moredetails');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not start your application.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader title={<View />} />
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <StepBadge step={2} of={4} label="Your details" />
        <StepDots total={4} active={2} />
        <Text style={[font(800), { fontSize: 24, letterSpacing: -0.5, color: colors.text, marginTop: 14 }]}>Tell us about yourself</Text>
        <Text style={[font(400), { fontSize: 13.5, color: colors.textSoft, marginTop: 4 }]}>
          A soft check to find your best offers — no impact on your credit score.
        </Text>

        {/* Amount */}
        <View style={{ marginTop: 22 }}>
          <FieldLabel text="Desired loan amount" required />
          <Text style={[font(800), { fontSize: 26, color: colors.primary, marginVertical: 4 }]}>₹ {inr(state.appAmount)}</Text>
          <Slider
            label="Desired loan amount"
            value={state.appAmount}
            min={25000}
            max={1500000}
            step={25000}
            onChange={v => set({ appAmount: v })}
          />
          <RangeLabels min="₹25,000" max="₹15,00,000" />
        </View>

        {/* Loan purpose (required by lender) */}
        <View style={{ gap: 8, marginTop: 18 }}>
          <FieldLabel text="Loan purpose" required />
          <Chips
            value={state.basicLoanPurpose}
            onChange={v => set({ basicLoanPurpose: v })}
            options={['Personal use', 'Working Capital', 'Medical', 'Education', 'Home renovation', 'Travel', 'Other'].map(x => ({ label: x, value: x }))}
          />
        </View>

        {/* Personal details */}
        <SectionLabel text="Personal details" />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="First name (as per PAN)" placeholder="First name" value={state.basicFirst} onChangeText={v => set({ basicFirst: v })} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Last name" placeholder="Last name" value={state.basicLast} onChangeText={v => set({ basicLast: v })} />
          </View>
        </View>

        <View style={{ gap: 6, marginTop: 16 }}>
          <FieldLabel text="Date of birth" required />
          <Pressable style={styles.dobBtn} onPress={() => set({ dobOpen: !state.dobOpen })}>
            <Text style={[font(500), { fontSize: 15, color: dob ? colors.text : colors.muted }]}>{dob ? formatDob(dob.y, dob.m, dob.d) : 'Select date'}</Text>
            <Icon name="calendar_month" size={20} color={colors.textSoft} />
          </Pressable>
          {state.dobOpen ? (
            <Calendar year={dob?.y ?? state.calY} month={dob?.m ?? state.calM} selectedDay={dob?.d} onSelect={(y, m, d) => { setDob({ y, m, d }); set({ dobOpen: false }); }} />
          ) : null}
        </View>

        <View style={{ gap: 8, marginTop: 16 }}>
          <FieldLabel text="Gender" required />
          <Chips value={state.aboutGender} onChange={v => set({ aboutGender: v })} options={[{ label: 'Male', value: 'male' }, { label: 'Female', value: 'female' }, { label: 'Other', value: 'other' }]} />
        </View>

        <View style={{ gap: 8, marginTop: 16 }}>
          <FieldLabel text="Highest qualification" required />
          <Chips
            value={state.basicQualification}
            onChange={v => set({ basicQualification: v })}
            options={['Graduate', 'Post-Graduate', 'Diploma', '12th Pass', 'Other'].map(x => ({ label: x, value: x }))}
          />
        </View>

        {/* Contact & address */}
        <SectionLabel text="Contact & address" />
        <View style={{ gap: 16 }}>
          <Field label="Contact email" placeholder="you@example.com" hint="RBI requires your actual email ID for sharing loan details." autoCapitalize="none" keyboardType="email-address" value={state.basicEmail} onChangeText={v => set({ basicEmail: v })} />
          <Field label="Pin code (current address)" placeholder="6-digit pincode" keyboardType="number-pad" maxLength={6} value={state.basicPin} onChangeText={v => set({ basicPin: v.replace(/\D/g, '').slice(0, 6) })} />
          <Field label="Address line 1" placeholder="Flat / house, building" value={state.optAddr1} onChangeText={v => set({ optAddr1: v })} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><Field label="City" placeholder="City" value={state.optCity} onChangeText={v => set({ optCity: v })} /></View>
            <View style={{ flex: 1 }}><Field label="State" placeholder="State" value={state.optState} onChangeText={v => set({ optState: v })} /></View>
          </View>
          <View style={{ gap: 8 }}>
            <FieldLabel text="Residence type" required />
            <Chips value={state.basicRes} onChange={v => set({ basicRes: v })} options={RES_TYPES.map(r => ({ label: r, value: r }))} />
          </View>
        </View>

        {/* Work & income */}
        <SectionLabel text="Work & income" />
        <View style={{ gap: 12 }}>
          <FieldLabel text="Employment type" required />
          <Chips value={state.basicEmp} onChange={v => set({ basicEmp: v })} options={EMPS.map(e => ({ label: e, value: e }))} />
          <Field label="Monthly income (₹)" placeholder="45,000" hint="Your net monthly income" keyboardType="number-pad" value={state.basicIncome} onChangeText={v => set({ basicIncome: v })} />
          <View style={{ gap: 8 }}>
            <FieldLabel text="Salary / income mode" required />
            <Chips value={state.optSalaryMode} onChange={v => set({ optSalaryMode: v })} options={['Bank Transfer', 'Cheque', 'Cash'].map(x => ({ label: x, value: x }))} />
          </View>
          <Field label="Company / employer name (optional)" placeholder="e.g. Infosys Ltd" value={state.basicCompany} onChangeText={v => set({ basicCompany: v })} />
        </View>

        <View style={{ height: 22 }} />
        <PrimaryButton label={busy ? 'Starting…' : 'Continue'} icon={null} disabled={busy} onPress={onContinue} />
      </View>
    </Screen>
  );
}

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={[font(600), { color: colors.textMid, fontSize: 13 }]}>
      {text}
      {required ? <Text style={{ color: colors.red }}> *</Text> : null}
    </Text>
  );
}
function SectionLabel({ text }: { text: string }) {
  return <Text style={[font(700), { fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.muted, marginTop: 26, marginBottom: 12 }]}>{text}</Text>;
}
function RangeLabels({ min, max }: { min: string; max: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
      <Text style={[font(400), { fontSize: 10.5, color: colors.muted }]}>{min}</Text>
      <Text style={[font(400), { fontSize: 10.5, color: colors.muted }]}>{max}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dobBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
});
