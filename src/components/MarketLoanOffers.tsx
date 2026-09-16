import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import Icon from './Icon';
import { PrimaryButton } from './Controls';
import { Skeleton } from './common/Loading';
import { colors, font, inr } from '../theme/tokens';
import { api, MarketLoanOffer } from '../api/client';
import { saveSelectedPlan } from '../state/selectedPlan';
import { loadMarketOffersCache, saveMarketOffersCache } from '../state/session';
import { useVoiceTarget } from '../voice/useVoiceTarget';
import { LENDER_LOGOS } from '../theme/lenderLogos';
import { useStore, useT } from '../state/store';

function amountLine(p: MarketLoanOffer) {
  if (p.amountAtApproval) return { label: 'Amount at approval', value: '' };
  // maxAmount is in paise (server convention) — tokens.ts's inr() expects rupees.
  return { label: 'Up to', value: p.maxAmount != null ? inr(Math.round(p.maxAmount / 100)) : '—' };
}

function rateTenureLine(p: MarketLoanOffer): string[] {
  const rate = p.rateAtApproval ? 'Rate at approval' : p.rateMin != null && p.rateMax != null ? `${p.rateMin}–${p.rateMax}% p.a.` : null;
  const tenure = p.tenureMinMonths != null && p.tenureMaxMonths != null ? `${p.tenureMinMonths}–${p.tenureMaxMonths} mo` : null;
  return [rate, tenure].filter((s): s is string => !!s);
}

/** Lender logo, filling the tile (no mint frame) when a real logo exists. */
function LenderLogo({ plan, size = 44 }: { plan: MarketLoanOffer; size?: number }) {
  const src = LENDER_LOGOS[plan.lenderName] ?? (plan.logoUrl ? { uri: plan.logoUrl } : null);
  if (src) {
    return (
      <View style={[styles.logoTile, { width: size, height: size, borderRadius: size * 0.28 }]}>
        <Image source={src} style={{ width: size - 6, height: size - 6 }} resizeMode="contain" />
      </View>
    );
  }
  return (
    <View style={[styles.iconChip, { width: size, height: size, borderRadius: size * 0.28 }]}>
      <Icon name={plan.icon} size={size * 0.5} color={colors.primary} />
    </View>
  );
}

/* ── Compact card — two per row on the dashboard, for less scrolling and more
 *    offers visible at a glance. ────────────────────────────────────────────── */
