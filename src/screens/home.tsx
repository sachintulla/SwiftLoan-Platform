import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Linking } from 'react-native';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { EmiCalculator } from '../components/EmiCalculator';
import { colors, font } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { loadSelectedPlan, SelectedPlan } from '../state/selectedPlan';

const LOAN_TYPES = [
  { icon: 'person', k: 'ltPersonal', s: 'ltPersonalSub' },
  { icon: 'storefront', k: 'ltBusiness', s: 'ltBusinessSub' },
  { icon: 'home', k: 'ltHome', s: 'ltHomeSub' },
  { icon: 'school', k: 'ltEducation', s: 'ltEducationSub' },
  { icon: 'directions_car', k: 'ltVehicle', s: 'ltVehicleSub' },
];

function initials(name: string) {
  return (name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('') || 'U').toUpperCase();
}

export default function Home() {
  const t = useT();
  const { state, set, go, showToast } = useStore();
  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan | null>(null);
  const [planLoaded, setPlanLoaded] = useState(false);

  useEffect(() => {
    loadSelectedPlan().then(p => { setSelectedPlan(p); setPlanLoaded(true); });
  }, []);

  const openExplore = () => { set({ exploreFromHome: true }); go('explore'); };

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

      {/* Best rates compare card */}
      <Pressable onPress={() => go('basic')} style={styles.compareCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[font(700), { fontSize: 11.5, letterSpacing: 0.4, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase' }]}>
            {t.bestRates}
          </Text>
          <View style={styles.trendBadge}>
            <Icon name="trending_up" size={16} color="#fff" />
          </View>
        </View>
        <Text style={[font(800), { fontSize: 20, color: '#fff', lineHeight: 26, marginTop: 8 }]}>{t.compareTitle}</Text>
        <View style={styles.compareCta}>
          <Text style={[font(700), { color: colors.primary, fontSize: 14 }]}>{t.compareCta}</Text>
          <Icon name="chevron_right" size={18} color={colors.primary} />
        </View>
      </Pressable>

      {/* Selected pre-approved plan (if any) + a way to browse the full list again */}
      {planLoaded && (
        selectedPlan
          ? <SelectedPlanCard plan={selectedPlan} onExploreMore={openExplore} />
          : <ExplorePlansPrompt onPress={openExplore} />
      )}

      {/* Loan types */}
      <SectionHeading title={t.loanTypesTitle} />
      <View style={styles.tileGrid}>
        {LOAN_TYPES.map(l => (
          <Pressable key={l.k} onPress={() => go('basic')} style={styles.tile}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={styles.tileIcon}>
                <Icon name={l.icon} size={20} color={colors.primary} />
              </View>
              <Icon name="chevron_right" size={18} color={colors.muted} />
            </View>
            <Text style={[font(800), { fontSize: 15, color: colors.text, marginTop: 10 }]}>{(t as any)[l.k]}</Text>
            <Text style={[font(400), { fontSize: 11.5, color: colors.textSoft, marginTop: 1 }]}>{(t as any)[l.s]}</Text>
          </Pressable>
        ))}
      </View>

      {/* Manage loan */}
      <SectionHeading title={t.manageLoan} />
      <View style={{ gap: 12 }}>
        <ManageRow icon="speed" title={t.creditCard} sub={t.creditCardSub} onPress={() => go('creditscore')} />
        <ManageRow icon="timeline" title={t.statusCard} sub={t.statusCardSub} onPress={() => go('status')} />
      </View>

      {/* Learn */}
      <SectionHeading title={t.learnTitle} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 4 }}>
        <VideoCard tag={t.learnGuide} tagIcon="school" title={t.learnVid1} dur="1:20" onPress={() => showToast(t.tSoon)} />
        <VideoCard tag={t.learnTips} tagIcon="savings" title={t.learnVid2} dur="2:05" onPress={() => showToast(t.tSoon)} />
      </ScrollView>
      <Pressable onPress={() => showToast(t.tSoon)} style={styles.promo}>
        <View style={styles.promoIcon}>
          <Icon name="redeem" size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[font(700), { fontSize: 10.5, letterSpacing: 0.4, color: colors.amber, textTransform: 'uppercase' }]}>{t.adLabel}</Text>
          <Text style={[font(800), { fontSize: 14, color: colors.text }]}>{t.adTitle}</Text>
          <Text style={[font(400), { fontSize: 11.5, color: colors.textSoft }]}>{t.adSub}</Text>
        </View>
        <Icon name="chevron_right" size={20} color={colors.muted} />
      </Pressable>

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

      {/* EMI calculator */}
      <SectionHeading title={t.fareTitle} sub={t.fareSub} />
      <EmiCalculator onApply={() => go('basic')} />

      {/* Disclaimer */}
      <Text style={[font(400), { fontSize: 10.5, lineHeight: 16, color: colors.muted, marginTop: 24 }]}>{t.disclaimer}</Text>
    </Screen>
  );
}

/**
 * The plan the user picked on the "Explore your loan options" screen (skip-login
 * path), persisted locally. "Explore Plan" opens the lender's own site in the
 * browser — a demo stand-in for a real redirect/deep integration.
 */
function SelectedPlanCard({ plan, onExploreMore }: { plan: SelectedPlan; onExploreMore: () => void }) {
  const openExplore = () => {
    if (plan.exploreUrl) Linking.openURL(plan.exploreUrl).catch(() => {});
  };
  return (
    <View>
      <View style={styles.selectedPlanCard}>
        <View style={styles.tileIcon}>
          <Icon name={plan.icon} size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[font(600), { fontSize: 11.5, color: colors.muted }]}>Your selected plan</Text>
          <Text style={[font(700), { fontSize: 15, color: colors.text, marginTop: 1 }]}>{plan.lenderName}</Text>
        </View>
        {plan.exploreUrl ? (
          <Pressable onPress={openExplore} style={styles.exploreBtn}>
            <Text style={[font(700), { fontSize: 12.5, color: colors.primary }]}>Explore Plan</Text>
            <Icon name="open_in_new" size={14} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>
      <Pressable onPress={onExploreMore} style={{ alignSelf: 'flex-end', marginTop: 8 }}>
        <Text style={[font(600), { fontSize: 12.5, color: colors.textSoft }]}>See all plans →</Text>
      </Pressable>
    </View>
  );
}

/** Shown when no plan has been picked yet — the entry point into the full list. */
function ExplorePlansPrompt({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.selectedPlanCard}>
      <View style={styles.tileIcon}>
        <Icon name="verified" size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[font(700), { fontSize: 14.5, color: colors.text }]}>See your pre-approved plans</Text>
        <Text style={[font(400), { fontSize: 12, color: colors.textSoft, marginTop: 1 }]}>No PAN needed · credit score untouched</Text>
      </View>
      <Icon name="chevron_right" size={20} color={colors.muted} />
    </Pressable>
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

function ManageRow({ icon, title, sub, onPress }: { icon: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.manageRow}>
      <View style={styles.tileIcon}>
        <Icon name={icon} size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[font(700), { fontSize: 14.5, color: colors.text }]}>{title}</Text>
        <Text style={[font(400), { fontSize: 12, color: colors.textSoft, marginTop: 1 }]}>{sub}</Text>
      </View>
      <Icon name="chevron_right" size={20} color={colors.muted} />
    </Pressable>
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
  selectedPlanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 18,
    padding: 14,
  },
  exploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.chip,
    borderRadius: 9999,
    paddingVertical: 8,
    paddingHorizontal: 12,
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
