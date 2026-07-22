import React from 'react';
import { View, Text } from 'react-native';
import { Screen, AppHeader } from './Frame';
import Icon from './Icon';
import { StepBadge } from './Controls';
import { StepDots } from './StepDots';
import { colors, font } from '../theme/tokens';

/** Common scaffold for the "Step 5 of 6" verification screens. */
export function KycScaffold({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader title={<View />} />
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        <Text style={[font(800), { fontSize: 24, letterSpacing: -0.5, color: colors.text }]}>{title}</Text>
        <Text style={[font(400), { fontSize: 13.5, color: colors.textSoft, marginTop: 4 }]}>{subtitle}</Text>
        <View style={{ marginTop: 12 }}>
          <StepBadge step={5} of={6} label="Verification" />
          <StepDots total={6} active={5} />
        </View>
        <View style={{ marginTop: 18 }}>{children}</View>
      </View>
    </Screen>
  );
}

export function TrustBadges() {
  const items = [
    { icon: 'verified_user', label: '256-BIT SSL' },
    { icon: 'gpp_good', label: 'RBI COMPLIANT' },
    { icon: 'shield', label: 'ISO 27001' },
  ];
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 22 }}>
      {items.map(i => (
        <View key={i.label} style={{ alignItems: 'center', gap: 4 }}>
          <Icon name={i.icon} size={20} color={colors.mint} />
          <Text style={[font(700), { fontSize: 9.5, letterSpacing: 0.3, color: colors.muted }]}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}
