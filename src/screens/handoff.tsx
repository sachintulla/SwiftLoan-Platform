import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, PanResponder, Animated, LayoutChangeEvent } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { StepBadge } from '../components/Controls';
import { StepDots } from '../components/StepDots';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';
import { api } from '../api/client';

const SUMMARY = [
  { label: 'Loan Amount', value: '₹25,000' },
  { label: 'Estimated APR', value: '5.4%' },
  { label: 'Tenure', value: '48 Months' },
  { label: 'Monthly EMI', value: '₹580.20' },
];
const DOCS = [
  { icon: 'person_search', label: 'Verified Identity Profile' },
  { icon: 'account_balance', label: 'Last 3 Months Bank Statements' },
  { icon: 'description', label: 'Tax Returns & Income Proof' },
];

export default function Handoff() {
  const { state, set, go } = useStore();
  const confirm = async () => {
    if (state.applicationId) {
      try {
        const { loan }: any = await api.handoff(state.applicationId);
        set({ loanId: loan.id });
      } catch {
        /* fall through to the disbursed screen regardless (demo) */
      }
    }
    go('disbursed');
  };
  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader title={<View />} />
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        <StepBadge step={4} of={4} label="Secure Handoff" />
        <StepDots total={4} active={4} />
        <Text style={[font(800), { fontSize: 24, letterSpacing: -0.5, color: colors.text, marginTop: 14 }]}>Secure Handoff</Text>
        <Text style={[font(400), { fontSize: 13.5, color: colors.textSoft, marginTop: 4 }]}>Finalize your connection to the lender.</Text>

        {/* Offer summary */}
        <View style={styles.summary}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="verified_user" size={18} color={colors.mint} />
            <Text style={[font(700), { fontSize: 14, color: colors.text }]}>Selected Offer Summary</Text>
          </View>
          <View style={styles.summaryGrid}>
            {SUMMARY.map(s => (
              <View key={s.label} style={{ width: '50%', marginTop: 12 }}>
                <Text style={[font(400), { fontSize: 11.5, color: colors.muted }]}>{s.label}</Text>
                <Text style={[font(800), { fontSize: 16, color: colors.text, marginTop: 1 }]}>{s.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Disclosure */}
        <View style={styles.disclosure}>
          <Icon name="info" size={18} color={colors.blue} />
          <View style={{ flex: 1 }}>
            <Text style={[font(700), { fontSize: 13.5, color: colors.text }]}>Important Disclosure</Text>
            <Text style={[font(400), { fontSize: 12, lineHeight: 18, color: colors.textSoft, marginTop: 2 }]}>
              SwiftLoan is a credit mediator, not the lender. We facilitate your application to{' '}
              <Text style={font(700)}>BlueHorizon Capital</Text>, who performs the final credit assessment.
            </Text>
          </View>
        </View>

        <Text style={[font(700), { fontSize: 13, color: colors.textMid, marginTop: 20, marginBottom: 8 }]}>You are consenting to share:</Text>
        <View style={{ gap: 8 }}>
          {DOCS.map(d => (
            <View key={d.label} style={styles.docRow}>
              <Icon name={d.icon} size={20} color={colors.primary} />
              <Text style={[font(600), { flex: 1, fontSize: 13.5, color: colors.text }]}>{d.label}</Text>
              <Icon name="lock" size={16} color={colors.muted} />
            </View>
          ))}
        </View>

        <Text style={[font(400), { fontSize: 11.5, lineHeight: 17, color: colors.muted, marginTop: 14 }]}>
          By confirming, you authorize SwiftLoan to securely transfer the documents above to BlueHorizon Capital. Your data is encrypted in transit and handled per our <Text style={{ color: colors.primary }}>Privacy Policy</Text>.
        </Text>

        <View style={{ height: 20 }} />
        <SlideToConfirm onConfirm={confirm} />
      </View>
    </Screen>
  );
}

function SlideToConfirm({ onConfirm }: { onConfirm: () => void }) {
  const [, setW] = useState(0);
  const wRef = useRef(0);
  const x = useRef(new Animated.Value(0)).current;
  const KNOB = 52;

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        const max = Math.max(0, wRef.current - KNOB - 8);
        x.setValue(Math.max(0, Math.min(max, g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        const max = Math.max(0, wRef.current - KNOB - 8);
        if (g.dx >= max * 0.8) {
          Animated.timing(x, { toValue: max, duration: 120, useNativeDriver: false }).start(() => onConfirm());
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: false }).start();
        }
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    wRef.current = e.nativeEvent.layout.width;
    setW(e.nativeEvent.layout.width);
  };

  return (
    <View style={styles.slideTrack} onLayout={onLayout}>
      <Text style={[font(700), { color: '#fff', fontSize: 15 }]}>Slide to confirm handoff</Text>
      <Animated.View style={[styles.slideKnob, { transform: [{ translateX: x }] }]} {...pan.panHandlers}>
        <Icon name="chevron_right" size={26} color={colors.primary} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { marginTop: 20, backgroundColor: 'rgba(47,177,131,0.08)', borderWidth: 1, borderColor: 'rgba(47,177,131,0.2)', borderRadius: 16, padding: 16 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  disclosure: { flexDirection: 'row', gap: 10, marginTop: 14, backgroundColor: 'rgba(44,110,143,0.07)', borderRadius: 14, padding: 14 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.65)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13 },
  slideTrack: {
    height: 60,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideKnob: {
    position: 'absolute',
    left: 4,
    width: 52,
    height: 52,
    borderRadius: 13,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
