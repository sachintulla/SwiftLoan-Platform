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

/**
 * Offers tab — the loan hub: any offers already pulled for the user/PAN (jump
 * straight in), the single "Apply for a loan" entry, and the EMI calculator.
 * (Credit score now lives on the My Loans tab.)
 */
export default function Offers() {
  const t = useT();
  const { set, go } = useStore();
  const [hasOffers, setHasOffers] = useState(false);

  const load = useCallback(() => {
    if (!isAuthed()) return;
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

  return (
    <Screen scroll bottomNav padded>
      <View style={{ marginTop: 8, marginBottom: 16 }}>
        <Text style={[font(800), { fontSize: 26, letterSpacing: -0.5, color: colors.text }]}>{t.availableOffers}</Text>
        <Text style={[font(400), { fontSize: 14, color: colors.textSoft, marginTop: 4 }]}>{t.availableOffersSub}</Text>
      </View>

      {/* Existing offers for this user/PAN — jump straight in. */}
      {hasOffers && (
        <Pressable onPress={() => go('offers')} style={styles.offersCard}>
          <View style={styles.offersIcon}><Icon name="local_offer" size={22} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={[font(700), { fontSize: 15, color: colors.text }]}>{t.eligibleOffersTitle}</Text>
            <Text style={[font(400), { fontSize: 12.5, color: colors.textSoft, marginTop: 1 }]}>{t.eligibleOffersSub}</Text>
          </View>
          <Icon name="arrow_forward" size={20} color={colors.primary} />
        </Pressable>
      )}

      {/* The single "Apply for a loan" entry point — always visible here. */}
      <View style={styles.applyCard}>
        <Text style={[font(700), { fontSize: 15, color: colors.text }]}>{hasOffers ? 'Want a different loan?' : 'Check your eligibility'}</Text>
        <Text style={[font(400), { fontSize: 12.5, color: colors.textSoft, marginTop: 3, marginBottom: 12 }]}>
          Get real offers in ~2 minutes — it won't affect your credit score.
        </Text>
        <PrimaryButton label={hasOffers ? 'Apply for a new loan' : 'Apply for a loan'} icon="arrow_forward" onPress={() => go('basicpan')} />
      </View>

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
  offersCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.chip, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14,
  },
  offersIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  applyCard: { marginTop: 14, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16 },
});
