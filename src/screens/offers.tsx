import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Screen, AppHeader } from '../components/Frame';
import Icon from '../components/Icon';
import { StepBadge, Chips } from '../components/Controls';
import { StepDots } from '../components/StepDots';
import { Loading } from '../components/common/Loading';
import { ErrorState } from '../components/common/ErrorState';
import { Empty } from '../components/common/Empty';
import { colors, font, rupee } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { api, Offer } from '../api/client';
import { agent } from '../voice';
import { useVoiceTarget } from '../voice/useVoiceTarget';

function bandColor(band: string): string {
  if (band.includes('EXCELLENT') || band.includes('GOOD')) return colors.green;
  if (band.includes('FAIR') || band.includes('AVERAGE')) return colors.amber;
  if (band.includes('POOR')) return colors.red;
  return colors.green;
}
function bandLabel(band: string): string {
  return band.charAt(0) + band.slice(1).toLowerCase();
}

/** Primary CTA with a repeating "sparkle" shine sweeping across it. */
function SparkleButton({ label, onPress }: { label: string; onPress: () => void }) {
  const shine = useRef(new Animated.Value(0)).current;
  const twinkle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(700),
        Animated.timing(shine, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(twinkle, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(twinkle, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    ).start();
  }, [shine, twinkle]);

  const translateX = shine.interpolate({ inputRange: [0, 1], outputRange: [-140, 420] });
  const sparkOpacity = twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const sparkScale = twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] });

  return (
    <Pressable style={styles.selectBtn} onPress={onPress}>
      <Animated.View style={{ opacity: sparkOpacity, transform: [{ scale: sparkScale }] }}>
        <Icon name="auto_awesome" size={16} color="#fff" />
      </Animated.View>
      <Text style={[font(700), { color: '#fff', fontSize: 15 }]}>{label}</Text>
      <Icon name="arrow_forward" size={17} color="#fff" />
      {/* Diagonal shine sweep, clipped to the button. */}
      <Animated.View style={[styles.shine, { transform: [{ translateX }, { rotate: '20deg' }] }]} pointerEvents="none">
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </Pressable>
  );
}

