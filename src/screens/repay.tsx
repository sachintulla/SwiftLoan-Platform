import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { Loading } from '../components/common/Loading';
import { ErrorState } from '../components/common/ErrorState';
import { Empty } from '../components/common/Empty';
import { colors, font, inr, rupee } from '../theme/tokens';
import { useStore } from '../state/store';
import { useDrive } from '../utils/useDrive';
import { api, isAuthed } from '../api/client';

const REPAYMENT_STATUS: Record<string, { icon: string; label: string; color: string }> = {
  paid: { icon: 'check_circle', label: 'Paid', color: colors.mint },
  pending: { icon: 'schedule', label: 'Pending', color: colors.amber },
  scheduled: { icon: 'event', label: 'Upcoming', color: colors.textSoft },
  late: { icon: 'error', label: 'Late', color: colors.red },
};

export default function Repay() {
  const { state, go, back } = useStore();
  const [L, setL] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(isAuthed());
  const [err, setErr] = React.useState<string | null>(null);
  const [score, setScore] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    if (!isAuthed()) { setLoading(false); return; }
    setErr(null); setLoading(true);
    try {
      let loanId = state.loanId;
      if (!loanId) {
        const { loans }: any = await api.listLoans();
        loanId = loans?.[0]?.id;
      }
      if (loanId) setL(await api.getLoan(loanId));
      else setL(null);
    } catch (e: any) {
      setErr(e?.message || 'Could not load your loan.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    load();
    if (isAuthed()) api.creditScore().then((r: any) => setScore(r.score ?? null)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = useDrive(1200);
  const loan = L?.loan;
  const summary = L?.summary;
  const repayments: any[] = loan?.repayments ?? [];
  const nextDue = repayments.find((r: any) => r.status !== 'paid');
  const refLabel = loan ? `Active Loan · #${loan.ref}` : '';
  const nextAmount = nextDue ? `${rupee(nextDue.amount)}` : null;
  const nextDueLabel = nextDue
    ? 'Due ' + new Date(nextDue.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;
  const pctTarget = summary?.progressPct ?? 0;
  const repaidPct = Math.round(pctTarget * t);
  const principalTarget = summary?.repaid ?? 0;
  const remainingTarget = summary?.outstanding ?? 0;

  const history = repayments
    .slice()
    .sort((a: any, b: any) => new Date(b.paidDate ?? b.dueDate).getTime() - new Date(a.paidDate ?? a.dueDate).getTime());

  if (loading) {
    return (
      <Screen scroll={false} padded>
        <View style={{ paddingHorizontal: 20 }}><AppHeader onBack={back} title={<View />} /></View>
        <Loading label="Loading your loan…" />
      </Screen>
    );
  }
  if (err) {
    return (
      <Screen scroll={false} padded>
        <View style={{ paddingHorizontal: 20 }}><AppHeader onBack={back} title={<View />} /></View>
        <ErrorState message={err} onRetry={load} />
      </Screen>
    );
  }

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader onBack={back} title={<View />} />
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        <Text style={[font(800), { fontSize: 24, letterSpacing: -0.5, color: colors.text }]}>Repayment Overview</Text>
        <Text style={[font(400), { fontSize: 13.5, color: colors.textSoft, marginTop: 4 }]}>Manage your active loan installments.</Text>

        {!loan ? (
          <Empty icon="account_balance_wallet" title="No active loan" message="Once a loan is disbursed, its repayment schedule will show up here." />
        ) : (
        <>
        <View style={styles.card}>
          <Text style={[font(600), { fontSize: 12, color: colors.primary }]}>{refLabel}</Text>
          <View style={styles.nextRow}>
            <View>
              <Text style={[font(400), { fontSize: 12, color: colors.textSoft }]}>Next Payment</Text>
              <Text style={[font(800), { fontSize: 24, color: colors.text }]}>{nextAmount ?? '—'}</Text>
            </View>
            {nextDueLabel ? (
              <View style={styles.due}>
                <Icon name="event_upcoming" size={15} color={colors.amber} />
                <Text style={[font(600), { fontSize: 11.5, color: colors.amber }]}>{nextDueLabel}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.divider} />
          <Text style={[font(700), { fontSize: 14, color: colors.text }]}>Loan Progress</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 12 }}>
            <ProgressRing pct={repaidPct} />
            <View style={{ flex: 1, gap: 8 }}>
              <Line label="Principal Repaid" value={'₹' + inr(principalTarget * t)} />
              <Line label="Remaining Balance" value={'₹' + inr(remainingTarget * t)} />
            </View>
          </View>
        </View>

        <Pressable style={styles.scoreCard} onPress={() => go('creditscore')}>
          <View style={styles.scoreIcon}><Icon name="speed" size={20} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[font(700), { fontSize: 14.5, color: colors.text }]}>Credit Score</Text>
            <Text style={[font(400), { fontSize: 12, color: colors.textSoft }]}>{score != null ? `Your score is ${score}` : 'View your credit score'}</Text>
          </View>
          <Icon name="chevron_right" size={20} color={colors.muted} />
        </Pressable>

        <Text style={[font(800), { fontSize: 16, color: colors.text, marginTop: 24, marginBottom: 12 }]}>Payment History</Text>
        {history.length === 0 ? (
          <Empty icon="receipt_long" title="No payments yet" message="Your installment history will appear here as payments are made." />
        ) : (
        <View style={{ gap: 10 }}>
          {history.map((r: any) => {
            const meta = REPAYMENT_STATUS[r.status] ?? REPAYMENT_STATUS.scheduled;
            const dateLabel = r.paidDate
              ? `Paid ${new Date(r.paidDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
              : `Due ${new Date(r.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
            return (
              <View key={r.id} style={styles.histRow}>
                <View style={[styles.histIcon, { backgroundColor: meta.color + '22' }]}>
                  <Icon name={meta.icon} size={18} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[font(700), { fontSize: 13.5, color: colors.text }]}>{dateLabel} · #{r.ref}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[font(700), { fontSize: 14, color: colors.text }]}>{rupee(r.amount)}</Text>
                  <Text style={[font(600), { fontSize: 10.5, color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
            );
          })}
        </View>
        )}
        </>
        )}

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
  scoreCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 16, padding: 14, marginTop: 14 },
  scoreIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.65)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 14, padding: 12 },
  histIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  legal: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 16 },
});
