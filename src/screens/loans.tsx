import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { Loading } from '../components/common/Loading';
import { ErrorState } from '../components/common/ErrorState';
import { Empty } from '../components/common/Empty';
import { colors, font, rupee } from '../theme/tokens';
import { useStore } from '../state/store';
import { api, isAuthed } from '../api/client';
import { displayLenderName } from './offers';

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

/** "25 Aug 2026 at 2:44 PM" — the application's most recent update. */
function formatDateTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return `${date} at ${time}`;
}

export default function Loans() {
  const { set, go } = useStore();
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(isAuthed());
  const [err, setErr] = useState<string | null>(null);

  // `silent` refreshes (the background poll) skip the full-screen spinner so the
  // list updates in place as lender webhooks change each application's status.
  const load = useCallback(async (silent = false) => {
    if (!isAuthed()) { setLoading(false); return; }
    if (!silent) { setErr(null); setLoading(true); }
    try {
      const { applications }: any = await api.listApplications();
      const list = applications || [];
      setApps(list);
    } catch (e: any) {
      if (!silent) setErr(e?.message || 'Could not load your loans.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);
  // Load on open, then poll silently so lender status updates (pushed to the
  // backend via the KFT status webhook) surface in near-real-time while viewing.
  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 20000);
    return () => clearInterval(id);
  }, [load]);

  const open = (app: any, offer?: any) => {
    set({ applicationId: app.id, loanId: app.loan?.id ?? null, selectedOfferId: offer?.id ?? null });
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

    const updated = formatDateTime(app.updatedAt);

    if (appliedOffers.length > 0) {
      return appliedOffers.map((o: any) => {
        const st = o.lenderStatus || 'handoff';
        const meta = STATUS_META[st] || { label: st, color: colors.muted };
        const apr = app.loan?.apr ?? o.apr ?? o.roi ?? null;
        const midMetric = app.loan
          ? { label: 'Next EMI', value: rupee(app.loan.emiAmount) }
          : apr != null
            ? { label: 'Interest', value: `${apr}% p.a.` }
            : { label: 'Status', value: meta.label };
        return (
          <AppCard
            key={o.id}
            icon={TYPE_ICON[app.loanType] || 'account_balance'}
            name={displayLenderName(o.lenderName) || typeName}
            ref_={`Ref ${app.ref}`}
            typeLabel={typeName}
            status={meta.label}
            statusColor={meta.color}
            logoUrl={o.lenderLogoUrl}
            updated={updated}
            metrics={[
              { label: 'Amount', value: rupee(o.amount ?? app.amount) },
              midMetric,
            ]}
            onPress={() => open(app, o)}
          />
        );
      });
    }

    // Eligibility completed — Aurix returned offers (the eligibility_check
    // webhook succeeded) but the user hasn't picked/applied to a specific lender
    // yet. Surface it as a trackable in-progress application; tapping opens the
    // offers so they can review and apply.
    if ((app.offers || []).length > 0) {
      const meta = STATUS_META[app.status] || { label: 'In Progress', color: colors.amber };
      const aprs = (app.offers || []).map((o: any) => o.apr).filter((n: any) => typeof n === 'number' && n > 0);
      const bestApr = aprs.length ? Math.min(...aprs) : null;
      const n = app.offers.length;
      // Best/recommended offer drives the lender name + logo shown on the card.
      const rec = (app.offers || []).find((o: any) => o.recommended) ?? app.offers[0];
      const logoUrl = rec?.lenderLogoUrl ?? (app.offers || []).find((o: any) => o.lenderLogoUrl)?.lenderLogoUrl ?? null;
      return [(
        <AppCard
          key={app.id}
          icon={TYPE_ICON[app.loanType] || 'account_balance'}
          name={displayLenderName(rec?.lenderName) || typeName}
          ref_={`Ref ${app.ref}`}
          typeLabel={typeName}
          status={meta.label}
          statusColor={meta.color}
          logoUrl={logoUrl}
          updated={updated}
          metrics={[
            { label: 'Amount', value: rupee(app.amount) },
            bestApr != null ? { label: 'Rates from', value: `${bestApr}% p.a.` } : { label: 'Offers', value: `${n} matched` },
          ]}
          onPress={() => open(app)}
        />
      )];
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
          typeLabel={typeName}
          status={meta.label}
          statusColor={meta.color}
          updated={updated}
          metrics={[
            { label: 'Amount', value: rupee(app.amount) },
            { label: 'Next EMI', value: rupee(app.loan.emiAmount) },
          ]}
          onPress={() => open(app)}
        />
      )];
    }

    return [];
  });

  return (
    <Screen scroll bottomNav padded>
      <View style={{ marginTop: 8 }}>
        <Text style={[font(800), { fontSize: 27, letterSpacing: -0.6, color: colors.text }]}>My Loans</Text>
        <Text style={[font(400), { fontSize: 14, color: colors.textSoft, marginTop: 2 }]}>
          Track your applications and manage active loans.
        </Text>
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
              <Text style={[font(400), { fontSize: 12.5, color: colors.textSoft, marginTop: 1 }]}>See your offers and eligibility</Text>
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
  icon, name, ref_, typeLabel, updated, status, statusColor, metrics, onPress, logoUrl,
}: {
  icon: string; name: string; ref_: string; typeLabel?: string; updated?: string | null;
  status: string; statusColor: string;
  metrics: { label: string; value: string }[]; onPress: () => void;
  logoUrl?: string | null;
}) {
  // Line 3 combines the loan type and the last-updated time so neither truncates
  // in a cramped metric column.
  const line3 = [typeLabel, updated ? `Updated ${updated}` : null].filter(Boolean).join('  ·  ');
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={[styles.appIcon, logoUrl ? styles.appIconLogo : null]}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={{ width: 34, height: 34, borderRadius: 8 }} resizeMode="contain" />
          ) : (
            <Icon name={icon} size={20} color={colors.primary} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          {/* Line 1: lender name + status pill. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[font(700), { flex: 1, fontSize: 15, color: colors.text }]} numberOfLines={1}>{name}</Text>
            <View style={[styles.statusPill, { backgroundColor: statusColor + '22' }]}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
              <Text style={[font(600), { fontSize: 11, color: statusColor }]}>{status}</Text>
            </View>
          </View>
          {/* Line 2: reference. */}
          <Text style={[font(400), { fontSize: 12, color: colors.muted, marginTop: 2 }]} numberOfLines={1}>{ref_}</Text>
          {/* Line 3: loan type · updated time. */}
          {line3 ? (
            <Text style={[font(500), { fontSize: 11.5, color: colors.textSoft, marginTop: 2 }]} numberOfLines={1}>{line3}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.metaRow}>
        {metrics.map((m, i) => (
          <React.Fragment key={m.label}>
            {i > 0 ? <View style={styles.metaDiv} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.metaLabel} numberOfLines={1}>{m.label}</Text>
              <Text style={styles.metaVal} numberOfLines={1}>{m.value}</Text>
            </View>
          </React.Fragment>
        ))}
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
  appIconLogo: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line },
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
