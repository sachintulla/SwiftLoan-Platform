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

const TYPE_ICON: Record<string, string> = {
  personal: 'bolt', business: 'business_center', home: 'home', education: 'school', vehicle: 'directions_car',
};
const STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: 'In Progress', color: colors.amber },
  pan_pending: { label: 'In Progress', color: colors.amber },
  prequalifying: { label: 'In Progress', color: colors.amber },
  offers_ready: { label: 'Offers Ready', color: colors.amber },
  handoff: { label: 'In Progress', color: colors.amber },
  under_review: { label: 'Under Review', color: colors.amber },
  approved: { label: 'Approved', color: colors.green },
  disbursed: { label: 'Active', color: colors.green },
  rejected: { label: 'Rejected', color: colors.red },
  closed: { label: 'Closed', color: colors.muted },
};

export default function Loans() {
  const { set, go } = useStore();
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(isAuthed());
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthed()) { setLoading(false); return; }
    setErr(null); setLoading(true);
    try {
      const { applications }: any = await api.listApplications();
      setApps(applications || []);
    } catch (e: any) {
      setErr(e?.message || 'Could not load your loans.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = (app: any) => {
    set({ applicationId: app.id, loanId: app.loan?.id ?? null });
    go(app.loan ? 'repay' : 'status');
  };

  return (
    <Screen scroll bottomNav padded>
      <View style={{ marginTop: 8 }}>
        <Text style={[font(800), { fontSize: 27, letterSpacing: -0.6, color: colors.text }]}>My Loans</Text>
        <Text style={[font(400), { fontSize: 14, color: colors.textSoft, marginTop: 2 }]}>
          Track your applications and manage active loans.
        </Text>
      </View>

      {/* Apply CTA */}
      <Pressable onPress={() => go('basic')} style={styles.applyCard}>
        <View style={styles.applyIcon}>
          <Icon name="add" size={24} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[font(700), { fontSize: 15.5, color: colors.text }]}>Apply for a new loan</Text>
          <Text style={[font(400), { fontSize: 12.5, color: colors.textSoft, marginTop: 1 }]}>Check eligibility in ~2 minutes</Text>
        </View>
        <Icon name="arrow_forward" size={20} color={colors.primary} />
      </Pressable>

      <Text style={[font(800), { fontSize: 16, color: colors.text, marginTop: 26, marginBottom: 12 }]}>Your applications</Text>
      {loading ? (
        <Loading label="Loading your loans…" />
      ) : err ? (
        <ErrorState message={err} onRetry={load} />
      ) : apps.length === 0 ? (
        <Empty icon="account_balance_wallet" title="No applications yet" message="Apply for a loan above to see it tracked here." />
      ) : (
        <View style={{ gap: 12 }}>
          {apps.map(app => {
            const meta = STATUS_META[app.status] || { label: app.status, color: colors.muted };
            const applied = new Date(app.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            return (
              <AppCard
                key={app.id}
                icon={TYPE_ICON[app.loanType] || 'account_balance'}
                name={`${app.loanType[0].toUpperCase()}${app.loanType.slice(1)} Loan`}
                ref_={`Ref ${app.ref}`}
                status={meta.label}
                statusColor={meta.color}
                left={{ label: 'Amount', value: rupee(app.amount) }}
                right={app.loan ? { label: 'Next EMI', value: rupee(app.loan.emiAmount) } : { label: 'Applied', value: applied }}
                onPress={() => open(app)}
              />
            );
          })}
        </View>
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
