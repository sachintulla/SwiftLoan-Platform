import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Pressable } from 'react-native';
import { Slider } from './Controls';
import { colors, font, inr } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { useVoiceTarget } from '../voice/useVoiceTarget';

// Ported from fareCalc(): amortised EMI with ±spread, shown as an indicative range.
function fareCalc(P: number, n: number, ratePct: number) {
  const r = ratePct / 12 / 100;
  const emi = r === 0 ? P / n : (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const payable = emi * n;
  const interest = payable - P;
  const rng = (v: number, lo: number, hi: number) => `₹${inr(v * lo)} – ₹${inr(v * hi)}`;
  return {
    emi: rng(emi, 0.92, 1.08),
    interest: rng(interest, 0.85, 1.15),
    payable: rng(payable, 0.95, 1.05),
  };
}

export function EmiCalculator({ onApply }: { onApply: () => void }) {
  const t = useT();
  const { state, set } = useStore();
  const { fareAmount, fareTenure, fareRate } = state;
  const calc = fareCalc(fareAmount, fareTenure, fareRate);

  // Raw <Pressable> inside a child component, so the screen-level element walk
  // cannot see it — register it directly.
  useVoiceTarget(t.fareApply, { kind: 'button', onTap: onApply }, [onApply]);

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.panel}>
        <SliderRow
          label={t.fareAmountLabel}
          value={`₹${inr(fareAmount)}`}
          min="₹25,000"
          max="₹5,00,000"
        >
          <Slider
            label={t.fareAmountLabel}
            value={fareAmount}
            min={25000}
            max={500000}
            step={5000}
            onChange={v => set({ fareAmount: v })}
          />
        </SliderRow>
        <SliderRow label={t.fareTenureLabel} value={`${fareTenure} ${t.months}`} min="6" max="60">
          <Slider
            label={t.fareTenureLabel}
            value={fareTenure}
            min={6}
            max={60}
            step={1}
            onChange={v => set({ fareTenure: v })}
          />
        </SliderRow>
        <SliderRow label={t.fareRateLabel} value={`${fareRate}% p.a.`} min="8%" max="36%">
          <Slider
            label={t.fareRateLabel}
            value={fareRate}
            min={8}
            max={36}
            step={0.5}
            onChange={v => set({ fareRate: v })}
          />
        </SliderRow>
        <Text style={[font(400), { fontSize: 11.5, color: colors.muted, marginTop: 4 }]}>{t.fareNote}</Text>
      </View>

      <View style={styles.result}>
        <Text style={[font(600), { fontSize: 13, color: 'rgba(255,255,255,0.85)' }]}>{t.fareEmiLabel}</Text>
        <Text style={[font(800), { fontSize: 22, color: '#fff', marginTop: 2 }]}>{calc.emi}</Text>
        <View style={styles.resRow}>
          <Text style={styles.resLabel}>{t.fareTotalInterest}</Text>
          <Text style={styles.resVal}>{calc.interest}</Text>
        </View>
        <View style={styles.resRow}>
          <Text style={styles.resLabel}>{t.fareTotalPayable}</Text>
          <Text style={styles.resVal}>{calc.payable}</Text>
        </View>
        <View style={{ height: 12 }} />
        <Pressable onPress={onApply} style={({ pressed }) => [styles.applyBtn, pressed && { opacity: 0.9 }]}>
          <Text style={[font(700), { color: colors.primary, fontSize: 15 }]}>{t.fareApply}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  children,
}: {
  label: string;
  value: string;
  min: string;
  max: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
        <Text style={[font(600), { fontSize: 13, color: colors.textMid }]}>{label}</Text>
        <Text style={[font(700), { fontSize: 14, color: colors.primary }]}>{value}</Text>
      </View>
      {children}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={[font(400), { fontSize: 10.5, color: colors.muted }]}>{min}</Text>
        <Text style={[font(400), { fontSize: 10.5, color: colors.muted }]}>{max}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 20,
    padding: 16,
  },
  result: {
    backgroundColor: colors.ink,
    borderRadius: 20,
    padding: 18,
  },
  resRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  resLabel: { ...font(500), fontSize: 12.5, color: 'rgba(255,255,255,0.7)' },
  resVal: { ...font(700), fontSize: 13, color: '#fff' },
  applyBtn: { height: 50, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
