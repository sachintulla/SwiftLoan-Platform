import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { Field, Chips, PrimaryButton, GhostButton } from '../components/Controls';
import { Calendar, formatDob, useDobVoiceTarget } from '../components/Calendar';
import { colors, font } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { api, ApiError, isAuthed } from '../api/client';

export default function AboutYou() {
  const { state, set, go, showToast } = useStore();
  const t = useT();
  const [dob, setDob] = useState<{ y: number; m: number; d: number } | null>(null);
  const [busy, setBusy] = useState(false);
  useDobVoiceTarget(dob, setDob);

  // Auto-fill from whatever's already saved server-side (e.g. re-visiting
  // this screen in a later session), so the user never re-types what's known.
  useEffect(() => {
    if (!isAuthed()) return;
    api.me().then((r: any) => {
      const user = r.user;
      if (!user) return;
      if (!state.aboutName && (user.fullName || user.firstName)) set({ aboutName: user.fullName || user.firstName });
      if (!state.basicEmail && user.email) set({ basicEmail: user.email });
      if (!state.aboutPin && user.pincode) set({ aboutPin: user.pincode });
      if (!state.aboutGender && user.gender) set({ aboutGender: user.gender });
      if (!dob && user.dob) {
        const d = new Date(user.dob);
        setDob({ y: d.getFullYear(), m: d.getMonth(), d: d.getDate() });
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dobText = dob ? formatDob(dob.y, dob.m, dob.d) : t.selectDate;

  const onContinue = async () => {
    if (!(state.aboutName.trim() && state.aboutPin.length === 6)) {
      showToast(t.aboutYouValidate);
      return;
    }
    setBusy(true);
    try {
      if (isAuthed()) {
        // Persist first/last too so the loan funnel pre-fills the name and the
        // user never enters it twice.
        const nameParts = state.aboutName.trim().split(/\s+/).filter(Boolean);
        const { user }: any = await api.updateProfile({
          fullName: state.aboutName.trim(),
          ...(nameParts.length ? { firstName: nameParts[0] } : {}),
          ...(nameParts.length > 1 ? { lastName: nameParts.slice(1).join(' ') } : {}),
          ...(state.basicEmail ? { email: state.basicEmail } : {}),
          ...(dob ? { dob: new Date(Date.UTC(dob.y, dob.m, dob.d)).toISOString() } : {}),
          ...(state.aboutGender ? { gender: state.aboutGender } : {}),
          pincode: state.aboutPin,
        });
        set({
          authUser: user,
          pdName: user.fullName || state.pdName,
          pdEmail: user.email || state.pdEmail,
          pdDob: user.dob ? new Date(user.dob).toISOString().slice(0, 10) : state.pdDob,
        });
      }
      go('home');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : t.aboutYouSaveErr);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader onBack={() => go('permissions')} title={<View />} />
      </View>

      <View style={{ paddingHorizontal: 24 }}>
        <Text style={[font(800), { fontSize: 26, letterSpacing: -0.5, color: colors.text }]}>{t.aboutYouTitle}</Text>
        <Text style={[font(400), { fontSize: 14, lineHeight: 21, color: '#6E8080', marginTop: 6 }]}>
          {t.aboutYouSub}
        </Text>

        <Text style={styles.sectionLabel}>{t.aboutYouTitle}</Text>
        <View style={{ gap: 16 }}>
          <Field
            label={t.aboutNameLabel}
            placeholder={t.aboutNamePlaceholder}
            value={state.aboutName}
            onChangeText={v => set({ aboutName: v })}
          />

          <View style={{ gap: 6 }}>
            <Text style={[font(600), { color: colors.textMid, fontSize: 13 }]}>{t.dobLabel}</Text>
            <Pressable style={styles.dobBtn} onPress={() => set({ dobOpen: !state.dobOpen })}>
              <Text style={[font(500), { fontSize: 15, color: dob ? colors.text : colors.muted }]}>{dobText}</Text>
              <Icon name="calendar_month" size={20} color={colors.textSoft} />
            </Pressable>
            {state.dobOpen ? (
              <Calendar
                year={dob?.y ?? state.calY}
                month={dob?.m ?? state.calM}
                selectedDay={dob?.d}
                onSelect={(y, m, d) => {
                  setDob({ y, m, d });
                  set({ dobOpen: false });
                }}
              />
            ) : null}
            <Text style={[font(400), { fontSize: 11.5, color: colors.muted }]}>{t.dobHint}</Text>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={[font(600), { color: colors.textMid, fontSize: 13 }]}>{t.genderOptionalLabel}</Text>
            <Chips
              value={state.aboutGender}
              onChange={v => set({ aboutGender: v })}
              options={[
                { label: t.genderMale, value: 'male' },
                { label: t.genderFemale, value: 'female' },
                { label: t.commonOther, value: 'other' },
              ]}
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>{t.contactSection}</Text>
        <View style={{ gap: 16 }}>
          <Field
            label={t.emailOptionalLabel}
            placeholder={t.emailPlaceholder}
            autoCapitalize="none"
            keyboardType="email-address"
            value={state.basicEmail}
            onChangeText={v => set({ basicEmail: v })}
          />
          <Field
            label={t.pincodeLabel}
            placeholder={t.pincodePlaceholder}
            keyboardType="number-pad"
            maxLength={6}
            value={state.aboutPin}
            onChangeText={v => set({ aboutPin: v.replace(/\D/g, '').slice(0, 6) })}
          />
        </View>

        <View style={{ height: 24 }} />
        <PrimaryButton label={busy ? t.saving : t.continueBtn} icon={null} disabled={busy} onPress={onContinue} />
        <View style={{ height: 10 }} />
        <GhostButton label={t.commonSkip} onPress={() => { set({ exploreFromHome: false }); go('explore'); }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    ...font(700),
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 24,
    marginBottom: 12,
  },
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
