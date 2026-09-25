import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { Loading } from '../components/common/Loading';
import { ErrorState } from '../components/common/ErrorState';
import { Empty } from '../components/common/Empty';
import { colors, font, rupee } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { api, isAuthed } from '../api/client';
import { displayLenderName } from './offers';

const TYPE_ICON: Record<string, string> = {
  personal: 'bolt', business: 'business_center', home: 'home', education: 'school', vehicle: 'directions_car',
};
// Loan-type display name is "{translated type} {translated 'Loan'}" — reuses
// the same per-language type words as the home screen's "Browse loan types".
const TYPE_LABEL_KEY: Record<string, string> = {
  personal: 'ltPersonal', business: 'ltBusiness', home: 'ltHome', education: 'ltEducation', vehicle: 'ltVehicle',
};
// App-side hand-off outcome — its own state, shown alongside the lender status.
// Distinct from STATUS_META (the webhook-driven lender decision). Label keys
// resolved against the current t() at render time (see statusLabel/internalLabel below).
const INTERNAL_STATUS_META: Record<string, { key: string; color: string }> = {
  just_applied: { key: 'loanInternalJustApplied', color: colors.blue },
  success: { key: 'loanInternalSuccess', color: colors.green },
  failed: { key: 'loanInternalFailed', color: colors.red },
  error: { key: 'loanInternalError', color: colors.amber },
};

