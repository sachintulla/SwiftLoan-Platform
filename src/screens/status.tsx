import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { Loading } from '../components/common/Loading';
import { ErrorState } from '../components/common/ErrorState';
import { Empty } from '../components/common/Empty';
import { colors, font, rupee } from '../theme/tokens';
import { useStore } from '../state/store';
import { api, isAuthed } from '../api/client';

type StepState = 'done' | 'active' | 'pending';
type Step = { key: string; icon: string; title: string; desc: string; state: StepState; time?: string; danger?: boolean };

const STAGE_ORDER = ['applied', 'under_review', 'approved', 'disbursed'];

/** Map the application's status onto the 4-stage timeline. */
function buildSteps(app: any): Step[] {
  const created = app?.updatedAt || app?.createdAt;
  const appliedTime = created
    ? new Date(created).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : undefined;

  const base: Omit<Step, 'state'>[] = [
    { key: 'applied', icon: 'check', title: 'Applied', desc: 'Your application was submitted to the lender.', time: appliedTime },
    { key: 'under_review', icon: 'more_horiz', title: 'Under Review', desc: 'The lender is verifying your details. This usually takes 2–3 business days.' },
    { key: 'approved', icon: 'task_alt', title: 'Approved', desc: 'Your loan has been approved by the lender.' },
    { key: 'disbursed', icon: 'payments', title: 'Disbursed', desc: 'Funds are credited to your linked bank account.' },
  ];

  // Terminal negative outcomes replace the forward timeline with a single
  // clear end-state: 'rejected' = the lender declined; 'failed' = the
  // application couldn't be completed for a technical reason (lender API error,
  // web hand-off abandoned/errored, timeout).
  if (app?.status === 'rejected' || app?.status === 'failed') {
    const isFail = app.status === 'failed';
    return [
      { ...base[0], state: 'done' },
      isFail
        ? { key: 'failed', icon: 'error', title: 'Failed', desc: 'We couldn’t complete this application due to a technical issue. Please try again or choose another lender.', state: 'active', danger: true }
        : { key: 'rejected', icon: 'cancel', title: 'Rejected', desc: 'Unfortunately your application was not approved this time.', state: 'active', danger: true },
    ];
  }

  // handoff (offer selected) is the "applied" stage.
  const mapped = app?.status === 'handoff' ? 'applied' : app?.status;
  const allDone = mapped === 'disbursed';
  let cur = STAGE_ORDER.indexOf(mapped);
  if (cur === -1) cur = 0;
  // Applying is complete once submitted — show 'Applied' as done and 'Under
  // Review' as the active stage until the lender advances it.
  if (mapped === 'applied') cur = 1;
  return base.map((s, i) => ({ ...s, state: allDone ? 'done' : i < cur ? 'done' : i === cur ? 'active' : 'pending' }));
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  offers_ready: { label: 'Offers Ready', color: colors.amber },
  handoff: { label: 'Applied', color: colors.blue },
  under_review: { label: 'Under Review', color: colors.amber },
  approved: { label: 'Approved', color: colors.green },
  disbursed: { label: 'Disbursed', color: colors.green },
  rejected: { label: 'Rejected', color: colors.red },
  failed: { label: 'Failed', color: colors.red },
};

