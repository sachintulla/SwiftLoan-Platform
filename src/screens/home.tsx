import React, { useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { MarketLoanOffers } from '../components/MarketLoanOffers';
import { colors, font } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { api, isAuthed } from '../api/client';

const OFFER_STATUSES = ['offers_ready', 'handoff', 'under_review', 'approved', 'disbursed'];

// `loanType` values must match the server's LoanType enum — see applications.routes.ts.
const LOAN_TYPES = [
  { icon: 'person', k: 'ltPersonal', s: 'ltPersonalSub', loanType: 'personal' },
  { icon: 'storefront', k: 'ltBusiness', s: 'ltBusinessSub', loanType: 'business' },
];

function initials(name: string) {
  return (name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('') || 'U').toUpperCase();
}

export default function Home() {
  const t = useT();
  const { state, set, go, showToast } = useStore();

  // Reliably surface the "your eligible offers" shortcut whenever this phone
  // already has offers pulled — checked on every Home mount (not just once at
  // login), so a returning user always sees it.
  useEffect(() => {
    if (!isAuthed()) return;
    api.listApplications()
      .then((r: any) => {
        const withOffers = (r?.applications || []).find(
          (a: any) => (a.offers?.length ?? 0) > 0 && OFFER_STATUSES.includes(a.status),
        );
        if (withOffers) {
          set({ applicationId: withOffers.id, loanId: withOffers.loan?.id ?? null, hasSavedOffers: true });
        } else {
          set({ hasSavedOffers: false });
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen scroll bottomNav padded>
      {/* Welcome header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.welcomeChip}>
            <View style={styles.dot} />
            <Text style={[font(600), { fontSize: 11.5, color: colors.greenDeep }]}>{t.welcomeBack}</Text>
          </View>
          <Text style={[font(800), { fontSize: 27, letterSpacing: -0.6, color: colors.text, marginTop: 8 }]}>{t.greeting}</Text>
          <Text style={[font(400), { fontSize: 13.5, color: colors.textSoft, marginTop: 2 }]}>{t.greetingSub}</Text>
        </View>
        <Pressable onPress={() => go('profile')} style={styles.avatar}>
          <Text style={[font(700), { color: '#fff', fontSize: 15 }]}>{initials(state.pdName)}</Text>
        </Pressable>
      </View>

      {/* Returning user: their offers are already pulled — jump straight in,
          no need to re-enter details. */}
      {state.hasSavedOffers && (
        <Pressable onPress={() => go('offers')} style={styles.savedOffersCard}>
          <View style={styles.savedOffersIcon}>
            <Icon name="local_offer" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[font(700), { fontSize: 15, color: colors.text }]}>{t.eligibleOffersTitle}</Text>
            <Text style={[font(400), { fontSize: 12.5, color: colors.textSoft, marginTop: 1 }]}>
              {t.eligibleOffersSub}
            </Text>
          </View>
          <Icon name="arrow_forward" size={20} color={colors.primary} />
        </Pressable>
      )}

      {/* Browse loan types — the prominent hero block: pick a type to start a
          new application. Uses the large card space up top for the primary CTA. */}
      <View style={{ marginTop: 20 }}>
        <Text style={[font(800), { fontSize: 19, color: colors.text, letterSpacing: -0.3 }]}>{t.loanTypesTitle}</Text>
        <Text style={[font(400), { fontSize: 13, color: colors.textSoft, marginTop: 2 }]}>{t.loanTypesSub}</Text>
      </View>
      <View style={styles.loanTypeRow}>
        {LOAN_TYPES.map(l => (
          // Record the choice, then navigate — otherwise the tap is indistinguishable
          // from any other and the application is filed as 'personal'.
          <Pressable key={l.k} onPress={() => { set({ appLoanType: l.loanType }); go('basicpan'); }} style={styles.loanTypeCard}>
            <View style={styles.loanTypeIcon}>
              <Icon name={l.icon} size={26} color="#fff" />
            </View>
            <Text style={[font(800), { fontSize: 18, color: '#fff', marginTop: 14, letterSpacing: -0.2 }]}>{(t as any)[l.k]}</Text>
            <Text style={[font(400), { fontSize: 12.5, color: 'rgba(255,255,255,0.7)', marginTop: 3 }]}>{(t as any)[l.s]}</Text>
            <View style={styles.loanTypeCta}>
              <Text style={[font(700), { fontSize: 12.5, color: colors.primary }]}>{t.loanTypeCta}</Text>
              <Icon name="arrow_forward" size={15} color={colors.primary} />
            </View>
          </Pressable>
        ))}
      </View>

      {/* Available loan offers — the market catalog shown before any PAN/credit
          pull. Tapping one starts a new loan application (flow A: entry point
          only) pre-filled with that offer's amount; the eligible/personalised
          offers come back from the lender after PAN + details. */}
      <SectionHeading title={t.availableOffers} sub={t.availableOffersSub} />
      <MarketLoanOffers
        mode="home"
        showIntro={false}
        onApply={plan => {
          // Pre-fill the loan amount from the plan (maxAmount is in paise;
          // appAmount is in rupees). Fall back to the current amount when the
          // plan's amount is only decided at approval.
          if (plan.maxAmount) set({ appAmount: Math.round(plan.maxAmount / 100) });
          // User details entered/known so far are already in the store and are
          // re-prefilled by the basic screen on mount.
          go('basicpan');
        }}
      />

      {/* Application status now lives in the "My Loans" tab, not the dashboard. */}

      {/* Learn */}
      <SectionHeading title={t.learnTitle} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 4 }}>
        <VideoCard tag={t.learnGuide} tagIcon="school" title={t.learnVid1} dur="1:20" onPress={() => showToast(t.tSoon)} />
        <VideoCard tag={t.learnTips} tagIcon="savings" title={t.learnVid2} dur="2:05" onPress={() => showToast(t.tSoon)} />
      </ScrollView>
      {/* How it works */}
      <SectionHeading title={t.howItWorks} />
      <View style={{ gap: 14 }}>
        {[
          { n: '01', k: 'step1', s: 'step1Sub' },
          { n: '02', k: 'step2', s: 'step2Sub' },
          { n: '03', k: 'step3', s: 'step3Sub' },
        ].map(st => (
          <View key={st.n} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
            <Text style={[font(800), { fontSize: 22, color: 'rgba(7,159,160,0.35)', width: 34 }]}>{st.n}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[font(700), { fontSize: 15, color: colors.text }]}>{(t as any)[st.k]}</Text>
              <Text style={[font(400), { fontSize: 12.5, color: colors.textSoft, marginTop: 1 }]}>{(t as any)[st.s]}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Disclaimer */}
      <Text style={[font(400), { fontSize: 10.5, lineHeight: 16, color: colors.muted, marginTop: 24 }]}>{t.disclaimer}</Text>
    </Screen>
  );
}

function SectionHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ marginTop: 26, marginBottom: 14 }}>
      <Text style={[font(800), { fontSize: 18, letterSpacing: -0.3, color: colors.text }]}>{title}</Text>
      {sub ? <Text style={[font(400), { fontSize: 13, color: colors.textSoft, marginTop: 2 }]}>{sub}</Text> : null}
    </View>
  );
}

