import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { Field, Chips, Slider, ConsentRow, PrimaryButton, StepBadge } from '../components/Controls';
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
    if (!state.panConsent) {
      showToast('Please accept the soft-enquiry consent.');
      return;
    }
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
      go('basicpan');
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
        <StepBadge step={1} of={4} label="Your details" />
        <StepDots total={4} active={1} />
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

        {/* Contact & address */}
        <SectionLabel text="Contact & address" />
        <View style={{ gap: 16 }}>
          <Field label="Contact email" placeholder="you@example.com" hint="RBI requires your actual email ID for sharing loan details." autoCapitalize="none" keyboardType="email-address" value={state.basicEmail} onChangeText={v => set({ basicEmail: v })} />
          <Field label="Pin code (current address)" placeholder="6-digit pincode" keyboardType="number-pad" maxLength={6} value={state.basicPin} onChangeText={v => set({ basicPin: v.replace(/\D/g, '').slice(0, 6) })} />
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
          <Field label="Company / employer name (optional)" placeholder="e.g. Infosys Ltd" value={state.basicCompany} onChangeText={v => set({ basicCompany: v })} />
        </View>

        {/* Consent */}
        <View style={{ marginTop: 22 }}>
          <ConsentRow voiceId="Accept terms and consent" checked={state.panConsent} onChange={v => set({ panConsent: v })}>
            I agree to the Terms & Conditions and consent to SwiftLoan fetching my credit information from{' '}
            <Text style={{ color: colors.primary }}>TransUnion CIBIL</Text> and <Text style={{ color: colors.primary }}>CRIF Highmark</Text>, and sharing it with lending partners for this application.
          </ConsentRow>
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
