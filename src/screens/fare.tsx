import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { EmiCalculator } from '../components/EmiCalculator';
import { PrimaryButton } from '../components/Controls';
import { colors, font } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { api, isAuthed } from '../api/client';

const OFFER_STATUSES = ['offers_ready', 'handoff', 'under_review', 'approved', 'disbursed'];

function bandColor(band: string): string {
  const b = band.toUpperCase();
  if (b.includes('EXCELLENT') || b.includes('GOOD')) return colors.green;
  if (b.includes('FAIR') || b.includes('AVERAGE')) return colors.amber;
  if (b.includes('POOR')) return colors.red;
  return colors.primary;
}

/**
 * Offers tab — the user's loan hub: their credit score, any offers already pulled
 * for their phone/PAN (jump straight in), and the EMI calculator. When there are
 * no offers yet it reads as a credit-score screen with a clear "Apply for a loan"
 * call to action.
 */
export default function Offers() {
  const t = useT();
  const { set, go } = useStore();
  const [credit, setCredit] = useState<{ score: number; band: string } | null>(null);
  const [hasOffers, setHasOffers] = useState(false);

  const load = useCallback(() => {
    if (!isAuthed()) return;
    api.creditScore()
      .then((r: any) => setCredit({ score: r.score ?? 750, band: (r.band ?? 'GOOD').toUpperCase() }))
      .catch(() => undefined);
    api.listApplications()
      .then((r: any) => {
        const withOffers = (r?.applications || []).find(
          (a: any) => (a.offers?.length ?? 0) > 0 && OFFER_STATUSES.includes(a.status),
        );
        if (withOffers) {
          set({ applicationId: withOffers.id, loanId: withOffers.loan?.id ?? null });
          setHasOffers(true);
        } else {
          setHasOffers(false);
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);

  const cScore = credit?.score ?? 750;
  const cBand = credit?.band ?? 'GOOD';
  const bColor = bandColor(cBand);
  const pct = Math.max(0, Math.min(1, (cScore - 300) / (900 - 300)));

  return (
    <Screen scroll bottomNav padded>
      <View style={{ marginTop: 8, marginBottom: 16 }}>
        <Text style={[font(800), { fontSize: 26, letterSpacing: -0.5, color: colors.text }]}>{t.availableOffers}</Text>
        <Text style={[font(400), { fontSize: 14, color: colors.textSoft, marginTop: 4 }]}>{t.availableOffersSub}</Text>
      </View>

      {/* Credit score card */}
      <View style={styles.scoreCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={styles.scoreIcon}><Icon name="speed" size={22} color={colors.primary} /></View>
            <View>
              <Text style={[font(500), { fontSize: 12.5, color: colors.textSoft }]}>{t.cibilScoreLabel}</Text>
              <Text style={[font(800), { fontSize: 30, color: colors.text, marginTop: 1 }]}>{cScore}</Text>
            </View>
          </View>
          <View style={[styles.bandPill, { backgroundColor: bColor + '22' }]}>
            <Text style={[font(700), { fontSize: 12, color: bColor }]}>{cBand.charAt(0) + cBand.slice(1).toLowerCase()}</Text>
          </View>
        </View>
        <View style={styles.scoreTrack}>
          <View style={[styles.scoreFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: bColor }]} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={[font(400), { fontSize: 11, color: colors.muted }]}>300</Text>
          <Text style={[font(400), { fontSize: 11, color: colors.muted }]}>900</Text>
        </View>
      </View>

      {/* Existing offers for this user/PAN — jump straight in. */}
      {hasOffers ? (
        <Pressable onPress={() => go('offers')} style={styles.offersCard}>
          <View style={styles.offersIcon}><Icon name="local_offer" size={22} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={[font(700), { fontSize: 15, color: colors.text }]}>{t.eligibleOffersTitle}</Text>
            <Text style={[font(400), { fontSize: 12.5, color: colors.textSoft, marginTop: 1 }]}>{t.eligibleOffersSub}</Text>
          </View>
          <Icon name="arrow_forward" size={20} color={colors.primary} />
        </Pressable>
      ) : (
        // No offers yet — clear apply CTA on top of the credit-score view.
        <View style={styles.applyCard}>
          <Text style={[font(700), { fontSize: 15, color: colors.text }]}>No offers yet</Text>
          <Text style={[font(400), { fontSize: 12.5, color: colors.textSoft, marginTop: 3, marginBottom: 12 }]}>
            Check your eligibility in ~2 minutes — it won't affect your credit score.
          </Text>
          <PrimaryButton label="Apply for a loan" icon="arrow_forward" onPress={() => go('basicpan')} />
        </View>
      )}

      {/* Loan calculator */}
      <View style={{ marginTop: 22, marginBottom: 10 }}>
        <Text style={[font(800), { fontSize: 19, color: colors.text, letterSpacing: -0.3 }]}>{t.calculatorTitle}</Text>
        <Text style={[font(400), { fontSize: 13, color: colors.textSoft, marginTop: 2 }]}>{t.fareSub}</Text>
      </View>
      <EmiCalculator onApply={() => go('basicpan')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scoreCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16 },
  scoreIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  bandPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  scoreTrack: { height: 8, borderRadius: 4, backgroundColor: colors.lineSoft, marginTop: 14, overflow: 'hidden' },
  scoreFill: { height: 8, borderRadius: 4 },
  offersCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14,
    backgroundColor: colors.chip, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14,
  },
  offersIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  applyCard: { marginTop: 14, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16 },
});
