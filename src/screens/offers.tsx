import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { StepBadge } from '../components/Controls';
import { StepDots } from '../components/StepDots';
import { Loading } from '../components/common/Loading';
import { ErrorState } from '../components/common/ErrorState';
import { Empty } from '../components/common/Empty';
import { colors, font, rupee } from '../theme/tokens';
import { useStore } from '../state/store';
import { api } from '../api/client';

interface OfferVM {
  id?: string; icon: string; name: string; tag: string; verified: boolean; recommended: boolean;
  amount: string; apr: string; emi: string; tenure: string; fee: string;
}

const FALLBACK: OfferVM[] = [
  { icon: 'account_balance', name: 'BlueChip Finance', tag: 'Instant Approval', verified: true, recommended: true, amount: '₹45,000', apr: '5.4%', emi: '₹850', tenure: '60 Months', fee: '₹150.00' },
  { icon: 'savings', name: 'NeoVault Digital', tag: 'No Prepayment Penalty', verified: false, recommended: false, amount: '₹50,000', apr: '6.1%', emi: '₹968', tenure: '72 Months', fee: '₹0.00' },
  { icon: 'domain', name: 'Heritage Trust', tag: 'Lowest Fixed Rate', verified: false, recommended: false, amount: '₹40,000', apr: '5.8%', emi: '₹769', tenure: '60 Months', fee: '₹200.00' },
];

