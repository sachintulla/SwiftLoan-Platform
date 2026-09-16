import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import Icon from './Icon';
import { Skeleton } from './common/Loading';
import { colors, font, inr } from '../theme/tokens';
import { api, PrequalifyingOffer } from '../api/client';
import { LENDER_LOGOS } from '../theme/lenderLogos';

// These are SPONSORED LENDER ADS — marketing creatives lenders publish in
// SwiftLoan — deliberately NOT styled like the personalised "eligible offers"
// (My Offers). A coloured ad band + "Sponsored" label + a soft "Check
// eligibility" CTA keep them unmistakably promotional. Shown two-per-row.
const AD_TINTS = ['#079FA0', '#5B6EE1', '#C98A2B', '#2FB183', '#C7566B', '#7C6BD8', '#3E7BB6'];

// Resolve a logo by keyword so every lender shows its image regardless of the
// exact display name ("IDFC First Bank" → idfc, "Unity Small Finance Bank" →
// unitysfb, either FREO line → freo). Falls back to the offer's hosted logoUrl
// (admin-set), then the exact-match map, then a glyph.
const LOGO_KEYWORDS: [RegExp, ReturnType<typeof require>][] = [
  [/moneyview/i, require('../../assets/logos/moneyview.png')],
  [/zype/i, require('../../assets/logos/zype.png')],
  [/idfc/i, require('../../assets/logos/idfc.png')],
  [/unity/i, require('../../assets/logos/unitysfb.png')],
  [/prefr/i, require('../../assets/logos/prefr.png')],
  [/freo/i, require('../../assets/logos/freo.png')],
];
function lenderLogoFor(o: PrequalifyingOffer): ReturnType<typeof require> | { uri: string } | null {
  for (const [re, src] of LOGO_KEYWORDS) if (re.test(o.lenderName)) return src;
  if (o.logoUrl) return { uri: o.logoUrl };
  return LENDER_LOGOS[o.lenderName] ?? null;
}

function AdTile({ offer, index, onCheckEligibility }: { offer: PrequalifyingOffer; index: number; onCheckEligibility: (o: PrequalifyingOffer) => void }) {
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 300, delay: index * 55, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [enter, index]);

  const tint = AD_TINTS[index % AD_TINTS.length];
  const logo = lenderLogoFor(offer);
  const amountR = Math.round(offer.amount / 100);

  return (
    <Animated.View style={[styles.tileWrap, { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
      <View style={styles.card}>
        {/* Coloured ad band — lender logo + name. */}
        <View style={[styles.band, { backgroundColor: tint }]}>
          <View style={styles.logoTile}>
            {logo ? <Image source={logo} style={{ width: 34, height: 34 }} resizeMode="contain" />
                  : <Icon name={offer.icon || 'account_balance'} size={22} color={colors.primary} />}
          </View>
          <Text style={[font(800), { flex: 1, fontSize: 12, color: '#fff', lineHeight: 15 }]} numberOfLines={2}>{offer.lenderName}</Text>
        </View>

        <View style={styles.body}>
          <Text style={[font(600), { fontSize: 8.5, letterSpacing: 0.5, color: colors.muted }]}>SPONSORED</Text>
          <Text style={[font(500), { fontSize: 10.5, color: colors.textSoft, marginTop: 5 }]}>Loans up to</Text>
          <Text style={[font(800), { fontSize: 19, color: colors.text, letterSpacing: -0.5 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{inr(amountR)}</Text>
          <Text style={[font(600), { fontSize: 11, color: colors.greenDeep, marginTop: 2 }]} numberOfLines={1}>from {offer.rate}% · {offer.tenureMonths} mo</Text>
          {/* Fixed-height tag slot — reserved whether or not there's a tag, so
              every tile is the same height regardless of badges. */}
          <View style={styles.tagSlot}>
            {offer.badge ? (
              <View style={[styles.badge, { borderColor: tint }]}>
                <Text style={[font(700), { fontSize: 9, color: tint }]} numberOfLines={1}>{offer.badge}</Text>
              </View>
            ) : null}
          </View>

          <Pressable onPress={() => onCheckEligibility(offer)} style={styles.cta}>
            <Text style={[font(700), { fontSize: 11.5, color: colors.primary }]}>Check eligibility</Text>
            <Icon name="arrow_forward" size={13} color={colors.primary} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * "Featured offers" — a two-per-row grid of SPONSORED lender ads shown near the
 * top of Home on login. Marketing creatives, distinct from the user's
 * personalised eligible offers; "Check eligibility" starts the normal funnel.
 * Renders nothing when there are no ads.
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
    return <View style={{ marginTop: 20 }}><Skeleton height={168} style={{ borderRadius: 16 }} /></View>;
  }
  if (!offers || offers.length === 0) return null;

  return (
    <View style={{ marginTop: 22 }}>
      <View style={styles.header}>
        <Text style={[font(800), { fontSize: 16, color: colors.text }]}>Featured offers</Text>
        <Text style={[font(500), { fontSize: 11, color: colors.muted }]}>Sponsored</Text>
      </View>
      <Text style={[font(400), { fontSize: 12, color: colors.textSoft, marginTop: 2, marginBottom: 12 }]}>
        From our lending partners — check your eligibility in minutes.
      </Text>
      <View style={styles.grid}>
        {offers.map((o, i) => <AdTile key={o.id} offer={o} index={i} onCheckEligibility={onCheckEligibility} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  tileWrap: { width: '48.5%' },
  card: {
    borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff',
    borderWidth: 1, borderColor: colors.line,
    shadowColor: '#0A3F41', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  band: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 9 },
  logoTile: { width: 40, height: 40, borderRadius: 9, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  body: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 },
  tagSlot: { height: 22, justifyContent: 'center', marginTop: 8 },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1.5 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: 'rgba(7,159,160,0.10)', borderRadius: 10, paddingVertical: 10, marginTop: 10,
  },
});
