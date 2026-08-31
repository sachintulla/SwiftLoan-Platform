import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import Icon from './Icon';
import { Skeleton } from './common/Loading';
import { colors, font, inr } from '../theme/tokens';
import { api, PrequalifyingOffer } from '../api/client';
import { LENDER_LOGOS } from '../theme/lenderLogos';

/** Lender logo, filling the tile when a real logo exists; else a bank glyph. */
function LenderLogo({ offer, size = 40 }: { offer: PrequalifyingOffer; size?: number }) {
  const src = LENDER_LOGOS[offer.lenderName] ?? (offer.logoUrl ? { uri: offer.logoUrl } : null);
  if (src) {
    return (
      <View style={[styles.logoTile, { width: size, height: size, borderRadius: size * 0.28 }]}>
        <Image source={src} style={{ width: size - 6, height: size - 6 }} resizeMode="contain" />
      </View>
    );
  }
  return (
    <View style={[styles.iconChip, { width: size, height: size, borderRadius: size * 0.28 }]}>
      <Icon name={offer.icon || 'account_balance'} size={size * 0.5} color={colors.primary} />
    </View>
  );
}

function OfferCard({ offer, index, onAccept }: { offer: PrequalifyingOffer; index: number; onAccept: (o: PrequalifyingOffer) => void }) {
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 340, delay: index * 70, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [enter, index]);

  // amount is in paise; inr() expects rupees.
  const amountR = Math.round(offer.amount / 100);

  return (
    <Animated.View style={{ opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
      <View style={styles.card}>
        <View style={styles.top}>
          <LenderLogo offer={offer} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={[font(800), { fontSize: 15, color: colors.text }]} numberOfLines={1}>{offer.lenderName}</Text>
            <Text style={[font(500), { fontSize: 11, color: colors.greenDeep, marginTop: 1 }]}>Pre-approved for you</Text>
          </View>
          {offer.badge ? (
            <View style={styles.badge}>
              <Text style={[font(700), { fontSize: 9.5, color: '#fff', letterSpacing: 0.2 }]}>{offer.badge}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.metrics}>
          <View style={{ flex: 1 }}>
            <Text style={[font(600), { fontSize: 10, color: colors.greenDeep }]}>Up to</Text>
            <Text style={[font(800), { fontSize: 20, color: colors.primary, letterSpacing: -0.4 }]} numberOfLines={1}>{inr(amountR)}</Text>
          </View>
          <View style={styles.div} />
          <View>
            <Text style={[font(600), { fontSize: 10, color: colors.muted }]}>Rate</Text>
            <Text style={[font(700), { fontSize: 14, color: colors.text }]}>{offer.rate}% p.a.</Text>
          </View>
          <View style={styles.div} />
          <View>
            <Text style={[font(600), { fontSize: 10, color: colors.muted }]}>Tenure</Text>
            <Text style={[font(700), { fontSize: 14, color: colors.text }]}>{offer.tenureMonths} mo</Text>
          </View>
        </View>

        {offer.terms ? (
          <Text style={[font(400), { fontSize: 11, lineHeight: 15, color: colors.textSoft, marginTop: 8 }]} numberOfLines={2}>{offer.terms}</Text>
        ) : null}

        <Pressable onPress={() => onAccept(offer)} style={styles.acceptBtn}>
          <Text style={[font(700), { fontSize: 13.5, color: '#fff' }]}>Accept offer</Text>
          <Icon name="arrow_forward" size={16} color="#fff" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

/**
 * "Pre-qualified for you" — firm, admin-curated offers shown at the top of the
 * home screen on login (GET /prequalifying-offers). Renders nothing when there
 * are none, so it never leaves an empty header behind. `onAccept` starts the
 * shortened accept flow (PAN + KYC → lender handoff).
 */
export function PrequalifiedOffers({ onAccept }: { onAccept: (o: PrequalifyingOffer) => void }) {
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
    return <View style={{ marginTop: 6 }}><Skeleton height={132} style={{ borderRadius: 16 }} /></View>;
  }
  if (!offers || offers.length === 0) return null;

  return (
    <View style={{ marginTop: 20 }}>
      <View style={styles.header}>
        <Icon name="verified" size={17} color={colors.primary} />
        <Text style={[font(800), { fontSize: 16, color: colors.text }]}>Pre-qualified for you</Text>
      </View>
      <Text style={[font(400), { fontSize: 12, color: colors.textSoft, marginTop: 2 }]}>
        Firm offers ready to accept — no credit-score impact.
      </Text>
      <View style={{ gap: 12, marginTop: 12 }}>
        {offers.map((o, i) => <OfferCard key={o.id} offer={o} index={i} onAccept={onAccept} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: colors.line,
    shadowColor: '#0A3F41', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoTile: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  iconChip: { backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
  badge: { backgroundColor: colors.mint, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  metrics: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12,
    backgroundColor: 'rgba(7,159,160,0.05)', borderRadius: 12, padding: 12,
  },
  div: { width: 1, height: 26, backgroundColor: colors.line },
  acceptBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, marginTop: 12,
  },
});
