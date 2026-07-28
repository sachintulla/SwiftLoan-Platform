import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { Field, Chips, PrimaryButton, GhostButton } from '../components/Controls';
import { Calendar, formatDob, useDobVoiceTarget } from '../components/Calendar';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';

export default function AboutYou() {
  const { state, set, go, showToast } = useStore();
  const [dob, setDob] = useState<{ y: number; m: number; d: number } | null>(null);
  useDobVoiceTarget(dob, setDob);

  const dobText = dob ? formatDob(dob.y, dob.m, dob.d) : 'Select date';

  const onContinue = () => {
    if (state.aboutName.trim() && state.aboutPin.length === 6) go('home');
    else showToast('Please add your name and a 6-digit pincode.');
  };

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader onBack={() => go('permissions')} title={<View />} />
      </View>

      <View style={{ paddingHorizontal: 24 }}>
        <Text style={[font(800), { fontSize: 26, letterSpacing: -0.5, color: colors.text }]}>About you</Text>
        <Text style={[font(400), { fontSize: 14, lineHeight: 21, color: '#6E8080', marginTop: 6 }]}>
          Just the basics — we'll ask for more only when you apply.
        </Text>

        <Text style={styles.sectionLabel}>About you</Text>
        <View style={{ gap: 16 }}>
          <Field
            label="Full name (as per PAN)"
            placeholder="e.g. Asha Kumari"
            value={state.aboutName}
            onChangeText={v => set({ aboutName: v })}
          />

          <View style={{ gap: 6 }}>
            <Text style={[font(600), { color: colors.textMid, fontSize: 13 }]}>Date of birth</Text>
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
            <Text style={[font(400), { fontSize: 11.5, color: colors.muted }]}>Tap to pick your date of birth.</Text>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={[font(600), { color: colors.textMid, fontSize: 13 }]}>Gender (optional)</Text>
            <Chips
              value={state.aboutGender}
              onChange={v => set({ aboutGender: v })}
              options={[
                { label: 'Male', value: 'male' },
                { label: 'Female', value: 'female' },
                { label: 'Other', value: 'other' },
              ]}
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>Contact</Text>
        <View style={{ gap: 16 }}>
          <Field
            label="Email (optional)"
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={state.basicEmail}
            onChangeText={v => set({ basicEmail: v })}
          />
          <Field
            label="Pincode"
            placeholder="6-digit pincode"
            keyboardType="number-pad"
            maxLength={6}
            value={state.aboutPin}
            onChangeText={v => set({ aboutPin: v.replace(/\D/g, '').slice(0, 6) })}
          />
        </View>

        <View style={{ height: 24 }} />
        <PrimaryButton label="Continue" icon={null} onPress={onContinue} />
        <View style={{ height: 10 }} />
        <GhostButton label="Skip for now" onPress={() => go('home')} />
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
