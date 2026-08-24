import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { EmiCalculator } from '../components/EmiCalculator';
import { colors, font } from '../theme/tokens';
import { useStore, useT } from '../state/store';

/**
 * Standalone Loan Calculator — reached from a single Home button. Keeps the
 * bottom tab bar (bottomNav) so it lives inside the tab controller rather than
 * as a modal. "Apply" drops into the loan funnel.
 */
export default function Calculator() {
  const { go, back } = useStore();
  const t = useT();
  return (
    <Screen scroll bottomNav padded>
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={10} style={styles.back} accessibilityLabel="Back">
          <Icon name="arrow_back" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[font(800), styles.title]}>{t.calculatorTitle}</Text>
          <Text style={[font(400), styles.sub]}>{t.fareSub}</Text>
        </View>
      </View>
      <EmiCalculator onApply={() => go('basicpan')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 16 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  title: { fontSize: 24, letterSpacing: -0.4, color: colors.text },
  sub: { fontSize: 13, color: colors.textSoft, marginTop: 2 },
});