function VideoCard({ tag, tagIcon, title, dur, onPress }: { tag: string; tagIcon: string; title: string; dur: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.videoCard}>
      <View style={styles.videoThumb}>
        <View style={styles.playBtn}>
          <Icon name="play_arrow" size={22} color={colors.primary} />
        </View>
        <View style={styles.durBadge}>
          <Text style={[font(600), { color: '#fff', fontSize: 10 }]}>{dur}</Text>
        </View>
      </View>
      <View style={{ padding: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Icon name={tagIcon} size={14} color={colors.mint} />
          <Text style={[font(700), { fontSize: 11, color: colors.greenDeep }]}>{tag}</Text>
        </View>
        <Text style={[font(700), { fontSize: 13.5, color: colors.text, marginTop: 4 }]}>{title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  welcomeChip: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.chip,
    borderRadius: 9999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.mint },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedOffersCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 20,
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.primary + '44',
    borderRadius: 20,
    padding: 16,
  },
  savedOffersIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  compareCard: {
    marginTop: 20,
    backgroundColor: colors.ink,
    borderRadius: 24,
    padding: 20,
  },
  trendBadge: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  compareCta: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderRadius: 9999,
    paddingVertical: 9,
    paddingLeft: 16,
    paddingRight: 12,
    marginTop: 16,
  },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '47.5%',
    flexGrow: 1,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 18,
    padding: 14,
  },
  tileIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
  // Prominent loan-type chooser (replaces the old best-rates hero + small grid).
  loanTypeRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  loanTypeCard: {
    flex: 1,
    backgroundColor: colors.ink,
    borderRadius: 22,
    padding: 18,
    shadowColor: '#0A3F41',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  loanTypeIcon: { width: 52, height: 52, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  loanTypeCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginTop: 16,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 18,
    padding: 14,
  },
  videoCard: {
    width: 230,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  videoThumb: { height: 120, backgroundColor: '#DCEEEA', alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  durBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(15,42,43,0.8)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  promo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    backgroundColor: 'rgba(245,166,36,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245,166,36,0.25)',
    borderRadius: 18,
    padding: 14,
  },
  promoIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.amber, alignItems: 'center', justifyContent: 'center' },
});
