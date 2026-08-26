import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import { Field, Chips, HeaderCta, StepBadge } from '../components/Controls';
import { StepDots } from '../components/StepDots';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';
import { api, ApiError, isAuthed } from '../api/client';

/**
 * "A few more details" — OPTIONAL enrichment screen shown after PAN. Everything
 * here is skippable: better data can unlock more/better lender offers, but none
 * of it blocks the application. The Continue/Skip bar is pinned (Screen.footer)
 * so it's always reachable while the fields scroll.
 */
export default function MoreDetails() {
  const { state, set, go, showToast } = useStore();
  const [busy, setBusy] = useState(false);

  const save = async (): Promise<boolean> => {
    if (!isAuthed()) return true; // nothing to persist for a guest — just proceed
    // These are OPTIONAL, but if filled they must be valid — the backend rejects
    // a malformed email with "Validation failed", which would block the whole
    // save. Catch it here with a clear message instead.
    const emailOk = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());
    if (state.optAltEmail.trim() && !emailOk(state.optAltEmail)) {
      showToast('Enter a valid alternate email, or leave it blank.');
      return false;
    }
    if (state.optCompanyEmail.trim() && !emailOk(state.optCompanyEmail)) {
      showToast('Enter a valid company email, or leave it blank.');
      return false;
    }
    if (state.optBusinessEmail.trim() && !emailOk(state.optBusinessEmail)) {
      showToast('Enter a valid business email, or leave it blank.');
      return false;
    }
    const patch: Record<string, unknown> = {};
    const s = (v: string) => v.trim();
    if (s(state.optMarital)) patch.maritalStatus = s(state.optMarital);
    if (s(state.optAltMobile)) patch.alternateMobile = s(state.optAltMobile);
    if (s(state.optAltEmail)) patch.alternateEmail = s(state.optAltEmail);
    if (s(state.optAddr1)) patch.addressLine1 = s(state.optAddr1);
    if (s(state.optAddr2)) patch.addressLine2 = s(state.optAddr2);
    if (s(state.optLandmark)) patch.landmark = s(state.optLandmark);
    if (s(state.optCity)) patch.city = s(state.optCity);
    if (s(state.optDistrict)) patch.district = s(state.optDistrict);
    if (s(state.optState)) patch.state = s(state.optState);
    if (s(state.optSalaryMode)) patch.salaryMode = s(state.optSalaryMode);
    if (s(state.optProfType)) patch.professionalType = s(state.optProfType);
    if (s(state.optCompanyEmail)) patch.companyEmail = s(state.optCompanyEmail);
    if (s(state.optBusinessEmail)) patch.businessEmail = s(state.optBusinessEmail);
    const obl = parseInt(state.optObligations.replace(/\D/g, ''), 10);
    if (Number.isFinite(obl) && obl > 0) patch.monthlyObligations = obl;
    if (Object.keys(patch).length === 0) return true;
    try {
      await api.updateProfile(patch);
      return true;
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Could not save your details.');
      return false;
    }
  };

  const onContinue = async () => {
    setBusy(true);
    const ok = await save();
    setBusy(false);
    if (ok) go('finding');
  };

  return (
    <Screen>
      <AppHeader
        title={<View />}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable onPress={() => go('finding')} hitSlop={8} accessibilityRole="button">
              <Text style={[font(700), { fontSize: 14, color: colors.textSoft }]}>Skip</Text>
            </Pressable>
            <HeaderCta label={busy ? 'Saving…' : 'Continue'} disabled={busy} onPress={onContinue} />
          </View>
        }
      />
      <StepBadge step={3} of={4} label="Optional" />
      <StepDots total={4} active={3} />
      <Text style={[font(800), { fontSize: 24, letterSpacing: -0.5, color: colors.text, marginTop: 14 }]}>A few more details</Text>
      <Text style={[font(400), { fontSize: 13.5, color: colors.textSoft, marginTop: 4 }]}>
        Optional — sharing a bit more can unlock better offers. You can skip and continue.
      </Text>

      {/* About you */}
      <SectionLabel text="About you" />
      <View style={{ gap: 8 }}>
        <Text style={[font(600), { fontSize: 13, color: colors.textMid }]}>Marital status</Text>
        <Chips value={state.optMarital} onChange={v => set({ optMarital: v })} options={['Single', 'Married', 'Other'].map(x => ({ label: x, value: x }))} />
      </View>

      {/* Alternate contact */}
      <SectionLabel text="Alternate contact" />
      <View style={{ gap: 14 }}>
        <Field label="Alternate mobile (optional)" placeholder="10-digit" keyboardType="number-pad" maxLength={10} value={state.optAltMobile} onChangeText={v => set({ optAltMobile: v.replace(/\D/g, '').slice(0, 10) })} />
        <Field label="Alternate email (optional)" placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" value={state.optAltEmail} onChangeText={v => set({ optAltEmail: v })} />
      </View>

      {/* Address (extra lines — line 1 / city / state captured on the previous step) */}
      <SectionLabel text="Address (extra)" />
      <View style={{ gap: 14 }}>
        <Field label="Address line 2" placeholder="Street, area" value={state.optAddr2} onChangeText={v => set({ optAddr2: v })} />
        <Field label="Landmark" placeholder="Nearby landmark" value={state.optLandmark} onChangeText={v => set({ optLandmark: v })} />
        <Field label="District" placeholder="District" value={state.optDistrict} onChangeText={v => set({ optDistrict: v })} />
      </View>

      {/* Income */}
      <SectionLabel text="Income" />
      <View style={{ gap: 12 }}>
        <Field label="Monthly obligations / EMIs (₹)" placeholder="e.g. 15,000" keyboardType="number-pad" value={state.optObligations} onChangeText={v => set({ optObligations: v })} />
      </View>

      <View style={{ height: 8 }} />
    </Screen>
  );
}

function SectionLabel({ text }: { text: string }) {
  return <Text style={[font(700), { fontSize: 12.5, color: colors.greenDeep, letterSpacing: 0.3, textTransform: 'uppercase', marginTop: 24, marginBottom: 10 }]}>{text}</Text>;
}