export default function Status() {
  const { state, mergeApiContext, back } = useStore();
  const [app, setApp] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthed() || !state.applicationId) { setLoading(false); return; }
    setErr(null); setLoading(true);
    try {
      const { application }: any = await api.getApplication(state.applicationId);
      setApp(application);
      mergeApiContext({ applicationDetail: application });
    } catch (e: any) {
      setErr(e?.message || 'Could not load your application.');
    } finally {
      setLoading(false);
    }
  }, [state.applicationId, mergeApiContext]);
  useEffect(() => { load(); }, [load]);

  // Prefer the specific LenderApplication the user opened from My Loans. Each
  // Apply creates its own LenderApplication, so this is the true per-application
  // record; fall back to the matching offer, then any applied/selected offer.
  const la = app
    ? (app.lenderApplications || []).find((x: any) => x.id === state.selectedLenderApplicationId) || null
    : null;
  const sel = app
    ? (app.offers || []).find((o: any) => o.id === (la?.offerId ?? state.selectedOfferId))
      || (app.offers || []).find((o: any) => o.applied || o.selected)
      || null
    : null;
  const apr = la?.apr ?? app?.loan?.apr ?? sel?.apr ?? sel?.roi ?? null;
  const emi = la?.emi ?? app?.loan?.emiAmount ?? sel?.emi ?? null;
  const tenure = la?.tenureMonths ?? app?.loan?.tenureMonths ?? sel?.tenureMonths ?? app?.tenureMonths ?? null;
  const lender = la?.lenderName ?? sel?.lenderName ?? app?.loan?.partnerName ?? null;
  const logoUrl = la?.lenderLogoUrl ?? sel?.lenderLogoUrl ?? null;
  const appliedAtIso = la?.appliedAt ?? sel?.appliedAt;
  const appliedOn = appliedAtIso
    ? new Date(appliedAtIso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  const processingFee = la?.processingFeeAmount ?? sel?.processingFeeAmount ?? null;
  const failureReason = la?.failureReason ?? sel?.failureReason ?? null;
  // The per-lender application's own status (from the webhook) is the source of
  // truth when present; fall back to the parent application status.
  const effStatus = la?.status ?? sel?.lenderStatus ?? app?.status;
  const meta = app ? STATUS_LABEL[effStatus] || { label: effStatus, color: colors.muted } : null;

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader onBack={back} title={<View />} />
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        {loading ? (
          <Loading label="Loading your application…" />
        ) : err ? (
          <ErrorState message={err} onRetry={load} />
        ) : !app ? (
          <Empty icon="description" title="No application yet" message="Apply for a loan to track its status here." />
        ) : (
          <>
            <Text style={[font(600), { fontSize: 12, letterSpacing: 0.3, color: colors.primary }]}>Loan Reference: {app.ref}</Text>
            {/* Lender identity — logo + name headline the details when the user
                opened a specific lender application from My Loans. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <View style={[styles.lenderLogo, logoUrl ? null : styles.lenderLogoFallback]}>
                {logoUrl ? (
                  <Image source={{ uri: logoUrl }} style={{ width: 40, height: 40, borderRadius: 9 }} resizeMode="contain" />
                ) : (
                  <Icon name="account_balance" size={22} color={colors.primary} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[font(800), { fontSize: 20, letterSpacing: -0.4, color: colors.text }]} numberOfLines={1}>
                  {lender || `${app.loanType[0].toUpperCase()}${app.loanType.slice(1)} Loan`}
                </Text>
                <Text style={[font(400), { fontSize: 12.5, color: colors.textSoft }]}>
                  {`${app.loanType[0].toUpperCase()}${app.loanType.slice(1)} Loan`}
                </Text>
              </View>
              {meta ? (
                <View style={[styles.statusPill, { backgroundColor: meta.color + '22' }]}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: meta.color }} />
                  <Text style={[font(600), { fontSize: 11, color: meta.color }]}>{meta.label}</Text>
                </View>
              ) : null}
            </View>

            {/* Real loan summary */}
            <View style={styles.summary}>
              <SummaryCell label="Amount" value={rupee(la?.amount ?? app.amount)} />
              <View style={styles.summaryDiv} />
              <SummaryCell label="Interest" value={apr != null ? `${apr}% p.a.` : '—'} />
              <View style={styles.summaryDiv} />
              <SummaryCell label={emi ? 'Monthly EMI' : 'Tenure'} value={emi ? rupee(emi) : tenure ? `${tenure} mo` : '—'} />
            </View>
            {(appliedOn || processingFee != null) ? (
              <View style={{ marginTop: 10, gap: 4 }}>
                {appliedOn ? (
                  <Text style={[font(500), { fontSize: 12.5, color: colors.textSoft }]}>
                    Applied on <Text style={[font(700), { color: colors.text }]}>{appliedOn}</Text>
                  </Text>
                ) : null}
                {processingFee != null ? (
                  <Text style={[font(500), { fontSize: 12.5, color: colors.textSoft }]}>
                    Processing fee <Text style={[font(700), { color: colors.text }]}>{rupee(processingFee)}</Text>
                  </Text>
                ) : null}
                {failureReason ? (
                  <Text style={[font(500), { fontSize: 12.5, color: colors.red }]}>{failureReason}</Text>
                ) : null}
              </View>
            ) : null}

            {/* Status timeline (driven by the real application status) */}
            <View style={{ marginTop: 24 }}>
              {buildSteps({ ...app, status: effStatus }).map((s, i, arr) => {
                const last = i === arr.length - 1;
                const done = s.state === 'done';
                const active = s.state === 'active';
                const tint = s.danger ? colors.red : done ? colors.mint : active ? colors.amber : colors.muted;
                return (
                  <View key={s.key} style={{ flexDirection: 'row', gap: 14 }}>
                    <View style={{ alignItems: 'center' }}>
                      <View style={[styles.node, { backgroundColor: done || active ? tint : '#EDF1F0' }]}>
                        <Icon name={s.icon} size={18} color={done || active ? '#fff' : colors.muted} />
                      </View>
                      {!last ? <View style={[styles.line, { backgroundColor: done ? colors.mint : colors.line }]} /> : null}
                    </View>
                    <View style={{ flex: 1, paddingBottom: last ? 0 : 20 }}>
                      <Text style={[font(700), { fontSize: 15, color: s.state === 'pending' ? colors.muted : colors.text }]}>{s.title}</Text>
                      <Text style={[font(400), { fontSize: 12.5, lineHeight: 18, color: colors.textSoft, marginTop: 2 }]}>{s.desc}</Text>
                      {s.time ? <Text style={[font(500), { fontSize: 11, color: colors.muted, marginTop: 4 }]}>{s.time}</Text> : null}
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={styles.verified}>
              <Icon name="verified_user" size={16} color={colors.mint} />
              <Text style={[font(400), { flex: 1, fontSize: 11, lineHeight: 16, color: colors.muted }]}>
                Status updates come directly from the lender. You'll be notified here of any required documents or next steps.
              </Text>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[font(500), { fontSize: 11, color: colors.muted }]}>{label}</Text>
      <Text style={[font(800), { fontSize: 15, color: colors.text, marginTop: 2 }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  lenderLogo: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  lenderLogoFallback: { backgroundColor: '#E1F3F3', borderColor: 'transparent' },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 18,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 16,
  },
  summaryDiv: { width: 1, height: 30, backgroundColor: colors.line },
  node: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, marginVertical: 4 },
  verified: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 20 },
});