function CompactPlanCard({ plan, index, full = false, onSelect }: { plan: MarketLoanOffer; index: number; full?: boolean; onSelect: () => void }) {
  const amount = amountLine(plan);
  const rate = plan.rateAtApproval ? 'Rate at approval' : plan.rateMin != null && plan.rateMax != null ? `${plan.rateMin}–${plan.rateMax}% p.a.` : null;
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 360, delay: index * 70, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [enter, index]);

  useVoiceTarget(plan.lenderName, { kind: 'button', onTap: onSelect }, [onSelect]);

  const animStyle = {
    // A lone last card (odd count) spans the full width so the row stays balanced.
    width: full ? ('100%' as const) : ('48%' as const),
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  };

  // Full-width variant lays out horizontally so it doesn't look sparse.
  if (full) {
    return (
      <Animated.View style={animStyle}>
        <Pressable onPress={onSelect} style={[styles.compactCard, styles.compactFull]}>
          <LenderLogo plan={plan} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={[font(700), { fontSize: 14, color: colors.text }]} numberOfLines={1}>{plan.lenderName}</Text>
            {rate ? <Text style={[font(500), { fontSize: 11.5, color: colors.textMid, marginTop: 2 }]} numberOfLines={1}>{rate}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[font(600), { fontSize: 10.5, color: colors.greenDeep }]}>{amount.value ? amount.label : 'Amount'}</Text>
            <Text style={[font(800), { fontSize: 18, color: colors.primary, letterSpacing: -0.4 }]} numberOfLines={1}>
              {amount.value || amount.label}
            </Text>
          </View>
          {plan.badge ? (
            <View style={styles.badge}>
              <Text style={[font(700), { fontSize: 9.5, color: '#fff', letterSpacing: 0.2 }]}>{plan.badge}</Text>
            </View>
          ) : null}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={animStyle}>
      {/* Fixed height so every grid tile is identical regardless of content. */}
      <Pressable onPress={onSelect} style={[styles.compactCard, styles.compactTile]}>
        <View style={styles.compactTop}>
          <LenderLogo plan={plan} size={44} />
          {plan.badge ? (
            <View style={styles.badge}>
              <Text style={[font(700), { fontSize: 9.5, color: '#fff', letterSpacing: 0.2 }]}>{plan.badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[font(700), { fontSize: 14, color: colors.text, marginTop: 10 }]} numberOfLines={1}>{plan.lenderName}</Text>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Text style={[font(600), { fontSize: 10.5, color: colors.greenDeep }]}>{amount.value ? amount.label : 'Amount'}</Text>
          <Text style={[font(800), { fontSize: 18, color: colors.primary, letterSpacing: -0.4 }]} numberOfLines={1}>
            {amount.value || amount.label}
          </Text>
          <Text style={[font(500), { fontSize: 11.5, color: colors.textMid, marginTop: 4, minHeight: 15 }]} numberOfLines={1}>{rate ?? ''}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function PlanCard({
  plan,
  selected,
  showRadio,
  onSelect,
}: {
  plan: MarketLoanOffer;
  selected: boolean;
  showRadio: boolean;
  onSelect: () => void;
}) {
  const amount = amountLine(plan);
  const meta = rateTenureLine(plan);
  // Rendered inside a child component of the Explore screen, so the screen's
  // element-tree auto-discovery (screenGraph.ts) never sees this card — it only
  // walks what Explore itself passes to <Screen>. Self-register instead.
  useVoiceTarget(plan.lenderName, { kind: 'button', onTap: onSelect }, [onSelect]);
  return (
    <Pressable onPress={onSelect} style={[styles.card, selected && styles.cardSelected]}>
      <View style={styles.cardTop}>
        <LenderLogo plan={plan} size={46} />
        <Text style={[font(800), { fontSize: 17, color: colors.text, flex: 1, letterSpacing: -0.2 }]}>{plan.lenderName}</Text>
        {plan.badge ? (
          <View style={styles.badge}>
            <Text style={[font(700), { fontSize: 10.5, color: '#fff', letterSpacing: 0.2 }]}>{plan.badge}</Text>
          </View>
        ) : showRadio ? (
          <View style={[styles.radio, selected && styles.radioOn]}>
            {selected ? <Icon name="check" size={13} color="#fff" /> : null}
          </View>
        ) : (
          <Icon name="chevron_right" size={20} color={colors.muted} />
        )}
      </View>

      {/* Hero metric — the headline amount set apart from rate/tenure, same
          pattern as the real-offers screen, for a consistent visual language. */}
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={[font(600), { fontSize: 11, color: colors.greenDeep }]}>{amount.value ? amount.label : 'Amount'}</Text>
          <Text style={[font(800), { fontSize: 22, color: colors.primary, letterSpacing: -0.4, marginTop: 2 }]} numberOfLines={1}>
            {amount.value || amount.label}
          </Text>
        </View>
        {meta.length ? (
          <>
            <View style={styles.heroDiv} />
            <View style={{ flex: 1, gap: 6 }}>
              {meta.map((m, i) => <Text key={i} style={[font(600), { fontSize: 12.5, color: colors.textMid }]}>{m}</Text>)}
            </View>
          </>
        ) : null}
      </View>

      {plan.tags.length ? (
        <View style={styles.tagsRow}>
          {plan.tags.map((t, i) => (
            <View key={i} style={styles.tagPill}>
              <Text style={[font(600), { fontSize: 11, color: colors.textMid }]}>{t}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={[font(800), { fontSize: 16, color: colors.text }]}>{value}</Text>
      <Text style={[font(500), { fontSize: 11, color: colors.muted, marginTop: 2 }]}>{label}</Text>
    </View>
  );
}

/**
 * "Explore your loan options" — the full dedicated screen content, shown either
 * from the skip-login path (mode "guest": pick a plan, then sign up) or from
 * home's "Explore more plans" link (mode "home": already signed in, just
 * browsing/re-picking). Rendered by src/screens/explore.tsx, which owns the
 * header/back button.
 *
 * On Home (`mode="home"`, `showIntro={false}`) the offers render as a compact
 * two-per-row grid with a live-activity bar, so more offers are visible with
 * less scrolling. The guest/explore path keeps the full-width selectable cards.
 */
export function MarketLoanOffers({
  mode = 'guest',
  onApply,
  showIntro = true,
}: {
  mode?: 'guest' | 'home';
  onApply: (plan: MarketLoanOffer) => void;
  showIntro?: boolean;
}) {
  const isHome = mode === 'home';
  const { mergeApiContext } = useStore();
  const [plans, setPlans] = useState<MarketLoanOffer[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const apply = (data: MarketLoanOffer[]) => {
      if (cancelled) return;
      setPlans(data);
      if (!isHome && data.length > 0) setSelectedId(data[0].id); // pre-select the top (best-rate) plan
    };
    (async () => {
      // Cache-first: the available-offers catalog rarely changes, so once it's
      // been fetched we reuse the locally-saved copy (fresh for 12h) instead of
      // calling the cloud again on every mount.
      const cache = await loadMarketOffersCache();
      const fresh = cache && Date.now() - cache.savedAt < 12 * 60 * 60 * 1000;
      if (fresh) { apply(cache!.offers as MarketLoanOffer[]); return; }
      try {
        const r = await api.marketLoanOffers();
        const data = r.data ?? [];
        apply(data);
        mergeApiContext({ marketOffers: data });
        if (data.length > 0) saveMarketOffersCache({ savedAt: Date.now(), offers: data });
      } catch {
        // Offline / error → fall back to any (stale) cached copy, else empty.
        if (cancelled) return;
        if (cache) apply(cache.offers as MarketLoanOffer[]);
        else setPlans([]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedPlan = plans?.find(p => p.id === selectedId) ?? null;

  const persistSelection = (plan: MarketLoanOffer) =>
    saveSelectedPlan({
      id: plan.id,
      lenderName: plan.lenderName,
      icon: plan.icon,
      logoUrl: plan.logoUrl,
      exploreUrl: plan.exploreUrl,
      badge: plan.badge,
    }).catch(() => {});

  const onCardPress = (plan: MarketLoanOffer) => {
    if (isHome) {
      // Already signed in — a tap starts a new loan application pre-filled with
      // this plan (see home.tsx's onApply), rather than opening the lender's
      // external page. Save the pick so the rest of the flow knows it.
      persistSelection(plan);
      onApply(plan);
    } else {
      setSelectedId(plan.id);
    }
  };

  const onContinue = () => {
    // Guest path: sign-up is a real gate still ahead — only save the pick and
    // hand off to the caller (which routes to login/mobile). The lender's
    // page must never open before the user has actually signed in.
    if (selectedPlan) {
      persistSelection(selectedPlan);
      onApply(selectedPlan);
    }
  };

  useVoiceTarget(!isHome && plans && plans.length > 0 ? 'Sign up to continue' : undefined, { kind: 'button', onTap: onContinue }, [onContinue]);

  return (
    <View style={{ gap: 16 }}>
      {showIntro && (
        <>
          <View>
            <Text style={[font(800), { fontSize: 26, letterSpacing: -0.5, color: colors.text }]}>Explore your loan options</Text>
            <Text style={[font(400), { fontSize: 14, color: colors.textSoft, marginTop: 6, lineHeight: 20 }]}>
              Compare rates, amounts and eligibility across available market offers. Nothing is submitted and your credit score is never touched.
            </Text>
          </View>

          <View style={styles.statsRow}>
            <Stat value="15+" label="Lenders" />
            <View style={styles.statDivider} />
            <Stat value="2 min" label="To offers" />
            <View style={styles.statDivider} />
            <Stat value="0" label="Score impact" />
          </View>

          <View style={styles.pill}>
            <Icon name="verified" size={14} color={colors.primary} />
            <Text style={[font(600), { fontSize: 11.5, color: colors.primary }]}>Available offer · no PAN needed yet</Text>
          </View>
        </>
      )}

      {plans === null ? (
        isHome ? (
          <View style={styles.grid}>
            <View style={{ width: '48%' }}><Skeleton height={164} /></View>
            <View style={{ width: '48%' }}><Skeleton height={164} /></View>
          </View>
        ) : (
          <View>
            <Skeleton height={90} />
            <Skeleton height={90} />
          </View>
        )
      ) : plans.length === 0 ? null : isHome ? (
        // Dashboard: two-per-row grid.
        <View style={{ gap: 14 }}>
          <View style={styles.grid}>
            {plans.map((p, i) => (
              <CompactPlanCard
                key={p.id}
                plan={p}
                index={i}
                // Odd count → feature the top (best-rate) offer full-width in the
                // first row; the remaining even number fill the 2-per-row grid so
                // every row stays balanced.
                full={i === 0 && plans.length % 2 === 1}
                onSelect={() => onCardPress(p)}
              />
            ))}
          </View>
        </View>
      ) : (
        <View>
          {plans.map(p => (
            <PlanCard
              key={p.id}
              plan={p}
              showRadio={!isHome}
              selected={!isHome && p.id === selectedId}
              onSelect={() => onCardPress(p)}
            />
          ))}
        </View>
      )}

      {!isHome && plans && plans.length > 0 && (
        <>
          <PrimaryButton label="Sign up to continue" onPress={onContinue} />
          <Text style={[font(400), { fontSize: 12, color: colors.muted, textAlign: 'center' }]}>
            Create your account to check eligibility and see real offers.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSoft,
    borderRadius: 16,
    paddingVertical: 14,
  },
  statDivider: { width: 1, height: 28, backgroundColor: colors.line },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },

  // Live-activity bar
  liveBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveDotWrap: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.mint },
  liveRing: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: colors.mint },

  // Two-per-row grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  compactCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    padding: 14,
    backgroundColor: colors.surface,
    shadowColor: '#0A3F41',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  compactTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  compactTile: { height: 164 },
  compactFull: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  // Full-width card (guest/explore)
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    backgroundColor: colors.surface,
    shadowColor: '#0A3F41',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardSelected: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  // Lender logo tiles
  logoTile: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconChip: {
    backgroundColor: '#E1F3F3',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  badge: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
    shadowColor: '#0A3F41',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    backgroundColor: colors.surfaceSoft,
    borderRadius: 14,
    padding: 14,
    gap: 14,
  },
  heroDiv: { width: 1, height: 32, backgroundColor: colors.lineSoft },
  tagsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  tagPill: { backgroundColor: colors.chip, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
});

export default MarketLoanOffers;
