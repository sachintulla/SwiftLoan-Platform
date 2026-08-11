import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import Icon from './Icon';
import { PrimaryButton } from './Controls';
import { Skeleton } from './common/Loading';
import { colors, font, inr } from '../theme/tokens';
import { api, PreApprovedPlan } from '../api/client';
import { saveSelectedPlan } from '../state/selectedPlan';
import { useVoiceTarget } from '../voice/useVoiceTarget';

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
  // Rendered inside a child component of the Explore screen, so the screen's
  // element-tree auto-discovery (screenGraph.ts) never sees this card — it only
  // walks what Explore itself passes to <Screen>. Self-register instead.
  useVoiceTarget(plan.lenderName, { kind: 'button', onTap: onSelect }, [onSelect]);
  return (
    <Pressable onPress={onSelect} style={[styles.card, selected && styles.cardSelected]}>
      {plan.badge ? (
        <View style={styles.ribbon}>
          <Text style={[font(700), { fontSize: 10.5, color: '#fff', letterSpacing: 0.3 }]}>{plan.badge}</Text>
        </View>
      ) : null}
      <View style={styles.cardTop}>
        <View style={styles.iconChip}>
          {plan.logoUrl ? (
            <Image source={{ uri: plan.logoUrl }} style={styles.logo} resizeMode="contain" />
          ) : (
            <Icon name={plan.icon} size={22} color={colors.primary} />
          )}
        </View>
        <Text style={[font(800), { fontSize: 16, color: colors.text, flex: 1 }]}>{plan.lenderName}</Text>
        <View style={[styles.radio, selected && styles.radioOn]}>
          {selected ? <Icon name="check" size={13} color="#fff" /> : null}
        </View>
      </View>

      <View style={styles.metrics}>
        {amount.value ? (
          <Metric label={amount.label} value={amount.value} highlight />
        ) : (
          <Metric label="Amount" value={amount.label} highlight />
        )}
        {meta.length === 2 ? (
          <>
            <Metric label="Rate" value={meta[0]} />
            <Metric label="Tenure" value={meta[1]} />
          </>
        ) : meta.length === 1 ? (
          <Metric label="Rate / Tenure" value={meta[0]} />
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

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[font(500), { fontSize: 10.5, color: colors.muted }]}>{label}</Text>
      <Text style={[font(800), { fontSize: highlight ? 16 : 13.5, color: highlight ? colors.primary : colors.text, marginTop: 2 }]}>{value}</Text>
    </View>
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

  const continueLabel = mode === 'home' ? 'Save selection' : 'Sign up to continue';
  useVoiceTarget(plans && plans.length > 0 ? continueLabel : undefined, { kind: 'button', onTap: onContinue }, [onContinue]);

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
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    backgroundColor: colors.surface,
  },
  cardSelected: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: 'rgba(7,159,160,0.05)',
  },
  ribbon: {
    position: 'absolute',
    top: -1,
    right: 16,
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E1F3F3',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: 28, height: 28, borderRadius: 6 },
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
  metrics: { flexDirection: 'row', marginTop: 14, gap: 4 },
  tagsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  tagPill: { backgroundColor: colors.chip, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
});

export default PreApprovedPlans;