export default function Offers() {
  const { state, set, go, showToast } = useStore();
  const [offers, setOffers] = useState<OfferVM[]>([]);
  const [loading, setLoading] = useState(!!state.applicationId);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!state.applicationId) { setOffers(FALLBACK); setLoading(false); return; }
    setErr(null); setLoading(true);
    try {
      const { offers: raw }: any = await api.getApplication(state.applicationId).then((r: any) => ({ offers: r.application.offers }));
      const vm: OfferVM[] = (raw || []).map((o: any) => ({
        id: o.id,
        icon: o.partner?.icon || 'account_balance',
        name: o.partner?.name || 'Partner',
        tag: o.tag || '',
        verified: o.recommended,
        recommended: o.recommended,
        amount: rupee(o.amount / 100), // server amounts are paise
        apr: `${o.apr}%`,
        emi: rupee(o.emi / 100),
        tenure: `${o.tenureMonths} Months`,
        fee: `₹${o.processingFee.toFixed(2)}`, // processingFee is already rupees
      }));
      setOffers(vm);
    } catch (e: any) {
      setErr(e?.message || 'Could not load your offers.');
    } finally {
      setLoading(false);
    }
  }, [state.applicationId]);

  useEffect(() => { load(); }, [load]);

  const select = async (o: OfferVM) => {
    if (state.applicationId && o.id) {
      set({ selectedOfferId: o.id });
      await api.selectOffer(state.applicationId, o.id).catch(() => {});
    }
    go('handoff');
  };

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader title={<View />} />
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        <StepBadge step={3} of={4} label="Your Offers" />
        <StepDots total={4} active={3} />
        <Text style={[font(800), { fontSize: 24, letterSpacing: -0.5, color: colors.text, marginTop: 14 }]}>Review Your Offers</Text>
        <Text style={[font(400), { fontSize: 13.5, color: colors.textSoft, marginTop: 4 }]}>
          We found {offers.length || 3} partners matching your profile. Choose the best fit.
        </Text>

        {loading ? (
          <Loading label="Fetching your offers…" />
        ) : err ? (
          <ErrorState message={err} onRetry={load} />
        ) : offers.length === 0 ? (
          <Empty icon="search_off" title="No offers yet" message="We couldn't match a partner to this profile. Try adjusting your amount." />
        ) : (
        <View style={{ gap: 14, marginTop: 18 }}>
          {offers.map((o, i) => (
            <View key={o.id || i} style={[styles.card, o.recommended && { borderColor: colors.primary, borderWidth: 1.5 }]}>
              {o.recommended ? (
                <View style={styles.ribbon}>
                  <Text style={[font(700), { fontSize: 10.5, color: '#fff', letterSpacing: 0.3 }]}>Recommended</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={styles.bank}>
                  <Icon name={o.icon} size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[font(800), { fontSize: 16, color: colors.text }]}>{o.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
                    {o.verified ? <Icon name="verified" size={14} color={colors.mint} /> : null}
                    <Text style={[font(600), { fontSize: 12, color: colors.greenDeep }]}>{o.tag}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.metrics}>
                <Metric label="Amount" value={o.amount} />
                <Metric label="APR" value={o.apr} highlight />
                <Metric label="EMI" value={o.emi} />
              </View>
              <View style={styles.metrics2}>
                <Metric label="Tenure" value={o.tenure} />
                <View style={styles.vdiv} />
                <Metric label="Processing Fee" value={o.fee} />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Pressable style={styles.compareBtn} onPress={() => showToast('Comparison — coming soon.')}>
                  <Text style={[font(600), { color: colors.text, fontSize: 14 }]}>Compare</Text>
                </Pressable>
                <Pressable style={styles.selectBtn} onPress={() => select(o)}>
                  <Text style={[font(700), { color: '#fff', fontSize: 14 }]}>Select Offer</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
        )}

        {/* Offer validity */}
        <View style={styles.info}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="info" size={18} color={colors.blue} />
            <Text style={[font(700), { fontSize: 14, color: colors.text }]}>Offer Validity</Text>
          </View>
          <Text style={[font(400), { fontSize: 12.5, lineHeight: 18, color: colors.textSoft, marginTop: 6 }]}>
            These offers are based on your preliminary credit assessment. Final approval and terms are subject to verification by the respective lenders.
          </Text>
          <View style={{ gap: 6, marginTop: 10 }}>
            <ValidRow text="Rates locked for 48 hours" />
            <ValidRow text="No impact on credit score for comparison" />
          </View>
        </View>

        {/* Flexible adjustments */}
        <View style={styles.flex}>
          <View style={styles.flexIcon}>
            <Icon name="payments" size={20} color={colors.primary} />
          </View>
          <Text style={[font(800), { fontSize: 16, color: colors.text, marginTop: 10 }]}>Flexible Adjustments</Text>
          <Text style={[font(400), { fontSize: 12.5, lineHeight: 18, color: colors.textSoft, marginTop: 2 }]}>
            Need a different amount or time frame? Adjust and refresh offers. Current Goal: Debt Consolidation
          </Text>
          <Pressable style={styles.updateBtn} onPress={() => go('basic')}>
            <Icon name="tune" size={18} color={colors.text} />
            <Text style={[font(600), { color: colors.text, fontSize: 14 }]}>Update Details</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[font(400), { fontSize: 11, color: colors.muted }]}>{label}</Text>
      <Text style={[font(800), { fontSize: 15, color: highlight ? colors.primary : colors.text, marginTop: 1 }]}>{value}</Text>
    </View>
  );
}
function ValidRow({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name="check_circle" size={15} color={colors.mint} />
      <Text style={[font(500), { fontSize: 12, color: colors.textMid }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 16 },
  ribbon: { position: 'absolute', top: -1, right: 16, backgroundColor: colors.primary, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  bank: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
  metrics: { flexDirection: 'row', marginTop: 14 },
  metrics2: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  vdiv: { width: 1, height: 26, backgroundColor: colors.lineSoft, marginHorizontal: 8 },
  compareBtn: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  selectBtn: { flex: 1.4, height: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  info: { marginTop: 16, backgroundColor: 'rgba(44,110,143,0.07)', borderRadius: 16, padding: 16 },
  flex: { marginTop: 14, backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 16, padding: 16 },
  flexIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
  updateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, marginTop: 14 },
});
