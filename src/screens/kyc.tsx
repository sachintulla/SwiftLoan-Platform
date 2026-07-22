import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { PrimaryButton, StepBadge } from '../components/Controls';
import { StepDots } from '../components/StepDots';
import { TrustBadges } from '../components/Kyc';
import { colors, font } from '../theme/tokens';
import { useStore, Screen as ScreenName } from '../state/store';

// Reconstructed hub: the source defined a `kyc` route that each verification screen
// returns to, but shipped no markup for it. This groups the four designed methods.
const METHODS: { key: ScreenName; icon: string; title: string; sub: string }[] = [
  { key: 'aadhaar', icon: 'fingerprint', title: 'Aadhaar', sub: 'DigiLocker or manual entry' },
  { key: 'panv', icon: 'badge', title: 'PAN', sub: 'Tax & credit checks' },
  { key: 'bankv', icon: 'account_balance', title: 'Bank statements', sub: 'Verify income' },
  { key: 'selfie', icon: 'photo_camera', title: 'Live selfie', sub: 'Confirm identity' },
];

export default function Kyc() {
  const { go } = useStore();
  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader title={<View />} />
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        <Text style={[font(800), { fontSize: 24, letterSpacing: -0.5, color: colors.text }]}>Complete verification</Text>
        <Text style={[font(400), { fontSize: 13.5, color: colors.textSoft, marginTop: 4 }]}>
          A few quick KYC steps so lenders can finalise your offer securely.
        </Text>
        <View style={{ marginTop: 12 }}>
          <StepBadge step={5} of={6} label="Verification" />
          <StepDots total={6} active={5} />
        </View>

        <View style={{ gap: 12, marginTop: 20 }}>
          {METHODS.map(m => (
            <Pressable key={m.key} style={styles.row} onPress={() => go(m.key)}>
              <View style={styles.icon}><Icon name={m.icon} size={22} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[font(700), { fontSize: 15, color: colors.text }]}>{m.title}</Text>
                <Text style={[font(400), { fontSize: 12, color: colors.textSoft, marginTop: 1 }]}>{m.sub}</Text>
              </View>
              <Icon name="chevron_right" size={20} color={colors.muted} />
            </Pressable>
          ))}
        </View>

        <TrustBadges />
        <View style={{ height: 20 }} />
        <PrimaryButton label="Finish & continue" onPress={() => go('disbursed')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 16,
    padding: 14,
  },
  icon: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
});
