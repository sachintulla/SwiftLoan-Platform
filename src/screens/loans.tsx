import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { Loading } from '../components/common/Loading';
import { ErrorState } from '../components/common/ErrorState';
import { Empty } from '../components/common/Empty';
import { colors, font, rupee } from '../theme/tokens';
import { useStore } from '../state/store';
import { api, isAuthed } from '../api/client';

const OFFER_STATUSES = ['offers_ready', 'handoff', 'under_review', 'approved', 'disbursed'];
const TYPE_ICON: Record<string, string> = {
  personal: 'bolt', business: 'business_center', home: 'home', education: 'school', vehicle: 'directions_car',
};
const STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: 'In Progress', color: colors.amber },
  pan_pending: { label: 'In Progress', color: colors.amber },
  prequalifying: { label: 'In Progress', color: colors.amber },
  offers_ready: { label: 'In Progress', color: colors.amber },
  handoff: { label: 'In Progress', color: colors.amber },
  under_review: { label: 'Under Review', color: colors.amber },
  approved: { label: 'Approved', color: colors.green },
  disbursed: { label: 'Active', color: colors.green },
  rejected: { label: 'Rejected', color: colors.red },
  failed: { label: 'Failed', color: colors.red },
  closed: { label: 'Closed', color: colors.muted },
};

export default function Loans() {
  const { set, go } = useStore();
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(isAuthed());
  const [err, setErr] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [hasOffers, setHasOffers] = useState(false);

  // `silent` refreshes (the background poll) skip the full-screen spinner so the
  // list updates in place as lender webhooks change each application's status.
  const load = useCallback(async (silent = false) => {
    if (!isAuthed()) { setLoading(false); return; }
    if (!silent) { setErr(null); setLoading(true); }
    try {
      const { applications }: any = await api.listApplications();
      const list = applications || [];
      setApps(list);
      // A real CIBIL score is only meaningful once offers have been pulled (soft check).
      setHasOffers(list.some((a: any) => (a.offers?.length ?? 0) > 0 && OFFER_STATUSES.includes(a.status)));
    } catch (e: any) {
      if (!silent) setErr(e?.message || 'Could not load your loans.');
    } finally {
      if (!silent) setLoading(false);
    }
    api.creditScore().then((r: any) => setScore(r?.score ?? null)).catch(() => setScore(null));
  }, []);
  // Load on open, then poll silently so lender status updates (pushed to the
  // backend via the KFT status webhook) surface in near-real-time while viewing.
  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 20000);
    return () => clearInterval(id);
  }, [load]);

  const open = (app: any) => {
    set({ applicationId: app.id, loanId: app.loan?.id ?? null });
    go(app.loan ? 'repay' : 'status');
  };

  // My Loans shows a card per lender the user ACTUALLY applied to — an applied
  // offer, which is created only after the lender confirms submission (post-OTP,
  // via the KFT webhook) — plus any active/disbursed loan. Bare eligibility runs
  // (offers pulled but no lender applied, no OTP, no webhook) are NOT shown: they
  // are not loan applications and were cluttering the list.
  const cards = apps.flatMap((app: any) => {
    const typeName = `${app.loanType[0].toUpperCase()}${app.loanType.slice(1)} Loan`;
    const appliedOffers = (app.offers || []).filter((o: any) => o.applied);

    if (appliedOffers.length > 0) {
      return appliedOffers.map((o: any) => {
        const st = o.lenderStatus || 'handoff';
        const meta = STATUS_META[st] || { label: st, color: colors.muted };
        const apr = app.loan?.apr ?? o.apr ?? o.roi ?? null;
        const appliedDate = o.appliedAt
          ? new Date(o.appliedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          : '';
        return (
          <AppCard
            key={o.id}
            icon={TYPE_ICON[app.loanType] || 'account_balance'}
            name={o.lenderName || typeName}
            ref_={`${typeName} · Ref ${app.ref}`}
            status={meta.label}
            statusColor={meta.color}
            left={{ label: 'Amount', value: rupee(o.amount ?? app.amount) }}
            right={
              app.loan
                ? { label: 'Next EMI', value: rupee(app.loan.emiAmount) }
                : apr != null
                  ? { label: 'Interest', value: `${apr}% p.a.` }
                  : { label: 'Applied', value: appliedDate }
            }
            onPress={() => open(app)}
          />
        );
      });
    }

    // Legacy safety net: an active/disbursed loan with no applied-offer tracking
    // still shows so existing loans never vanish.
    if (app.loan) {
      const meta = STATUS_META[app.status] || { label: app.status, color: colors.muted };
      return [(
        <AppCard
          key={app.id}
          icon={TYPE_ICON[app.loanType] || 'account_balance'}
          name={typeName}
          ref_={`Ref ${app.ref}`}
          status={meta.label}
          statusColor={meta.color}
          left={{ label: 'Amount', value: rupee(app.amount) }}
          right={{ label: 'Next EMI', value: rupee(app.loan.emiAmount) }}
          onPress={() => open(app)}
        />
      )];
    }

    return [];
  });

  return (
    <Screen scroll bottomNav padded>
      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={[font(800), { fontSize: 27, letterSpacing: -0.6, color: colors.text }]}>My Loans</Text>
          <Text style={[font(400), { fontSize: 14, color: colors.textSoft, marginTop: 2 }]}>
            Track your applications and manage active loans.
          </Text>
        </View>
        {/* CIBIL score chip. Real score once offers are pulled → tap opens the
            score screen; otherwise it nudges the user to get offers first. */}
        {hasOffers && score != null ? (
          <Pressable onPress={() => go('creditscore')} style={styles.scoreChip} accessibilityLabel="View CIBIL score">
            <Icon name="speed" size={16} color={colors.primary} />
            <View>
              <Text style={[font(500), { fontSize: 9.5, color: colors.textSoft }]}>CIBIL</Text>
              <Text style={[font(800), { fontSize: 15, color: colors.text, marginTop: -1 }]}>{score}</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable onPress={() => go('fare')} style={styles.scoreChipGhost} accessibilityLabel="Get your CIBIL score">
            <Icon name="speed" size={15} color={colors.primary} />
            <Text style={[font(600), { fontSize: 11, color: colors.primary, maxWidth: 92 }]}>Get real CIBIL score</Text>
          </Pressable>
        )}
      </View>

      <Text style={[font(800), { fontSize: 16, color: colors.text, marginTop: 20, marginBottom: 12 }]}>Your applications</Text>
      {loading ? (
        <Loading label="Loading your loans…" />
      ) : err ? (
        <ErrorState message={err} onRetry={load} />
      ) : cards.length === 0 ? (
        // Tracking-only screen: the single "Apply" entry lives on the Offers tab.
        // When there's nothing to track, offer a shortcut into that flow.
        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <Empty icon="account_balance_wallet" title="No applications yet" message="Check your offers to apply — your applications will show up here to track." />
          <Pressable onPress={() => go('fare')} style={styles.applyCard}>
            <View style={styles.applyIcon}>
              <Icon name="local_offer" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[font(700), { fontSize: 15.5, color: colors.text }]}>Check offers & apply</Text>
              <Text style={[font(400), { fontSize: 12.5, color: colors.textSoft, marginTop: 1 }]}>See your credit score and eligibility</Text>
            </View>
            <Icon name="arrow_forward" size={20} color={colors.primary} />
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: 12 }}>{cards}</View>
      )}
    </Screen>
  );
}