export default function Offers() {
  const { state, set, go } = useStore();
  const t = useT();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(!!state.applicationId);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!state.applicationId) { setOffers([]); setLoading(false); return; }
    setErr(null); setLoading(true);
    try {
      const r: any = await api.getApplication(state.applicationId);
      const list = (r.application?.offers || []) as Offer[];
      setOffers(list);
      // Give the voice agent a one-line summary of what came back (or the issue),
      // then push a fresh page-context so it can proactively talk about the offers.
      const top = list[0];
      const topEmi = top?.emiOptions?.[0]?.monthlyEmi;
      const summary = list.length
        ? `${list.length} offer${list.length > 1 ? 's' : ''} available. Top match: ` +
          `${top.lenderName || top.partner?.name || 'a lending partner'}` +
          `${top.apr ? ` at ${top.apr}% p.a.` : ''}` +
          `${topEmi ? `, monthly EMI ${rupee(topEmi)}` : ''}.`
        : (state.offersError || 'No offers were returned for this profile right now.');
      set({ offersSummary: summary });
    } catch (e: any) {
      setErr(e?.message || 'Could not load your offers.');
      set({ offersSummary: 'There was a problem loading the offers.' });
    } finally {
      setLoading(false);
    }
  }, [state.applicationId]);

  // Push the page-context update from an effect on the committed value, not
  // synchronously after set() above — set() dispatches to the store
  // asynchronously, so calling updatePageContext() in the same tick read
  // pageContextFn() before React had re-rendered, sending the *previous*
  // (often empty) offersSummary. The agent silently had nothing to say about
  // offers that had, from the user's point of view, already loaded on screen.
  useEffect(() => {
    if (state.offersSummary) agent.updatePageContext();
  }, [state.offersSummary]);

  useEffect(() => { load(); }, [load]);

  const select = async (offer: Offer, emiOptionId?: string) => {
    // Already applied to this lender → don't re-apply; take the user to My Loans
    // to see this lender application's live status.
    if (offer.applied) {
      go('loans');
      return;
    }
    // Real lender (carries a deep link): do NOT create the application yet. Open
    // the lender's web flow; the per-lender application is created only once KFT
    // confirms the submission (application_submitted webhook) — i.e. after the
    // user completes OTP verification on the lender's page. Returning from the
    // lender page lands the user on My Loans (see lenderweb).
    if (offer.redirectionUrl) {
      if (state.applicationId) set({ selectedOfferId: offer.id });
      set({ webUrl: offer.redirectionUrl, webTitle: offer.lenderName || 'Complete your application' });
      go('lenderweb');
      return;
    }
    // Mock / no-redirect lender (dev/demo, no OTP web flow): create immediately
    // and go to the native handoff screen.
    if (state.applicationId) {
      set({ selectedOfferId: offer.id });
      await api.applyOffer(state.applicationId, offer.id, emiOptionId).catch(() => {});
      setOffers(prev => prev.map(o => (o.id === offer.id ? { ...o, applied: true, lenderStatus: o.lenderStatus || 'handoff' } : o)));
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
        <Text style={[font(800), { fontSize: 24, letterSpacing: -0.5, color: colors.text, marginTop: 14 }]}>{t.reviewOffers}</Text>
        <Text style={[font(400), { fontSize: 13.5, color: colors.textSoft, marginTop: 4 }]}>
          {offers.length > 0
            ? `We found ${offers.length} partner${offers.length === 1 ? '' : 's'} matching your profile. Choose the best fit.`
            : 'Start an application to see your personalised offers.'}
        </Text>

        {/* CIBIL score is shown only on My Loans, not here (see bug #8). */}

        {loading ? (
          <Loading label="Fetching your offers…" />
        ) : err ? (
          <ErrorState message={err} onRetry={load} />
        ) : offers.length === 0 ? (
          !state.applicationId ? (
            <Empty icon="description" title="No application yet" message="Apply for a loan first — we'll match you with partner offers once your details are in." />
          ) : state.offersError ? (
            // Lender-side rejection turned into an actionable note guiding the
            // user to correct their details (then "Update details" below).
            <Empty icon="error" title="Let’s fix a few details" message={state.offersError} />
          ) : (
            <Empty icon="search_off" title="No offers yet" message="We couldn't match a partner to this profile. Try adjusting your amount." />
          )
        ) : (
        <View style={{ gap: 14, marginTop: 18 }}>
          {offers.map(o => (
            <OfferCard key={o.id} offer={o} onSelect={select} />
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

// Friendly label for an applied lender's tracked status (shown on the tile).
const LENDER_STATUS_LABEL: Record<string, string> = {
  handoff: 'Applied',
  under_review: 'Under review',
  approved: 'Approved',
  disbursed: 'Disbursed',
  rejected: 'Rejected',
  failed: 'Failed',
  closed: 'Closed',
};

/**
 * One lender offer — a multi-tenure EMI picker (Chips) drives which
 * OfferEmiOption's numbers are shown, defaulting to whichever option the
 * server marked `recommended`. Mirrors the sample lender-API response shape
 * (rating/RBI badge, fee + GST breakdown, net disbursal, feature bullets).
 */
function OfferCard({ offer, onSelect }: { offer: Offer; onSelect: (offer: Offer, emiOptionId?: string) => void }) {
  const t = useT();
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
  const appliedLabel = offer.applied ? (LENDER_STATUS_LABEL[offer.lenderStatus || 'handoff'] || 'Applied') : null;

  return (
    <View style={[styles.card, offer.recommended && styles.cardRecommended]}>
      <View style={styles.cardTop}>
        <View style={[styles.bank, (offer.lenderLogoUrl || offer.partner.logoUrl) && styles.bankLogo]}>
          {(offer.lenderLogoUrl || offer.partner.logoUrl) ? (
            <Image source={{ uri: (offer.lenderLogoUrl || offer.partner.logoUrl)! }} style={{ width: 42, height: 42 }} resizeMode="contain" />
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
            {offer.applied ? (
              <View style={styles.appliedPill}>
                <Icon name="check_circle" size={12} color={colors.primary} />
                <Text style={[font(700), { fontSize: 10.5, color: colors.primary }]}>{appliedLabel}</Text>
              </View>
            ) : null}
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

      <View style={{ marginTop: 16 }}>
        {/* Record the selection in our funnel; select() then opens the lender's
            page in the in-app WebView (or the handoff screen when there's no
            deep link). */}
        <SparkleButton
          label={offer.applied ? 'View in My Loans' : (offer.redirectionUrl ? t.applyLoan : t.selectOffer)}
          onPress={() => onSelect(offer, selected?.id)}
        />
      </View>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  // Label stacked above the value so large currency amounts (e.g. ₹1,87,03,860)
  // get the full column width and never overflow the card. adjustsFontSizeToFit
  // is a final safeguard for extreme amounts.
  return (
    <View>
      <Text style={[font(500), { fontSize: 11, color: colors.textSoft }]} numberOfLines={1}>{label}</Text>
      <Text
        style={[font(700), { fontSize: 13, color: colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {value}
      </Text>
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
  creditCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 14,
  },
  creditIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
  bandPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
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
  bank: { width: 48, height: 48, borderRadius: 13, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  // A real lender logo already carries its own colours — show it on plain white
  // (no mint tint/frame) so it renders cleanly and reads well.
  bankLogo: { backgroundColor: '#FFFFFF' },
  trustPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.chip, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2.5 },
  appliedPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(7,159,160,0.12)', borderWidth: 1, borderColor: 'rgba(7,159,160,0.35)', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2.5 },
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
  selectBtn: { width: '100%', flexDirection: 'row', gap: 6, height: 48, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  shine: { position: 'absolute', top: -16, height: 80, width: 40 },
  info: { marginTop: 16, backgroundColor: 'rgba(44,110,143,0.07)', borderRadius: 16, padding: 16 },
  flex: { marginTop: 14, backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 16, padding: 16 },
  flexIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
  updateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, marginTop: 14 },
});
