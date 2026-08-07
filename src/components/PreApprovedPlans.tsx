import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import Icon from './Icon';
import { PrimaryButton } from './Controls';
import { Skeleton } from './common/Loading';
import { colors, font, inr } from '../theme/tokens';
import { api, PreApprovedPlan } from '../api/client';
import { saveSelectedPlan } from '../state/selectedPlan';

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

function PlanCard({ plan, selected, onSelect }: { plan: PreApprovedPlan; selected: boolean; onSelect: () => void }) {
  const amount = amountLine(plan);
  const meta = rateTenureLine(plan);
  return (
    <Pressable onPress={onSelect} style={[styles.card, selected && styles.cardSelected]}>
      <View style={styles.cardTop}>
        <View style={styles.cardLender}>
          {plan.logoUrl ? (
            <Image source={{ uri: plan.logoUrl }} style={styles.logo} resizeMode="contain" />
          ) : (
            <Icon name={plan.icon} size={20} color={colors.textSoft} />
          )}
          <Text style={[font(600), { fontSize: 15, color: colors.text }]}>{plan.lenderName}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {plan.badge ? (
            <View style={styles.badge}>
              <Text style={[font(600), { fontSize: 11, color: colors.primary }]}>{plan.badge}</Text>
            </View>
          ) : null}
          <View style={[styles.radio, selected && styles.radioOn]}>
            {selected ? <Icon name="check" size={13} color="#fff" /> : null}
          </View>
        </View>
      </View>

      {amount.value ? (
        <View style={{ marginVertical: 8, flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text style={[font(500), { fontSize: 12, color: colors.muted }]}>{amount.label}</Text>
          <Text style={[font(700), { fontSize: 20, color: colors.text }]}>{amount.value}</Text>
        </View>
      ) : (
        <Text style={[font(600), { fontSize: 15, color: colors.text, marginVertical: 8 }]}>{amount.label}</Text>
      )}

      <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
        {(meta.length ? meta : plan.tags).map((s, i) => (
          <Text key={i} style={[font(400), { fontSize: 12, color: colors.textSoft }]}>{s}</Text>
        ))}
      </View>
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
 */
export function PreApprovedPlans({ mode = 'guest', onApply }: { mode?: 'guest' | 'home'; onApply: () => void }) {
  const [plans, setPlans] = useState<PreApprovedPlan[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.preApprovedPlans()
      .then(r => {
        if (cancelled) return;
        const data = r.data ?? [];
        setPlans(data);
        if (data.length > 0) setSelectedId(data[0].id); // pre-select the top (best-rate) plan
      })
      .catch(() => { if (!cancelled) setPlans([]); });
    return () => { cancelled = true; };
  }, []);

  const selectedPlan = plans?.find(p => p.id === selectedId) ?? null;

  const onContinue = () => {
    if (selectedPlan) {
      saveSelectedPlan({
        id: selectedPlan.id,
        lenderName: selectedPlan.lenderName,
        icon: selectedPlan.icon,
        logoUrl: selectedPlan.logoUrl,
        exploreUrl: selectedPlan.exploreUrl,
        badge: selectedPlan.badge,
      }).catch(() => {});
    }
    onApply();
  };

  return (
    <View style={{ gap: 16 }}>
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

      {plans === null ? (
        <View>
          <Skeleton height={90} />
          <Skeleton height={90} />
        </View>
      ) : plans.length === 0 ? null : (
        <View>
          {plans.map(p => (
            <PlanCard key={p.id} plan={p} selected={p.id === selectedId} onSelect={() => setSelectedId(p.id)} />
          ))}
        </View>
      )}

      {plans && plans.length > 0 && (
        <>
          <PrimaryButton label={mode === 'home' ? 'Save selection' : 'Sign up to continue'} onPress={onContinue} />
          <Text style={[font(400), { fontSize: 12, color: colors.muted, textAlign: 'center' }]}>
            {mode === 'home'
              ? "We'll remember this pick on your dashboard."
              : 'Create your account to check eligibility and see real offers.'}
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
    borderWidth: 0.5,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    backgroundColor: colors.surface,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLender: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 20, height: 20, borderRadius: 5 },
  badge: {
    backgroundColor: colors.chip,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});

export default PreApprovedPlans;
