import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen } from '../components/Frame';
import { LogoLockup } from '../components/Logo';
import Icon from '../components/Icon';
import { PreApprovedPlans } from '../components/PreApprovedPlans';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';

/**
 * "Explore your loan options" — reached either from the skip-login path
 * (mobile.tsx's / aboutyou.tsx's "Skip for now": a guest-preview, before any
 * real signup/PAN is needed) or from home's "Explore more plans" link (already
 * signed in, just browsing/re-picking — state.exploreFromHome distinguishes them).
 */
export default function Explore() {
  const { state, go } = useStore();
  const fromHome = state.exploreFromHome;
  return (
    <Screen scroll bottomNav padded={false}>
      <View style={styles.header}>
        <Pressable onPress={() => go(fromHome ? 'home' : 'mobile')} hitSlop={10} style={styles.backBtn}>
          <Icon name="arrow_back" size={24} color={colors.text} />
        </Pressable>
        <LogoLockup size={26} />
        {fromHome ? (
          <View style={{ width: 40 }} />
        ) : (
          <View style={styles.previewPill}>
            <Icon name="visibility" size={13} color={colors.textSoft} />
            <Text style={[font(600), { fontSize: 11.5, color: colors.textSoft }]}>Preview</Text>
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
        <PreApprovedPlans mode={fromHome ? 'home' : 'guest'} onApply={() => go(fromHome ? 'home' : 'mobile')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
