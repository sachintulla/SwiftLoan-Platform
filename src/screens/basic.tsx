import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { Field, Chips, Slider, HeaderCta, StepBadge } from '../components/Controls';
import { Calendar, formatDob, useDobVoiceTarget } from '../components/Calendar';
import { StepDots } from '../components/StepDots';
import { colors, font, inr } from '../theme/tokens';
import { useStore, useT } from '../state/store';
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
  const t = useT();
  const [dob, setDob] = useState<{ y: number; m: number; d: number } | null>(null);
  useDobVoiceTarget(dob, setDob);
  const [busy, setBusy] = useState(false);

  // Auto-fill from whatever's already saved server-side.
  useEffect(() => {
    if (!isAuthed()) return;
    api.me().then((r: any) => {
      const user = r.user;
      if (!user) return;
      // Name: prefer explicit first/last, but fall back to splitting the fullName
      // saved by the "Tell us about yourself" screen, so the user never re-types it.
      const nameParts = (user.fullName || '').trim().split(/\s+/).filter(Boolean);
      if (!state.basicFirst) {
        if (user.firstName) set({ basicFirst: user.firstName });
        else if (nameParts.length) set({ basicFirst: nameParts[0] });
      }
      if (!state.basicLast) {
        if (user.lastName) set({ basicLast: user.lastName });
        else if (nameParts.length > 1) set({ basicLast: nameParts.slice(1).join(' ') });
      }
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
    if (!/^\S+@\S+\.\S+$/.test(state.basicEmail.trim())) { showToast(t.basicValEmail); return; }
    if (!state.basicLoanPurpose) { showToast(t.basicValPurpose); return; }
    if (!state.basicQualification) { showToast(t.basicValQual); return; }
    if (!state.optSalaryMode) { showToast(t.basicValSalary); return; }
    if (!state.optAddr1.trim() || !state.optCity.trim() || !state.optState.trim()) { showToast(t.basicValAddr); return; }
    if (!isAuthed()) {
      showToast(t.basicValMobile);
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
      showToast(e instanceof ApiError ? e.message : t.basicErrStart);
    } finally {
      setBusy(false);
    }
  };

  // Chip display labels are localized while the stored value stays English
  // (values map to server slugs / are sent to the lender unchanged).
  const RES_LABELS: Record<string, string> = { Own: t.resOwn, Rented: t.resRented, Family: t.resFamily, Company: t.resCompany };
  const EMP_LABELS: Record<string, string> = {
    Salaried: t.empSalaried, 'Self-employed': t.empSelfEmployed, 'Business owner': t.empBusinessOwner,
    'Gig worker': t.empGigWorker, Student: t.empStudent, Retired: t.empRetired, Other: t.commonOther,
  };
  const PURPOSE_OPTS = [
    { label: t.lpPersonalUse, value: 'Personal use' }, { label: t.lpWorkingCapital, value: 'Working Capital' },
    { label: t.lpMedical, value: 'Medical' }, { label: t.lpEducation, value: 'Education' },
    { label: t.lpHomeRenovation, value: 'Home renovation' }, { label: t.lpTravel, value: 'Travel' },
    { label: t.commonOther, value: 'Other' },
  ];
  const QUAL_OPTS = [
    { label: t.qualGraduate, value: 'Graduate' }, { label: t.qualPostGraduate, value: 'Post-Graduate' },
    { label: t.qualDiploma, value: 'Diploma' }, { label: t.qual12th, value: '12th Pass' }, { label: t.commonOther, value: 'Other' },
  ];
  const SALARY_OPTS = [
    { label: t.smBankTransfer, value: 'Bank Transfer' }, { label: t.smCheque, value: 'Cheque' }, { label: t.smCash, value: 'Cash' },
  ];
  const GENDER_OPTS = [{ label: t.genderMale, value: 'male' }, { label: t.genderFemale, value: 'female' }, { label: t.commonOther, value: 'other' }];

  return (
    <Screen
      scroll
      padded={false}
      contentStyle={{ paddingBottom: 24 }}
      collapsingTitle={t.basicTitle}
      headerRight={<HeaderCta label={busy ? t.basicStarting : t.continueBtn} disabled={busy} onPress={onContinue} />}
    >
      <View style={{ paddingHorizontal: 20 }}>
        <StepBadge step={2} of={4} label={t.basicStepLabel} />
        <StepDots total={4} active={2} />
        <Text style={[font(800), { fontSize: 24, letterSpacing: -0.5, color: colors.text, marginTop: 14 }]}>{t.basicTitle}</Text>
        <Text style={[font(400), { fontSize: 13.5, color: colors.textSoft, marginTop: 4 }]}>
          {t.basicSub}
        </Text>

        {/* Amount */}
        <View style={{ marginTop: 22 }}>
          <FieldLabel text={t.basicAmountLabel} required />
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
          <FieldLabel text={t.basicPurposeLabel} required />
          <Chips
            value={state.basicLoanPurpose}
            onChange={v => set({ basicLoanPurpose: v })}
            options={PURPOSE_OPTS}
          />
        </View>

        {/* Personal details */}
        <SectionLabel text={t.basicPersonalSection} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label={t.basicFirstLabel} placeholder={t.basicFirstPlaceholder} value={state.basicFirst} onChangeText={v => set({ basicFirst: v })} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t.basicLastLabel} placeholder={t.basicLastPlaceholder} value={state.basicLast} onChangeText={v => set({ basicLast: v })} />
          </View>
        </View>

        <View style={{ gap: 6, marginTop: 16 }}>
          <FieldLabel text={t.dobLabel} required />
          <Pressable style={styles.dobBtn} onPress={() => set({ dobOpen: !state.dobOpen })}>
            <Text style={[font(500), { fontSize: 15, color: dob ? colors.text : colors.muted }]}>{dob ? formatDob(dob.y, dob.m, dob.d) : t.selectDate}</Text>
            <Icon name="calendar_month" size={20} color={colors.textSoft} />
          </Pressable>
          {state.dobOpen ? (
            <Calendar year={dob?.y ?? state.calY} month={dob?.m ?? state.calM} selectedDay={dob?.d} onSelect={(y, m, d) => { setDob({ y, m, d }); set({ dobOpen: false }); }} />
          ) : null}
        </View>

        <View style={{ gap: 8, marginTop: 16 }}>
          <FieldLabel text={t.genderLabel} required />
          <Chips value={state.aboutGender} onChange={v => set({ aboutGender: v })} options={GENDER_OPTS} />
        </View>

        <View style={{ gap: 8, marginTop: 16 }}>
          <FieldLabel text={t.basicQualLabel} required />
          <Chips
            value={state.basicQualification}
            onChange={v => set({ basicQualification: v })}
            options={QUAL_OPTS}
          />
        </View>

        {/* Contact & address */}
        <SectionLabel text={t.basicContactSection} />
        <View style={{ gap: 16 }}>
          <Field label={t.basicEmailLabel} placeholder={t.emailPlaceholder} hint={t.basicEmailHint} autoCapitalize="none" keyboardType="email-address" value={state.basicEmail} onChangeText={v => set({ basicEmail: v })} />
          <Field label={t.basicPinLabel} placeholder={t.pincodePlaceholder} keyboardType="number-pad" maxLength={6} value={state.basicPin} onChangeText={v => set({ basicPin: v.replace(/\D/g, '').slice(0, 6) })} />
          <Field label={t.basicAddr1Label} placeholder={t.basicAddr1Placeholder} value={state.optAddr1} onChangeText={v => set({ optAddr1: v })} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><Field label={t.basicCity} placeholder={t.basicCity} value={state.optCity} onChangeText={v => set({ optCity: v })} /></View>
            <View style={{ flex: 1 }}><Field label={t.basicState} placeholder={t.basicState} value={state.optState} onChangeText={v => set({ optState: v })} /></View>
          </View>
          <View style={{ gap: 8 }}>
            <FieldLabel text={t.basicResLabel} required />
            <Chips value={state.basicRes} onChange={v => set({ basicRes: v })} options={RES_TYPES.map(r => ({ label: RES_LABELS[r], value: r }))} />
          </View>
        </View>

        {/* Work & income */}
        <SectionLabel text={t.basicWorkSection} />
        <View style={{ gap: 12 }}>
          <FieldLabel text={t.basicEmpLabel} required />
          <Chips value={state.basicEmp} onChange={v => set({ basicEmp: v })} options={EMPS.map(e => ({ label: EMP_LABELS[e], value: e }))} />
          <Field label={t.basicIncomeLabel} placeholder="45,000" hint={t.basicIncomeHint} keyboardType="number-pad" value={state.basicIncome} onChangeText={v => set({ basicIncome: v })} />
          <View style={{ gap: 8 }}>
            <FieldLabel text={t.basicSalaryModeLabel} required />
            <Chips value={state.optSalaryMode} onChange={v => set({ optSalaryMode: v })} options={SALARY_OPTS} />
          </View>
          <Field label={t.basicCompanyLabel} placeholder={t.basicCompanyPlaceholder} value={state.basicCompany} onChangeText={v => set({ basicCompany: v })} />
        </View>

        <View style={{ height: 8 }} />
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
