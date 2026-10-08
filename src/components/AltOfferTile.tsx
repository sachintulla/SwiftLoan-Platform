import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import Icon from './Icon';
import { colors, font } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { api } from '../api/client';
import { useVoiceTarget } from '../voice/useVoiceTarget';

/**
 * Alternative-offers tile (Yubi Markets / YMPL facility).
 *
 * A deliberately distinct tile — not a lender offer card — that opens a partner
 * web journey inside the app. Shown:
 *   • `variant="default"` — below the matched Aurix offers ("More offers from
 *      our partners"), as an always-available extra path.
 *   • `variant="empty"` — in the no-offers state ("Other offers"), so an
 *      applicant Aurix couldn't match is never dead-ended.
 *
 * On tap it mints a fresh redirect URL server-side (POST /applications/:id/
 * alt-offer) and navigates to the in-app WebView. Every failure path degrades
 * to a toast — the facility is a bonus and must never break the screen.
 */
export default function AltOfferTile({ variant = 'default' }: { variant?: 'default' | 'empty' }) {
  const { state, set, go, showToast } = useStore();
  const t = useT();
  const [loading, setLoading] = useState(false);

  const empty = variant === 'empty';
  const title = empty ? t.altOffersTileEmptyTitle : t.altOffersTileTitle;
  const sub = empty ? t.altOffersTileEmptySub : t.altOffersTileSub;

  const open = async () => {
    if (loading) return;
    const appId = state.applicationId;
    if (!appId) { showToast(t.altOffersOpenFailed); return; }
    setLoading(true);
    showToast(t.altOffersOpening);
    try {
      const r = await api.altOfferRedirect(appId);
      const alt = r?.altOffer;
      if (alt?.available && alt.redirectUrl) {
        set({ webUrl: alt.redirectUrl, webTitle: t.altOffersTitle, altPrefill: alt.prefill || (alt.pan ? { pan: alt.pan } : {}), altResumeToOffers: !!alt.resumeToOffers });
        go('altweb');
      } else {
        showToast(t.altOffersOpenFailed);
      }
    } catch {
      showToast(t.altOffersOpenFailed);
    } finally {
      setLoading(false);
    }
  };

  // Voice: "View more offers" / "Show other offers" both map here.
  useVoiceTarget(empty ? 'Show other offers' : 'View more offers', { kind: 'button', onTap: open }, [state.applicationId, loading]);

  // Only meaningful once an application exists to refer; the server needs it to
  // register the referral. Hidden on the brand-new "never applied" state.
  if (!state.altOffersEnabled || !state.applicationId) return null;

  return (
    <Pressable
      onPress={open}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.tile, empty && styles.tileEmpty, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.iconWrap}>
        {loading ? <ActivityIndicator color={colors.primary} /> : <Icon name="storefront" size={22} color={colors.primary} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[font(800), styles.title]} numberOfLines={1}>{title}</Text>
        <View style={styles.subRow}>
          <View style={styles.badge}>
            <Icon name="auto_awesome" size={10} color={colors.greenDeep} />
            <Text style={[font(700), styles.badgeText]} numberOfLines={1}>{t.partnerLenderLabel}</Text>
          </View>
        </View>
        <Text style={[font(500), styles.sub]} numberOfLines={2}>{sub}</Text>
      </View>
      <View style={styles.cta}>
        <Text style={[font(700), styles.ctaText]}>{t.altOffersTileCta}</Text>
        <Icon name="chevron_right" size={20} color="#fff" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderColor: '#BFE3E3', borderRadius: 20, padding: 14,
    backgroundColor: '#F2FAFA',
    // Dashed-free but visually set apart from solid lender cards via the tint.
    shadowColor: '#0A3F41', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 1,
  },
  tileEmpty: { backgroundColor: '#EEF8F8', borderColor: '#A9D9D9' },
  iconWrap: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#DDF1F1', alignItems: 'center', justifyContent: 'center' },
  subRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  title: { fontSize: 16, color: colors.text, letterSpacing: -0.2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 9999, paddingVertical: 2, paddingHorizontal: 7, borderWidth: 1, borderColor: '#CDE9E9' },
  badgeText: { fontSize: 9.5, color: colors.greenDeep, letterSpacing: 0.2 },
  sub: { fontSize: 12.5, color: colors.textSoft, marginTop: 4, lineHeight: 17 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 9, paddingLeft: 12, paddingRight: 8 },
  ctaText: { fontSize: 13.5, color: '#fff' },
});
