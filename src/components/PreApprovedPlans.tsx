import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Linking } from 'react-native';
import Icon from './Icon';
import { PrimaryButton } from './Controls';
import { Skeleton } from './common/Loading';
import { colors, font, inr } from '../theme/tokens';
import { api, PreApprovedPlan } from '../api/client';
import { saveSelectedPlan } from '../state/selectedPlan';
import { useVoiceTarget } from '../voice/useVoiceTarget';
import { LENDER_LOGOS } from '../theme/lenderLogos';

function amountLine(p: PreApprovedPlan) {
  if (p.amountAtApproval) return { label: 'Amount at approval', value: '' };
  // maxAmount is in paise (server convention) — tokens.ts's inr() expects rupees.
  return { label: 'Up to', value: p.maxAmount != null ? inr(Math.round(p.maxAmount / 100)) : '—' };
}

function rateTenureLine(p: PreApprovedPlan): string[] {
  const rate = p.rateAtApproval ? 'Rate at approval' : p.rateMin != null && p.rateMax != null ? `${p.rateMin}–${p.rateMax}% p.a.` : null;
  const tenure = p.tenureMinMonths != null && p.tenureMaxMonths != null ? `${p.tenureMinMonths}–${p.tenureMaxMonths} mo` : null;
  return [rate, tenure].filter((s): s is string => !!s);
}

function PlanCard({
  plan,
  selected,
  showRadio,
  onSelect,
}: {
  plan: PreApprovedPlan;
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
        <View style={styles.iconChip}>
          {LENDER_LOGOS[plan.lenderName] ? (
            <Image source={LENDER_LOGOS[plan.lenderName]} style={styles.logo} resizeMode="contain" />
          ) : plan.logoUrl ? (
            <Image source={{ uri: plan.logoUrl }} style={styles.logo} resizeMode="contain" />
          ) : (
            <Icon name={plan.icon} size={22} color={colors.primary} />
          )}
        </View>
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
 * Also embeddable directly on Home (`showIntro={false}`) so the full plan
 * list is visible on the main dashboard itself instead of requiring a tap
 * through to a separate screen — the title/stats/pill block only makes sense
 * as a dedicated screen's header, so it's the one thing skipped when embedded.
 *
 * The two modes interact differently with a tap, not just visually:
 * - "guest" (not signed up yet): tapping a card only highlights it — the user
 *   still has to hit "Sign up to continue" to actually proceed, since signing
 *   up is a real gate here.
 * - "home" (already signed in): there's no gate left to enforce, so a tap
 *   acts immediately — saves the pick and opens the lender's page — instead
 *   of making the user select-then-press-continue for something they've
 *   already signed up for.
 */
export function PreApprovedPlans({
  mode = 'guest',
  onApply,
  showIntro = true,
}: {
  mode?: 'guest' | 'home';
  onApply: (plan: PreApprovedPlan) => void;
  showIntro?: boolean;
}) {
  const isHome = mode === 'home';
  const [plans, setPlans] = useState<PreApprovedPlan[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.preApprovedPlans()
      .then(r => {
        if (cancelled) return;
        const data = r.data ?? [];
        setPlans(data);
        if (!isHome && data.length > 0) setSelectedId(data[0].id); // pre-select the top (best-rate) plan
      })
      .catch(() => { if (!cancelled) setPlans([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedPlan = plans?.find(p => p.id === selectedId) ?? null;

  const persistSelection = (plan: PreApprovedPlan) =>
    saveSelectedPlan({
      id: plan.id,
      lenderName: plan.lenderName,
      icon: plan.icon,
      logoUrl: plan.logoUrl,
      exploreUrl: plan.exploreUrl,
      badge: plan.badge,
    }).catch(() => {});

  const onCardPress = (plan: PreApprovedPlan) => {
    if (isHome) {
      // Already signed in — no gate left, so a tap acts immediately: save
      // the pick and go straight to the lender's page.
      persistSelection(plan);
      if (plan.exploreUrl) Linking.openURL(plan.exploreUrl).catch(() => {});
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
              Compare rates, amounts and eligibility across some pre-approved loans. Nothing is submitted and your credit score is never touched.
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
            <Text style={[font(600), { fontSize: 11.5, color: colors.primary }]}>Pre-approved · no PAN needed yet</Text>
          </View>
        </>
      )}

      {plans === null ? (
        <View>
          <Skeleton height={90} />
          <Skeleton height={90} />
        </View>
      ) : plans.length === 0 ? null : (
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
  // Border only — a whole-card tint looked patchy once it sat behind the
  // hero panel's own opaque background (same issue fixed on the offers screen).
  cardSelected: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconChip: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: '#E1F3F3',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: 28, height: 28, borderRadius: 6 },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
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

export default PreApprovedPlans;