function AppCard({
  icon, name, ref_, status, statusColor, left, right, onPress,
}: {
  icon: string; name: string; ref_: string; status: string; statusColor: string;
  left: { label: string; value: string }; right: { label: string; value: string }; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
          <View style={styles.appIcon}>
            <Icon name={icon} size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[font(700), { fontSize: 14.5, color: colors.text }]}>{name}</Text>
            <Text style={[font(400), { fontSize: 12, color: colors.muted }]}>{ref_}</Text>
          </View>
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusColor + '22' }]}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
          <Text style={[font(600), { fontSize: 11, color: statusColor }]}>{status}</Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <View>
          <Text style={styles.metaLabel}>{left.label}</Text>
          <Text style={styles.metaVal}>{left.value}</Text>
        </View>
        <View style={styles.metaDiv} />
        <View style={{ flex: 1 }}>
          <Text style={styles.metaLabel}>{right.label}</Text>
          <Text style={styles.metaVal}>{right.value}</Text>
        </View>
        <Icon name="chevron_right" size={20} color={colors.muted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scoreChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: colors.chip, borderRadius: 14, borderWidth: 1, borderColor: colors.line,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  scoreChipGhost: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.chip, borderRadius: 14, borderWidth: 1, borderColor: colors.line,
    paddingVertical: 8, paddingHorizontal: 12,
  },
  applyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 20,
    padding: 16,
  },
  applyIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 18,
    padding: 14,
  },
  appIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 9999, paddingVertical: 4, paddingHorizontal: 9 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  metaDiv: { width: 1, height: 26, backgroundColor: colors.lineSoft },
  metaLabel: { ...font(400), fontSize: 11, color: colors.muted },
  metaVal: { ...font(700), fontSize: 13.5, color: colors.text, marginTop: 1 },
  closedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(240,243,242,0.7)',
    borderRadius: 16,
    padding: 14,
  },
});