const STATUS_META: Record<string, { key: string; color: string }> = {
  draft: { key: 'statusInProgress', color: colors.amber },
  pan_pending: { key: 'statusInProgress', color: colors.amber },
  prequalifying: { key: 'statusInProgress', color: colors.amber },
  offers_ready: { key: 'statusInProgress', color: colors.amber },
  handoff: { key: 'statusInProgress', color: colors.amber },
  under_review: { key: 'statusUnderReview', color: colors.amber },
  approved: { key: 'statusApproved', color: colors.green },
  disbursed: { key: 'statusActive', color: colors.green },
  rejected: { key: 'statusRejected', color: colors.red },
  failed: { key: 'statusFailed', color: colors.red },
  closed: { key: 'statusClosed', color: colors.muted },
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
  const { set, mergeApiContext, go } = useStore();
  const t = useT();
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(isAuthed());
  const [err, setErr] = useState<string | null>(null);

  // `silent` refreshes (the background poll) skip the full-screen spinner so the
  // list updates in place as lender webhooks change each application's status.
  // The voice agent only gets a one-time snapshot from the initial, non-silent
  // load that fires on entering this screen — mergeApiContext is deliberately
  // NOT called from silent polls, even when they turn up a real change.
  // mergeApiContext always creates a new apiContext object, which store.ts
  // treats as "changed" and re-sends the full page_context to the voice agent
  // over the live socket; without this guard, that fired on every 20s poll
  // tick for as long as the user sat on this screen, silence included.
  const load = useCallback(async (silent = false) => {
    if (!isAuthed()) { setLoading(false); return; }
    if (!silent) { setErr(null); setLoading(true); }
    try {
      const { applications }: any = await api.listApplications();
      const list = applications || [];
      setApps(list);
      // Same criterion `cards` below uses to decide whether an application
      // gets a card at all: an offer someone actually applied to, or a real
      // loan. Sending the agent the raw, unfiltered list meant it would
      // describe applications the screen deliberately hides (bare
      // eligibility runs — offers checked, nobody applied to any lender) —
      // "I see these applications" while the person's own screen showed
      // none, because it isn't lying: those aren't applications by this
      // screen's own definition, and the agent shouldn't say otherwise.
      if (!silent) {
        const meaningful = list.filter((app: any) => (app.offers || []).some((o: any) => o.applied) || app.loan);
        mergeApiContext({ applications: meaningful });
      }
    } catch (e: any) {
      if (!silent) setErr(e?.message || t.loansErrLoad);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [mergeApiContext, t.loansErrLoad]);
  // Load on open, then poll silently so lender status updates (pushed to the
  // backend via the KFT status webhook) surface in near-real-time while viewing.
  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 20000);
    return () => clearInterval(id);
  }, [load]);

  // Open the drill-down tracker for a card: an active/disbursed loan goes to
  // its repayment view, anything still in flight to the application-status timeline.
  const open = (app: any, opts?: { offer?: any; lenderApp?: any }) => {
    set({
      applicationId: app.id,
      loanId: app.loan?.id ?? null,
      selectedOfferId: opts?.offer?.id ?? opts?.lenderApp?.offerId ?? null,
      selectedLenderApplicationId: opts?.lenderApp?.id ?? null,
    });
    go(app.loan ? 'repay' : 'status');
  };

  // My Loans shows ONE card per lender application. Each "Apply" from My Offers
  // creates a new LenderApplication, so the same lender can appear multiple times
  // — each with its own status, tracked independently by the KFT status webhook.
  // Bare eligibility runs (offers pulled but nothing applied to) are NOT shown.
  // Status/metric label lookups resolved against the current language.
  const tt: Record<string, string> = t as any;
  const statusLabel = (key: string, fallback: string) => tt[key] || fallback;

  const cards = apps.flatMap((app: any) => {
    const typeWord = tt[TYPE_LABEL_KEY[app.loanType]] || `${app.loanType[0].toUpperCase()}${app.loanType.slice(1)}`;
    const typeName = `${typeWord} ${t.loanWord}`;
    const lenderApps = (app.lenderApplications || []) as any[];

    if (lenderApps.length > 0) {
      return lenderApps.map((la: any) => {
        const meta = STATUS_META[la.status];
        const statusText = meta ? statusLabel(meta.key, la.status) : la.status;
        const statusColor = meta?.color || colors.muted;
        const internal = INTERNAL_STATUS_META[la.internalStatus] || INTERNAL_STATUS_META.just_applied;
        const isDisbursedLoan = la.status === 'disbursed' && app.loan;
        const apr = la.apr ?? app.loan?.apr ?? null;
        const midMetric = isDisbursedLoan
          ? { label: t.metricNextEmi, value: rupee(app.loan.emiAmount) }
          : la.emi != null
            ? { label: t.metricEmi, value: rupee(la.emi) }
            : apr != null
              ? { label: t.metricInterest, value: `${apr}% p.a.` }
              : { label: t.metricStatus, value: statusText };
        return (
          <AppCard
            key={la.id}
            icon={TYPE_ICON[app.loanType] || 'account_balance'}
            name={displayLenderName(la.lenderName) || typeName}
            ref_={`${t.refPrefix} ${app.ref}`}
            typeLabel={typeName}
            status={statusText}
            statusColor={statusColor}
            internalLabel={statusLabel(internal.key, la.internalStatus)}
            internalColor={internal.color}
            logoUrl={la.lenderLogoUrl}
            updated={formatDateTime(la.updatedAt || la.appliedAt)}
            updatedPrefix={t.updatedPrefix}
            metrics={[
              { label: t.metricAmount, value: rupee(la.amount ?? app.amount) },
              midMetric,
            ]}
            onPress={() => open(app, { lenderApp: la })}
          />
        );
      });
    }

    const updated = formatDateTime(app.updatedAt);

    // Legacy safety net: pre-LenderApplication data — an applied offer with no
    // LenderApplication row. Show one card per applied offer so old data keeps
    // rendering. New applies always go through lenderApplications above.
    const appliedOffers = (app.offers || []).filter((o: any) => o.applied);
    if (appliedOffers.length > 0) {
      return appliedOffers.map((o: any) => {
        const st = o.lenderStatus || 'handoff';
        const meta = STATUS_META[st];
        const statusText = meta ? statusLabel(meta.key, st) : st;
        const statusColor = meta?.color || colors.muted;
        const apr = app.loan?.apr ?? o.apr ?? o.roi ?? null;
        const midMetric = app.loan
          ? { label: t.metricNextEmi, value: rupee(app.loan.emiAmount) }
          : apr != null
            ? { label: t.metricInterest, value: `${apr}% p.a.` }
            : { label: t.metricStatus, value: statusText };
        return (
          <AppCard
            key={o.id}
            icon={TYPE_ICON[app.loanType] || 'account_balance'}
            name={displayLenderName(o.lenderName) || typeName}
            ref_={`${t.refPrefix} ${app.ref}`}
            typeLabel={typeName}
            status={statusText}
            statusColor={statusColor}
            logoUrl={o.lenderLogoUrl}
            updated={updated}
            updatedPrefix={t.updatedPrefix}
            metrics={[
              { label: t.metricAmount, value: rupee(o.amount ?? app.amount) },
              midMetric,
            ]}
            onPress={() => open(app, { offer: o })}
          />
        );
      });
    }

    // Legacy safety net: an active/disbursed loan with no applied-offer tracking
    // still shows so existing loans never vanish.
    if (app.loan) {
      const meta = STATUS_META[app.status];
      const statusText = meta ? statusLabel(meta.key, app.status) : app.status;
      const statusColor = meta?.color || colors.muted;
      return [(
        <AppCard
          key={app.id}
          icon={TYPE_ICON[app.loanType] || 'account_balance'}
          name={typeName}
          ref_={`${t.refPrefix} ${app.ref}`}
          typeLabel={typeName}
          status={statusText}
          statusColor={statusColor}
          updated={updated}
          updatedPrefix={t.updatedPrefix}
          metrics={[
            { label: t.metricAmount, value: rupee(app.amount) },
            { label: t.metricNextEmi, value: rupee(app.loan.emiAmount) },
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
        <Text style={[font(800), { fontSize: 27, letterSpacing: -0.6, color: colors.text }]}>{t.loansTitle}</Text>
        <Text style={[font(400), { fontSize: 14, color: colors.textSoft, marginTop: 2 }]}>
          {t.loansSub}
        </Text>
      </View>

      <Text style={[font(800), { fontSize: 16, color: colors.text, marginTop: 20, marginBottom: 12 }]}>{t.loansYourApps}</Text>
      {loading ? (
        <Loading label={t.loansLoading} />
      ) : err ? (
        <ErrorState message={err} onRetry={load} />
      ) : cards.length === 0 ? (
        // Tracking-only screen: the single "Apply" entry lives on the Offers tab.
        // When there's nothing to track, offer a shortcut into that flow.
        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <Empty icon="account_balance_wallet" title={t.loansEmptyTitle} message={t.loansEmptyMsg} />
          <Pressable onPress={() => go('fare')} style={styles.applyCard}>
            <View style={styles.applyIcon}>
              <Icon name="local_offer" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[font(700), { fontSize: 15.5, color: colors.text }]}>{t.loansCheckOffers}</Text>
              <Text style={[font(400), { fontSize: 12.5, color: colors.textSoft, marginTop: 1 }]}>{t.loansCheckOffersSub}</Text>
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
  icon, name, ref_, typeLabel, updated, updatedPrefix, status, statusColor, internalLabel, internalColor, metrics, onPress, logoUrl,
}: {
  icon: string; name: string; ref_: string; typeLabel?: string; updated?: string | null; updatedPrefix: string;
  status: string; statusColor: string;
  internalLabel?: string; internalColor?: string;
  metrics: { label: string; value: string }[]; onPress?: () => void;
  logoUrl?: string | null;
}) {
  // Line 3 combines the loan type and the last-updated time so neither truncates
  // in a cramped metric column.
  const line3 = [typeLabel, updated ? `${updatedPrefix} ${updated}` : null].filter(Boolean).join('  ·  ');
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
          {/* Line 4: app-side outcome (internal status) — its own state, separate
              from the lender's decision pill up top. */}
          {internalLabel && internalColor ? (
            <View style={[styles.internalChip, { backgroundColor: internalColor + '18', borderColor: internalColor + '44' }]}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: internalColor }} />
              <Text style={[font(700), { fontSize: 10.5, color: internalColor }]}>{internalLabel}</Text>
            </View>
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
  internalChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', marginTop: 6,
    borderRadius: 9999, borderWidth: 1, paddingVertical: 3, paddingHorizontal: 8,
  },
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
