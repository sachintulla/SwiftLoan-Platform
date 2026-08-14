import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import Icon from './Icon';
import { Loading } from './common/Loading';
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
  handoff: { label: 'Applied', color: colors.blue },
  under_review: { label: 'Under Review', color: colors.amber },
  approved: { label: 'Approved', color: colors.green },
  disbursed: { label: 'Disbursed', color: colors.green },
  rejected: { label: 'Rejected', color: colors.red },
  closed: { label: 'Closed', color: colors.muted },
};

/**
 * Compact "My Loans" list for the Home dashboard — the applications a user has
 * in flight, moved here from the (now-Calculator) Loans tab. Renders nothing
 * for guests or when there are no applications, so it never leaves an empty
 * heading on the dashboard.
 */
export function MyLoansSection() {
  const { set, go } = useStore();
  const [apps, setApps] = useState<any[] | null>(null);

  const load = useCallback(async () => {
    if (!isAuthed()) { setApps([]); return; }
    try {
      const { applications }: any = await api.listApplications();
      setApps(applications || []);
    } catch {
      setApps([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!isAuthed()) return null;
  if (apps !== null && apps.length === 0) return null;

  const open = (app: any) => {
    set({ applicationId: app.id, loanId: app.loan?.id ?? null });
    // Not applied yet → let them pick an offer; otherwise show the status detail.
    go(app.status === 'offers_ready' ? 'offers' : 'status');
  };

  // Rendered inside the dashboard's "Manage your loans" section, so no heading
  // of its own — just the application cards.
  return (
    <View>
      {apps === null ? (
        <Loading label="Loading your loans…" />
      ) : (
        <View style={{ gap: 12 }}>
          {apps.slice(0, 3).map(app => {
            const meta = STATUS_META[app.status] || { label: app.status, color: colors.muted };
            const applied = new Date(app.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            const sel = (app.offers || []).find((o: any) => o.selected) || null;
            const apr = app.loan?.apr ?? sel?.apr ?? sel?.roi ?? null;
            const loanLabel = `${app.loanType[0].toUpperCase()}${app.loanType.slice(1)} Loan`;
            // Lender headlines the card (with its logo); the loan type is the subtitle.
            const lender = sel?.lenderName ?? app.loan?.partnerName ?? null;
            const logo = sel?.lenderLogoUrl ?? null;
            return (
              <Pressable key={app.id} onPress={() => open(app)} style={styles.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                    <View style={[styles.appIcon, logo && styles.appIconLogo]}>
                      {logo ? (
                        <Image source={{ uri: logo }} style={{ width: 34, height: 34 }} resizeMode="contain" />
                      ) : (
                        <Icon name={TYPE_ICON[app.loanType] || 'account_balance'} size={20} color={colors.primary} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[font(700), { fontSize: 14.5, color: colors.text }]} numberOfLines={1}>
                        {lender || loanLabel}
                      </Text>
                      <Text style={[font(400), { fontSize: 12, color: colors.muted }]} numberOfLines={1}>
                        {lender ? `${loanLabel} · Ref ${app.ref}` : `Ref ${app.ref}`}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: meta.color + '22' }]}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: meta.color }} />
                    <Text style={[font(600), { fontSize: 11, color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>
                <View style={styles.metaRow}>
                  <View>
                    <Text style={styles.metaLabel}>Amount</Text>
                    <Text style={styles.metaVal}>{rupee(app.amount)}</Text>
                  </View>
                  <View style={styles.metaDiv} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.metaLabel}>{app.loan ? 'Next EMI' : apr != null ? 'Interest' : 'Applied'}</Text>
                    <Text style={styles.metaVal}>{app.loan ? rupee(app.loan.emiAmount) : apr != null ? `${apr}% p.a.` : applied}</Text>
                  </View>
                  <Icon name="chevron_right" size={20} color={colors.muted} />
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 18,
    padding: 16,
  },
  appIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  appIconLogo: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.lineSoft },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  metaLabel: { ...StyleSheet.flatten(font(500)), fontSize: 11, color: colors.muted },
  metaVal: { ...StyleSheet.flatten(font(800)), fontSize: 14.5, color: colors.text, marginTop: 1 },
  metaDiv: { width: 1, height: 28, backgroundColor: colors.line },
});

export default MyLoansSection;
