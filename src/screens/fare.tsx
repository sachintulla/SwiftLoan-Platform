import React from 'react';
import { View, Text } from 'react-native';
import { Screen } from '../components/Frame';
import { EmiCalculator } from '../components/EmiCalculator';
import { colors, font } from '../theme/tokens';
import { useStore, useT } from '../state/store';

export default function Fare() {
  const t = useT();
  const { go } = useStore();
  return (
    <Screen scroll bottomNav padded>
      <View style={{ marginTop: 8, marginBottom: 16 }}>
        <Text style={[font(800), { fontSize: 26, letterSpacing: -0.5, color: colors.text }]}>Loan Calculator</Text>
        <Text style={[font(400), { fontSize: 14, color: colors.textSoft, marginTop: 4 }]}>{t.fareSub}</Text>
      </View>
      <EmiCalculator onApply={() => go('basicpan')} />
    </Screen>
  );
}
