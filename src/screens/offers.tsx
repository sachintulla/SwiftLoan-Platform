import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Linking } from 'react-native';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { StepBadge, Chips } from '../components/Controls';
import { StepDots } from '../components/StepDots';
import { Loading } from '../components/common/Loading';
import { ErrorState } from '../components/common/ErrorState';
import { Empty } from '../components/common/Empty';
import { colors, font, rupee } from '../theme/tokens';
import { useStore } from '../state/store';
import { api, Offer } from '../api/client';
import { useVoiceTarget } from '../voice/useVoiceTarget';

export default function Offers() {
  const { state, set, go, showToast } = useStore();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(!!state.applicationId);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!state.applicationId) { setOffers([]); setLoading(false); return; }
    setErr(null); setLoading(true);
    try {
      const r: any = await api.getApplication(state.applicationId);
      setOffers((r.application?.offers || []) as Offer[]);
    } catch (e: any) {
      setErr(e?.message || 'Could not load your offers.');
    } finally {
      setLoading(false);
    }
  }, [state.applicationId]);

  useEffect(() => { load(); }, [load]);

  const select = async (offer: Offer, emiOptionId?: string) => {
    if (state.applicationId) {
      set({ selectedOfferId: offer.id });
      await api.selectOffer(state.applicationId, offer.id, emiOptionId).catch(() => {});
    }
    go('handoff');
  };

  return (
    <Screen scroll padded={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <AppHeader title={<View />} />
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        <StepBadge step={4} of={4} label="Your Offers" />
        <StepDots total={4} active={4} />
        <Text style={[font(800), { fontSize: 24, letterSpacing: -0.5, color: colors.text, marginTop: 14 }]}>Review Your Offers</Text>
        <Text style={[font(400), { fontSize: 13.5, color: colors.textSoft, marginTop: 4 }]}>
          {offers.length > 0
            ? `We found ${offers.length} partner${offers.length === 1 ? '' : 's'} matching your profile. Choose the best fit.`
            : 'Start an application to see your personalised offers.'}
        </Text>

        {loading ? (
          <Loading label="Fetching your offers…" />
        ) : err ? (
          <ErrorState message={err} onRetry={load} />
        ) : offers.length === 0 ? (
          !state.applicationId ? (
            <Empty icon="description" title="No application yet" message="Apply for a loan first — we'll match you with partner offers once your details are in." />
          ) : (
            <Empty icon="search_off" title="No offers yet" message="We couldn't match a partner to this profile. Try adjusting your amount." />
          )
        ) : (
        <View style={{ gap: 14, marginTop: 18 }}>
          {offers.map(o => (
            <OfferCard key={o.id} offer={o} onSelect={select} onCompare={() => showToast('Comparison — coming soon.')} />
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
          <Pressable style={styles.updateBtn} onPress={() => go('basicpan')}>
            <Icon name="tune" size={18} color={colors.text} />
            <Text style={[font(600), { color: colors.text, fontSize: 14 }]}>Update Details</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

/**
 * One lender offer — a multi-tenure EMI picker (Chips) drives which
 * OfferEmiOption's numbers are shown, defaulting to whichever option the
 * server marked `recommended`. Mirrors the sample lender-API response shape
 * (rating/RBI badge, fee + GST breakdown, net disbursal, feature bullets).
 */
function OfferCard({ offer, onSelect, onCompare }: { offer: Offer; onSelect: (offer: Offer, emiOptionId?: string) => void; onCompare: () => void }) {
  const recommendedOption = offer.emiOptions.find(o => o.recommended) ?? offer.emiOptions[0];
  const [tenureMonths, setTenureMonths] = useState<number | undefined>(recommendedOption?.tenureMonths);
  const selected = offer.emiOptions.find(o => o.tenureMonths === tenureMonths) ?? recommendedOption;
  // Some lenders (or a real integration whose BRE hasn't priced anything yet —
  // an empty offers/options response is a real case, not just a bug) don't
  // give a fixed EMI upfront. The card still needs to render something useful
  // instead of quietly disappearing.
  const hasEmi = !!selected;

  useVoiceTarget(
    offer.partner.name,
    { kind: 'button', onTap: () => onSelect(offer, selected?.id) },
    [offer, selected],
  );

  const badgeText = offer.badgeText || (offer.recommended ? 'Recommended' : null);

  return (
    <View style={[styles.card, offer.recommended && styles.cardRecommended]}>
      <View style={styles.cardTop}>
        <View style={styles.bank}>
          {(offer.lenderLogoUrl || offer.partner.logoUrl) ? (
            <Image source={{ uri: (offer.lenderLogoUrl || offer.partner.logoUrl)! }} style={{ width: 28, height: 28, borderRadius: 6 }} resizeMode="contain" />
          ) : (
            <Icon name={offer.partner.icon} size={22} color={colors.primary} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          {/* Real lender's name (from the partner API) headlines; the aggregator
              partner it came through is shown small underneath. */}
          <Text style={[font(800), { fontSize: 17, color: colors.text, letterSpacing: -0.2 }]}>{offer.lenderName || offer.partner.name}</Text>
          {offer.lenderName ? (
            <Text style={[font(500), { fontSize: 10.5, color: colors.muted, marginTop: 1 }]}>via {offer.partner.name}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
            {offer.offerLikelihood && offer.offerLikelihood !== '0' ? (
              <View style={styles.trustPill}>
                <Icon name="bolt" size={11} color={colors.greenDeep} />
                <Text style={[font(700), { fontSize: 10.5, color: colors.greenDeep }]}>High match</Text>
              </View>
            ) : null}
            {offer.partner.rbiApproved ? (
              <View style={styles.trustPill}>
                <Icon name="verified" size={12} color={colors.greenDeep} />
                <Text style={[font(700), { fontSize: 10.5, color: colors.greenDeep }]}>RBI Approved</Text>
              </View>
            ) : null}
            {offer.partner.rating != null ? (
              <View style={styles.ratingPill}>
                <Icon name="star" size={11} color={colors.amber} />
                <Text style={[font(700), { fontSize: 11, color: colors.text }]}>{offer.partner.rating.toFixed(1)}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {badgeText ? (
          <View style={styles.badge}>
            <Text style={[font(700), { fontSize: 10.5, color: '#fff', letterSpacing: 0.2 }]}>{badgeText}</Text>
          </View>
        ) : null}
      </View>

      {hasEmi ? (
        <>
          {offer.emiOptions.length > 1 ? (
            <Chips
              style={{ marginTop: 16 }}
              options={offer.emiOptions.map(o => ({ label: `${o.tenureMonths} mo`, value: String(o.tenureMonths) }))}
              value={String(tenureMonths)}
              onChange={v => setTenureMonths(Number(v))}
            />
          ) : null}

          {/* Hero metric — the one number that matters most, set apart from the
              secondary interest/repayment figures rather than three equal columns. */}
          <View style={styles.emiHero}>
            <View>
              <Text style={[font(600), { fontSize: 11.5, color: colors.greenDeep }]}>Monthly EMI</Text>
              <Text style={[font(800), { fontSize: 26, color: colors.primary, letterSpacing: -0.5, marginTop: 2 }]}>{rupee(selected!.monthlyEmi)}</Text>
            </View>
            <View style={styles.heroDiv} />
            <View style={{ flex: 1, gap: 8 }}>
              <MiniStat label="Total interest" value={rupee(selected!.totalInterestPayable)} />
              <MiniStat label="Total repayment" value={rupee(selected!.totalRepaymentAmount)} />
            </View>
          </View>
        </>
      ) : (
        // No priced EMI yet — a real lender whose rate is only known after
        // approval (e.g. UnitySFB/MoneyView elsewhere in this app), or a BRE
        // that hasn't returned any options. Still shows what IS known —
        // amount/rate/disbursal — rather than an empty placeholder.
        <View style={styles.pendingBox}>
          <Metric label="Eligible amount" value={rupee(offer.amount)} highlight />
          <Metric label="Interest rate" value={`${offer.apr}% p.a.`} />
          <Metric label="Disbursal time" value={offer.partner.disbursalTimeHrs ? `${offer.partner.disbursalTimeHrs} hr` : 'Instant'} />
        </View>
      )}

      {/* Fee breakdown — a compact "receipt" strip rather than another metrics row. */}
      <View style={styles.receipt}>
        <View style={{ flex: 1 }}>
          <Text style={[font(500), { fontSize: 11, color: colors.muted }]}>Processing fee</Text>
          <Text style={[font(700), { fontSize: 13, color: colors.text, marginTop: 1 }]}>
            {rupee(offer.processingFeeAmount)} <Text style={{ color: colors.textSoft, fontSize: 11 }}>+ {rupee(offer.gstOnProcessingFee)} GST</Text>
          </Text>
        </View>
        <Icon name="arrow_forward" size={14} color={colors.muted} />
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={[font(500), { fontSize: 11, color: colors.muted }]}>You receive</Text>
          <Text style={[font(800), { fontSize: 14, color: colors.greenDeep, marginTop: 1 }]}>{rupee(offer.netDisbursalAmount)}</Text>
        </View>
      </View>

      {offer.partner.features.length ? (
        <View style={styles.featuresBox}>
          {offer.partner.features.map((f, i) => <ValidRow key={i} text={f} />)}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 }}>
        <Pressable style={styles.compareBtn} onPress={onCompare} hitSlop={8}>
          <Text style={[font(600), { color: colors.textMid, fontSize: 13.5 }]}>Compare</Text>
        </Pressable>
        <Pressable
          style={styles.selectBtn}
          onPress={() => {
            // Record the selection in our funnel, then — for a real partner
            // offer that carries a lender deep link — hand off to the lender's
            // page to complete the application.
            onSelect(offer, selected?.id);
            if (offer.redirectionUrl) Linking.openURL(offer.redirectionUrl).catch(() => {});
          }}
        >
          <Text style={[font(700), { color: '#fff', fontSize: 15 }]}>{offer.redirectionUrl ? 'Continue' : 'Select Offer'}</Text>
          <Icon name="arrow_forward" size={17} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={[font(500), { fontSize: 12, color: colors.textSoft }]}>{label}</Text>
      <Text style={[font(700), { fontSize: 13, color: colors.text }]}>{value}</Text>
    </View>
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
function ValidRow({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name="check_circle" size={15} color={colors.mint} />
      <Text style={[font(500), { fontSize: 12, color: colors.textMid }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
    shadowColor: '#0A3F41',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  // Border only — a whole-card translucent tint looked patchy once the hero
  // EMI/receipt/pending boxes (each with their own opaque background) sat on
  // top of it, breaking the wash into uneven visible rectangles.
  cardRecommended: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bank: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  trustPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.chip, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2.5 },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(245,166,36,0.14)', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2.5 },
  badge: { backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, shadowColor: '#0A3F41', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  emiHero: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    backgroundColor: colors.surfaceSoft,
    borderRadius: 14,
    padding: 14,
    gap: 14,
  },
  heroDiv: { width: 1, height: 40, backgroundColor: colors.lineSoft },
  pendingBox: {
    flexDirection: 'row',
    marginTop: 16,
    backgroundColor: colors.surfaceSoft,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  receipt: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  featuresBox: { gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  compareBtn: { paddingHorizontal: 14, height: 46, alignItems: 'center', justifyContent: 'center' },
  selectBtn: { flex: 1, flexDirection: 'row', gap: 6, height: 46, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  info: { marginTop: 16, backgroundColor: 'rgba(44,110,143,0.07)', borderRadius: 16, padding: 16 },
  flex: { marginTop: 14, backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 16, padding: 16 },
  flexIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
  updateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, marginTop: 14 },
});
