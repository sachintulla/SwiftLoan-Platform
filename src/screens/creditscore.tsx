import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';
import { useDrive } from '../utils/useDrive';
import { api, isAuthed } from '../api/client';

const ARCS = [
  { d: 'M 18 100 A 82 82 0 0 1 44 40', color: '#EF6A5E' },
  { d: 'M 52 33 A 82 82 0 0 1 82 18', color: '#F5A624' },
  { d: 'M 91 15 A 82 82 0 0 1 121 18', color: '#E9C21F' },
  { d: 'M 130 22 A 82 82 0 0 1 158 42', color: '#7DC24B' },
  { d: 'M 165 51 A 82 82 0 0 1 182 100', color: '#2FB183' },
];

const BAND_LABEL: Record<string, { label: string; color: string }> = {
  EXCELLENT: { label: 'EXCELLENT', color: colors.mint },
  GOOD: { label: 'GOOD', color: colors.mint },
  FAIR: { label: 'FAIR', color: colors.amber },
  POOR: { label: 'POOR', color: colors.red },
};

const IMPROVE = [
  { n: '1', title: 'Reduce Credit Utilization', desc: 'Keep card spending below 30% of your total limit.' },
  { n: '2', title: 'Consolidate High-Interest Debt', desc: 'A single EMI is easier to track than multiple micro-loans.' },
  { n: '3', title: 'Avoid New Enquiries', desc: 'Wait at least 3 months before applying again.' },
];

export default function CreditScore() {
  const { back } = useStore();
  const [target, setTarget] = React.useState(750);
  const [band, setBand] = React.useState<string>('GOOD');
  React.useEffect(() => {
    if (!isAuthed()) return;
    api.creditScore().then((r: any) => { setTarget(r.score ?? 750); setBand(r.band ?? 'GOOD'); }).catch(() => {});
  }, []);
  const t = useDrive(1300);
  const score = Math.round(target * t);
  const bandInfo = BAND_LABEL[band] ?? BAND_LABEL.GOOD;
  const ang = Math.PI * (1 - (0.75 * (target / 750)) * t);
  const knobCx = 100 + 82 * Math.cos(ang);
  const knobCy = 100 - 82 * Math.sin(ang);
  const { width } = useWindowDimensions();
  const gaugeW = Math.min(width - 72, 320);
  const gaugeH = gaugeW * (108 / 200);

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader onBack={back} title="Credit Score" />
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        {/* Gauge card */}
        <View style={styles.gaugeCard}>
          <Text style={[font(600), { fontSize: 12.5, color: colors.textSoft }]}>Current CIBIL Score</Text>
          <View style={{ width: gaugeW, height: gaugeH, marginTop: 10 }}>
            <Svg width={gaugeW} height={gaugeH} viewBox="0 0 200 108">
              {ARCS.map((a, i) => (
                <Path key={i} d={a.d} fill="none" stroke={a.color} strokeWidth={13} strokeLinecap="round" />
              ))}
              <Circle cx={knobCx} cy={knobCy} r={8} fill="#fff" stroke={colors.mint} strokeWidth={4} />
            </Svg>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: gaugeW }}>
            <Text style={[font(500), { fontSize: 11, color: colors.muted }]}>300</Text>
            <Text style={[font(500), { fontSize: 11, color: colors.muted }]}>900</Text>
          </View>
          <Text style={[font(800), { fontSize: 44, color: colors.text, marginTop: 8 }]}>{score}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.goodPill, { backgroundColor: bandInfo.color + '24' }]}>
              <Text style={[font(700), { fontSize: 11, color: bandInfo.color }]}>{bandInfo.label}</Text>
            </View>
          </View>
        </View>

        <View style={styles.improve}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="trending_up" size={20} color={colors.primary} />
            <Text style={[font(800), { fontSize: 17, color: colors.text }]}>How to improve?</Text>
          </View>
          <View style={{ gap: 14, marginTop: 14 }}>
            {IMPROVE.map(s => (
              <View key={s.n} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={styles.num}><Text style={[font(800), { fontSize: 13, color: colors.primary }]}>{s.n}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[font(700), { fontSize: 14, color: colors.text }]}>{s.title}</Text>
                  <Text style={[font(400), { fontSize: 12, lineHeight: 17, color: colors.textSoft, marginTop: 1 }]}>{s.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <Text style={[font(400), { fontSize: 10.5, lineHeight: 15, color: colors.muted, marginTop: 18 }]}>
          This score is calculated by SwiftLoan and may differ from the score reported by credit bureaus.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gaugeCard: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 20, padding: 18, marginTop: 6 },
  goodPill: { backgroundColor: 'rgba(47,177,131,0.14)', borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 4 },
  factor: { backgroundColor: 'rgba(255,255,255,0.65)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 16, padding: 14 },
  fIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(120,150,148,0.18)', marginTop: 12, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  enquiry: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.65)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 16, padding: 14 },
  improve: { backgroundColor: 'rgba(255,255,255,0.65)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 18, padding: 16, marginTop: 24 },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(7,159,160,0.12)', alignItems: 'center', justifyContent: 'center' },
});
