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

const FACTORS = [
  { icon: 'calendar_today', rank: 'EXCELLENT', rankColor: colors.mint, title: 'Payment History', desc: '100% on-time payments in the last 36 months.', bar: 1 },
  { icon: 'account_balance_wallet', rank: 'FAIR', rankColor: colors.amber, title: 'Credit Mix', desc: 'You mostly have unsecured personal loans.', bar: 0.6 },
];

const IMPROVE = [
  { n: '1', title: 'Reduce Credit Utilization', desc: 'Keep card spending below 30% of your total limit.' },
  { n: '2', title: 'Consolidate High-Interest Debt', desc: 'A single EMI is easier to track than multiple micro-loans.' },
  { n: '3', title: 'Avoid New Enquiries', desc: 'Wait at least 3 months before applying again.' },
];

export default function CreditScore() {
  const { go } = useStore();
  const [target, setTarget] = React.useState(750);
  const [delta0, setDelta0] = React.useState(12);
  React.useEffect(() => {
    if (!isAuthed()) return;
    api.creditScore().then((r: any) => { setTarget(r.score ?? 750); setDelta0(r.delta ?? 12); }).catch(() => {});
  }, []);
  const t = useDrive(1300);
  const score = Math.round(target * t);
  const delta = Math.round(delta0 * t);
  const ang = Math.PI * (1 - (0.75 * (target / 750)) * t);
  const knobCx = 100 + 82 * Math.cos(ang);
  const knobCy = 100 - 82 * Math.sin(ang);
  const { width } = useWindowDimensions();
  const gaugeW = Math.min(width - 72, 320);
  const gaugeH = gaugeW * (108 / 200);

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader onBack={() => go('repay')} title="Credit Score" />
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
            <View style={styles.goodPill}><Text style={[font(700), { fontSize: 11, color: colors.greenDeep }]}>GOOD</Text></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Icon name="arrow_upward" size={14} color={colors.mint} />
              <Text style={[font(700), { fontSize: 12.5, color: colors.mint }]}>+{delta} pts</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 }}>
            <Icon name="verified" size={14} color={colors.muted} />
            <Text style={[font(500), { fontSize: 11, color: colors.muted }]}>Updated on 12 Oct 2023</Text>
          </View>
        </View>

        <Text style={[font(800), { fontSize: 17, color: colors.text, marginTop: 24, marginBottom: 12 }]}>Factors affecting your score</Text>
        <View style={{ gap: 12 }}>
          {FACTORS.map(f => (
            <View key={f.title} style={styles.factor}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={styles.fIcon}><Icon name={f.icon} size={18} color={colors.primary} /></View>
                <Text style={[font(700), { fontSize: 10.5, color: f.rankColor, letterSpacing: 0.3 }]}>{f.rank}</Text>
              </View>
              <Text style={[font(700), { fontSize: 14.5, color: colors.text, marginTop: 10 }]}>{f.title}</Text>
              <Text style={[font(400), { fontSize: 12, color: colors.textSoft, marginTop: 1 }]}>{f.desc}</Text>
              <View style={styles.barTrack}><View style={[styles.barFill, { width: `${f.bar * 100 * t}%`, backgroundColor: f.rankColor }]} /></View>
            </View>
          ))}
          <View style={styles.enquiry}>
            <View style={styles.fIcon}><Icon name="search" size={18} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[font(700), { fontSize: 14, color: colors.text }]}>Hard Enquiries</Text>
                <Text style={[font(600), { fontSize: 10.5, color: colors.red }]}>High Impact</Text>
              </View>
              <Text style={[font(400), { fontSize: 12, color: colors.textSoft, marginTop: 1 }]}>3 enquiries in the last 30 days.</Text>
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
          CIBIL score is provided by TransUnion CIBIL, based on data from financial institutions as of the last update date.
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
