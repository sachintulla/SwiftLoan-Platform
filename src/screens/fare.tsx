import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { PrimaryButton } from '../components/Controls';
import { colors, font } from '../theme/tokens';
import { useStore } from '../state/store';
import { api, isAuthed, Offer } from '../api/client';
import { loadOffersCache, saveOffersCache } from '../state/session';
import { OfferCard, useOfferSelect } from './offers';

// Statuses whose applications still carry showable offers.
const OFFER_STATUSES = ['offers_ready', 'handoff', 'under_review', 'approved', 'disbursed'];

/** "Updated just now / 5m ago / 2h ago / on 24 Aug" for the saved-offers timestamp. */
function agoLabel(ts: number | null): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * My Offers — the user's saved eligible (Aurix) offers, cached locally so they
 * appear instantly and offline, shown as the same rich tiles as the result
 * screen. A top-right Refresh re-runs prequalify on the backend (which re-calls
 * Aurix). With no offers, the screen becomes an engaging "apply for a loan" CTA.
 */
export default function MyOffers() {
  const { set, go, showToast } = useStore();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [appId, setAppId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Apply from My Offers → back from the offers result returns here (not into
  // the funnel). See back() in store.ts.
  const startApply = () => { set({ offersReturn: 'fare' }); go('basicpan'); };

  // Tapping a tile applies inline via the shared handler; optimistically flag it.
  const select = useOfferSelect(id =>
    setOffers(prev => prev.map(o => (o.id === id ? { ...o, applied: true, lenderStatus: o.lenderStatus || 'handoff' } : o))),
  );

  // Local-first: show cached offers immediately, then reconcile with the backend.
  const hydrate = useCallback(async () => {
    const cache = await loadOffersCache();
    if (cache) {
      setOffers(cache.offers as Offer[]);
      setAppId(cache.applicationId);
      setSavedAt(cache.savedAt);
      if (cache.applicationId) set({ applicationId: cache.applicationId, offersReturn: 'fare' });
    }
    setLoading(false);
    if (!isAuthed()) return;
    try {
      const r: any = await api.listApplications();
      const apps: any[] = r?.applications || [];
      const withOffers =
        apps.find(a => (a.offers?.length ?? 0) > 0 && OFFER_STATUSES.includes(a.status)) ||
        apps.find(a => (a.offers?.length ?? 0) > 0);
      if (withOffers) {
        const list = (withOffers.offers || []) as Offer[];
        const now = Date.now();
        setOffers(list);
        setAppId(withOffers.id);
        setSavedAt(now);
        set({ applicationId: withOffers.id, offersReturn: 'fare' });
        saveOffersCache({ applicationId: withOffers.id, savedAt: now, offers: list });
      }
    } catch {
      /* offline / not signed in — keep whatever the cache gave us */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { hydrate(); }, [hydrate]);

  // Refresh = start a fresh application flow (Verify PAN → details → …), all
  // pre-filled with the user's saved info so they can change anything and get
  // better offers. Completing it re-runs eligibility (→ Aurix); the new offers
  // replace the saved ones on return (hydrate), otherwise the previous persist.
  const refresh = () => startApply();

  const hasOffers = offers.length > 0;

  return (
    <Screen scroll bottomNav padded contentStyle={{ paddingBottom: 40 }}>
      {/* Header with top-right refresh */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[font(800), styles.title]}>My Offers</Text>
          <Text style={[font(400), styles.sub]}>
            {hasOffers ? `${offers.length} saved · updated ${agoLabel(savedAt)}` : 'Your personalised loan offers'}
          </Text>
        </View>
        <Pressable
          onPress={refresh}
          accessibilityLabel="Recheck offers"
          style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.7 }]}
        >
          <Icon name="autorenew" size={19} color={colors.primary} />
          <Text style={[font(700), styles.refreshLabel]}>Recheck offers</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={{ paddingTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : hasOffers ? (
        <View style={{ gap: 14 }}>
          {offers.map(o => (
            <OfferCard key={o.id} offer={o} onSelect={select} />
          ))}
        </View>
      ) : (
        <EmptyOffers onApply={startApply} />
      )}
    </Screen>
  );
}

/** Engaging no-offers state — the screen becomes an apply prompt. */
function EmptyOffers({ onApply }: { onApply: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name="local_offer" size={40} color={colors.primary} />
      </View>
      <Text style={[font(800), { fontSize: 20, color: colors.text, marginTop: 18, textAlign: 'center' }]}>No offers yet</Text>
      <Text style={[font(400), { fontSize: 14, color: colors.textSoft, marginTop: 8, textAlign: 'center', lineHeight: 20 }]}>
        Apply once and we’ll match you with personalised offers from our lending partners — they’ll be saved right here.
      </Text>

      <View style={styles.benefits}>
        <Benefit icon="bolt" text="Real offers in ~2 minutes" />
        <Benefit icon="shield" text="Soft check — no impact on your credit score" />
        <Benefit icon="storefront" text="Compare multiple partners in one place" />
      </View>

      <View style={{ width: '100%', marginTop: 22 }}>
        <PrimaryButton label="Apply for a loan" icon="arrow_forward" onPress={onApply} />
      </View>
    </View>
  );
}

function Benefit({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.benefitRow}>
      <View style={styles.benefitIcon}><Icon name={icon} size={16} color={colors.primary} /></View>
      <Text style={[font(500), { flex: 1, fontSize: 13, color: colors.textMid }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 8, marginBottom: 18 },
  title: { fontSize: 26, letterSpacing: -0.5, color: colors.text },
  sub: { fontSize: 13.5, color: colors.textSoft, marginTop: 4 },
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.chip, borderRadius: 20, borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: 12, height: 38, marginTop: 2, minWidth: 104, justifyContent: 'center',
  },
  refreshLabel: { fontSize: 13, color: colors.primary },
  empty: { alignItems: 'center', paddingTop: 36, paddingHorizontal: 6 },
  emptyIcon: { width: 92, height: 92, borderRadius: 46, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
  benefits: { width: '100%', marginTop: 24, gap: 12 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
});
