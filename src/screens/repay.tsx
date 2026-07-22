import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { colors, font, inr, rupee } from '../theme/tokens';
import { useStore } from '../state/store';
import { useDrive } from '../utils/useDrive';
import { api, isAuthed } from '../api/client';

const HISTORY = [
  { icon: 'check_circle', title: 'September Installment', meta: 'Paid Sep 14, 2023 · #PAY-9921', amount: '₹1,240', status: 'Paid', color: colors.mint },
  { icon: 'check_circle', title: 'August Installment', meta: 'Paid Aug 15, 2023 · #PAY-8210', amount: '₹1,240', status: 'Paid', color: colors.mint },
  { icon: 'schedule', title: 'Late Fee Adjustment', meta: 'Pending Verification · #ADJ-1102', amount: '₹25', status: 'Pending', color: colors.amber },
];

export default function Repay() {
  const { state, go } = useStore();
  const [L, setL] = React.useState<any>(null);

  React.useEffect(() => {
    if (!isAuthed()) return;
    (async () => {
      try {
        let loanId = state.loanId;
        if (!loanId) {
          const { loans }: any = await api.listLoans();
          loanId = loans?.[0]?.id;
        }
        if (loanId) setL(await api.getLoan(loanId));
      } catch { /* keep demo figures */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = useDrive(1200);
  // Real values when a loan is loaded; otherwise the design's demo figures.
  const loan = L?.loan;
  const summary = L?.summary;
  const nextDue = loan?.repayments?.find((r: any) => r.status !== 'paid');
  const refLabel = loan ? `Active Loan · #${loan.ref}` : 'Active Loan · #SL-88429';
  const nextAmount = nextDue ? `${rupee(nextDue.amount)}.00` : '₹1,240.00';
  const nextDueLabel = nextDue
    ? 'Due ' + new Date(nextDue.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Due Oct 15, 2023';
  const pctTarget = summary ? summary.progressPct : 65;
  const repaidPct = Math.round(pctTarget * t);
  const principalTarget = summary ? summary.repaid : 32500;
  const remainingTarget = summary ? summary.outstanding : 17500;
  const interestTarget = loan ? Math.round(loan.principal * 0.027) : 4120;

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader onBack={() => go('home')} title={<View />} />
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        <Text style={[font(800), { fontSize: 24, letterSpacing: -0.5, color: colors.text }]}>Repayment Overview</Text>
        <Text style={[font(400), { fontSize: 13.5, color: colors.textSoft, marginTop: 4 }]}>Manage your active loan installments.</Text>

        <View style={styles.card}>
          <Text style={[font(600), { fontSize: 12, color: colors.primary }]}>{refLabel}</Text>
          <View style={styles.nextRow}>
            <View>
              <Text style={[font(400), { fontSize: 12, color: colors.textSoft }]}>Next Payment</Text>
              <Text style={[font(800), { fontSize: 24, color: colors.text }]}>{nextAmount}</Text>
            </View>
            <View style={styles.due}>
              <Icon name="event_upcoming" size={15} color={colors.amber} />
              <Text style={[font(600), { fontSize: 11.5, color: colors.amber }]}>{nextDueLabel}</Text>
            </View>
          </View>

          <View style={styles.divider} />
          <Text style={[font(700), { fontSize: 14, color: colors.text }]}>Loan Progress</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 12 }}>
            <ProgressRing pct={repaidPct} />
            <View style={{ flex: 1, gap: 8 }}>
              <Line label="Principal Repaid" value={'₹' + inr(principalTarget * t)} />
              <Line label="Remaining Balance" value={'₹' + inr(remainingTarget * t)} />
              <View style={{ height: 1, backgroundColor: colors.lineSoft }} />
              <Line label="Interest Paid" value={'₹' + inr(interestTarget * t)} />
            </View>
          </View>

          <View style={styles.onTrack}>
            <Icon name="verified" size={18} color={colors.mint} />
            <View style={{ flex: 1 }}>
              <Text style={[font(700), { fontSize: 13, color: colors.greenDeep }]}>On Track</Text>
              <Text style={[font(400), { fontSize: 11.5, lineHeight: 16, color: colors.textSoft }]}>You've saved ₹450 in projected interest by making early payments.</Text>
            </View>
          </View>
        </View>

        <Pressable style={styles.scoreCard} onPress={() => go('creditscore')}>
          <View style={styles.scoreIcon}><Icon name="speed" size={20} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[font(700), { fontSize: 14.5, color: colors.text }]}>Credit Score</Text>
            <Text style={[font(400), { fontSize: 12, color: colors.textSoft }]}>Your CIBIL is 750 · Good</Text>
          </View>
          <Icon name="chevron_right" size={20} color={colors.muted} />
        </Pressable>

        <Text style={[font(800), { fontSize: 16, color: colors.text, marginTop: 24, marginBottom: 12 }]}>Payment History</Text>
        <View style={{ gap: 10 }}>
          {HISTORY.map(h => (
            <View key={h.meta} style={styles.histRow}>
              <View style={[styles.histIcon, { backgroundColor: h.color + '22' }]}>
                <Icon name={h.icon} size={18} color={h.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[font(700), { fontSize: 13.5, color: colors.text }]}>{h.title}</Text>
                <Text style={[font(400), { fontSize: 11.5, color: colors.muted }]}>{h.meta}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[font(700), { fontSize: 14, color: colors.text }]}>{h.amount}</Text>
                <Text style={[font(600), { fontSize: 10.5, color: h.color }]}>{h.status}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.legal}>
          <Icon name="gavel" size={16} color={colors.textSoft} />
          <View style={{ flex: 1 }}>
            <Text style={[font(700), { fontSize: 12.5, color: colors.textMid }]}>Legal Disclosure</Text>
            <Text style={[font(400), { fontSize: 11, lineHeight: 16, color: colors.muted, marginTop: 2 }]}>
              Interest is calculated daily. Late fees may apply if Auto-Debit fails due to insufficient funds. Review your <Text style={{ color: colors.primary }}>Loan Agreement</Text> for full terms.
            </Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const size = 92, stroke = 10, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(120,150,148,0.18)" strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.mint} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </Svg>
      <Text style={[font(800), { fontSize: 20, color: colors.text }]}>{pct}%</Text>
      <Text style={[font(500), { fontSize: 10, color: colors.textSoft, position: 'absolute', bottom: 24 }]}>Repaid</Text>
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={[font(500), { fontSize: 12.5, color: colors.textSoft }]}>{label}</Text>
      <Text style={[font(700), { fontSize: 12.5, color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 20, padding: 16, marginTop: 20 },
  nextRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 8 },
  due: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(245,166,36,0.12)', borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 5 },
  divider: { height: 1, backgroundColor: colors.lineSoft, marginVertical: 14 },
  onTrack: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: 'rgba(47,177,131,0.08)', borderRadius: 12, padding: 12, marginTop: 14 },
  scoreCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 16, padding: 14, marginTop: 14 },
  scoreIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.65)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 14, padding: 12 },
  histIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  legal: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 16 },
});
