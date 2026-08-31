import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Animated, Easing, ScrollView } from 'react-native';
import Icon from './Icon';
import { Skeleton } from './common/Loading';
import { colors, font, inr } from '../theme/tokens';
import { api, PrequalifyingOffer } from '../api/client';
import { LENDER_LOGOS } from '../theme/lenderLogos';

// These are SPONSORED LENDER ADS — marketing creatives the lenders publish in
// SwiftLoan — deliberately NOT styled like the personalised "eligible offers"
// (My Offers). A coloured ad band + "Sponsored" chip + a soft "Check
// eligibility" CTA keep them unmistakably promotional, not a firm personal
// offer. Rotating band colours give each creative its own look.
const AD_TINTS = ['#079FA0', '#5B6EE1', '#C98A2B', '#2FB183', '#C7566B', '#7C6BD8', '#3E7BB6'];

const CARD_W = 282;

function LenderLogo({ offer }: { offer: PrequalifyingOffer }) {
  const src = LENDER_LOGOS[offer.lenderName] ?? (offer.logoUrl ? { uri: offer.logoUrl } : null);
  return (
    <View style={styles.logoTile}>
      {src ? (
        <Image source={src} style={{ width: 24, height: 24 }} resizeMode="contain" />
      ) : (
        <Icon name={offer.icon || 'account_balance'} size={18} color={colors.primary} />
      )}
    </View>
  );
}

function AdCard({ offer, index, onCheckEligibility }: { offer: PrequalifyingOffer; index: number; onCheckEligibility: (o: PrequalifyingOffer) => void }) {
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 320, delay: index * 60, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [enter, index]);

  const tint = AD_TINTS[index % AD_TINTS.length];
  const amountR = Math.round(offer.amount / 100);

  return (
    <Animated.View style={{ opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
      <View style={styles.card}>
        {/* Coloured ad band — lender brand + Sponsored chip. */}
        <View style={[styles.band, { backgroundColor: tint }]}>
          <LenderLogo offer={offer} />
          <Text style={[font(800), { flex: 1, fontSize: 14, color: '#fff' }]} numberOfLines={1}>{offer.lenderName}</Text>
          <View style={styles.sponsored}>
            <Text style={[font(700), { fontSize: 8.5, color: '#fff', letterSpacing: 0.5 }]}>SPONSORED</Text>
          </View>
        </View>

        {/* Marketing claim — framed as an ad ("up to" / "from"), not a firm offer. */}
        <View style={styles.body}>
          <Text style={[font(500), { fontSize: 11, color: colors.textSoft }]}>Loans up to</Text>
          <Text style={[font(800), { fontSize: 23, color: colors.text, letterSpacing: -0.5, marginTop: 1 }]} numberOfLines={1}>{inr(amountR)}</Text>
          <Text style={[font(600), { fontSize: 12, color: colors.greenDeep, marginTop: 3 }]}>
            from {offer.rate}% p.a.  ·  up to {offer.tenureMonths} mo
          </Text>
          {offer.terms ? (
            <Text style={[font(400), { fontSize: 10.5, lineHeight: 14, color: colors.muted, marginTop: 8, minHeight: 28 }]} numberOfLines={2}>{offer.terms}</Text>
          ) : <View style={{ minHeight: 28, marginTop: 8 }} />}

          <Pressable onPress={() => onCheckEligibility(offer)} style={styles.cta}>
            <Text style={[font(700), { fontSize: 12.5, color: colors.primary }]}>Check eligibility</Text>
            <Icon name="arrow_forward" size={14} color={colors.primary} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * "Featured offers" — a horizontal carousel of SPONSORED lender ads shown near
 * the top of Home on login. These are marketing creatives, distinct from the
 * user's personalised eligible offers; tapping "Check eligibility" starts the
 * normal application funnel. Renders nothing when there are no ads.
 */
export function PrequalifiedOffers({ onCheckEligibility }: { onCheckEligibility: (o: PrequalifyingOffer) => void }) {
  const [offers, setOffers] = useState<PrequalifyingOffer[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.prequalifyingOffers()
      .then((res) => { if (alive) setOffers(res.data || []); })
      .catch(() => { if (alive) setOffers([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return <View style={{ marginTop: 20 }}><Skeleton height={188} style={{ borderRadius: 16 }} /></View>;
  }
  if (!offers || offers.length === 0) return null;

  return (
    <View style={{ marginTop: 22 }}>
      <View style={styles.header}>
        <Text style={[font(800), { fontSize: 16, color: colors.text }]}>Featured offers</Text>
        <Text style={[font(500), { fontSize: 11, color: colors.muted }]}>Sponsored</Text>
      </View>
      <Text style={[font(400), { fontSize: 12, color: colors.textSoft, marginTop: 2 }]}>
        From our lending partners — check your eligibility in minutes.
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 20, paddingVertical: 12, gap: 12 }}
        style={{ marginHorizontal: -20, paddingHorizontal: 20 }}
      >
        {offers.map((o, i) => <AdCard key={o.id} offer={o} index={i} onCheckEligibility={onCheckEligibility} />)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: {
    width: CARD_W, borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff',
    borderWidth: 1, borderColor: colors.line,
    shadowColor: '#0A3F41', shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  band: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11 },
  logoTile: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  sponsored: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2.5 },
  body: { padding: 14 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(7,159,160,0.10)', borderRadius: 11, paddingVertical: 11, marginTop: 12,
  },
});
