import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { PrimaryButton } from '../components/Controls';
import { colors, font, rupee } from '../theme/tokens';
import { useStore } from '../state/store';
import { api, isAuthed, Offer } from '../api/client';
import { loadOffersCache, saveOffersCache } from '../state/session';

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
 * appear instantly and offline. A top-right Refresh re-runs prequalify on the
 * backend (which re-calls Aurix) to pull any new offers. With no offers, the
 * screen turns into an engaging "apply for a loan" call-to-action.
 */
export default function MyOffers() {
  const { set, go, showToast } = useStore();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [appId, setAppId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Local-first: show the cached offers immediately, then reconcile with the
  // backend in the background.
  const hydrate = useCallback(async () => {
    const cache = await loadOffersCache();
    if (cache) {
      setOffers(cache.offers as Offer[]);
      setAppId(cache.applicationId);
      setSavedAt(cache.savedAt);
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
        saveOffersCache({ applicationId: withOffers.id, savedAt: now, offers: list });
      }
    } catch {
      /* offline / not signed in — keep whatever the cache gave us */
    }
  }, []);

  useEffect(() => { hydrate(); }, [hydrate]);

  // Refresh: ask the backend to re-run eligibility (→ Aurix) for the saved
  // application, then persist the fresh offers locally. With no application yet,
  // send the user into the apply funnel instead.
  const refresh = async () => {
    if (refreshing) return;
    if (!isAuthed() || !appId) { go('basicpan'); return; }
    setRefreshing(true);
    try {
      await api.prequalify(appId);
      const r: any = await api.getApplication(appId);
      const list = (r.application?.offers || []) as Offer[];
      const now = Date.now();
      setOffers(list);
      setSavedAt(now);
      saveOffersCache({ applicationId: appId, savedAt: now, offers: list });
      showToast(list.length ? `Updated — ${list.length} offer${list.length > 1 ? 's' : ''} found` : 'No new offers right now');
    } catch {
      showToast('Couldn’t refresh offers. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  // Open the full offers screen (details + apply) for the saved application.
  const openOffer = () => {
    if (appId) set({ applicationId: appId });
    go('offers');
  };

  const hasOffers = offers.length > 0;

  return (
    <Screen scroll bottomNav padded>
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
          disabled={refreshing}
          accessibilityLabel="Refresh offers"
          style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.7 }]}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Icon name="refresh" size={20} color={colors.primary} />
          )}
          <Text style={[font(700), styles.refreshLabel]}>{refreshing ? 'Refreshing' : 'Refresh'}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={{ paddingTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : hasOffers ? (
        <View style={{ gap: 12 }}>
          {offers.map(o => (
            <SavedOfferCard key={o.id} offer={o} onPress={openOffer} />
          ))}
          <Pressable style={styles.applyGhost} onPress={() => go('basicpan')}>
            <Icon name="add" size={18} color={colors.primary} />
            <Text style={[font(700), { color: colors.primary, fontSize: 14 }]}>Apply for a new loan</Text>
          </Pressable>
        </View>
      ) : (
        <EmptyOffers onApply={() => go('basicpan')} />
      )}
    </Screen>
  );
}

/** Compact saved-offer row → taps into the full offers screen to review/apply. */
function SavedOfferCard({ offer, onPress }: { offer: Offer; onPress: () => void }) {
  const logo = offer.lenderLogoUrl || offer.partner?.logoUrl;
  const emi = offer.emiOptions?.find(o => o.recommended)?.monthlyEmi ?? offer.emiOptions?.[0]?.monthlyEmi;
  const highMatch = offer.offerLikelihood && offer.offerLikelihood !== '0';
  return (
    <Pressable style={({ pressed }) => [styles.card, offer.recommended && styles.cardRec, pressed && { opacity: 0.85 }]} onPress={onPress}>
      <View style={[styles.logoBox, logo && styles.logoBoxImg]}>
        {logo ? (
          <Image source={{ uri: logo }} style={{ width: 40, height: 40 }} resizeMode="contain" />
        ) : (
          <Icon name={offer.partner?.icon || 'account_balance'} size={22} color={colors.primary} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[font(800), { fontSize: 15.5, color: colors.text }]} numberOfLines={1}>{offer.lenderName || offer.partner?.name || 'Lender'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
          <Text style={[font(700), { fontSize: 13, color: colors.primary }]}>Up to {rupee(offer.amount)}</Text>
          {offer.apr ? <Text style={[font(500), { fontSize: 12, color: colors.textSoft }]}>· {offer.apr}% p.a.</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          {emi ? <Text style={[font(500), { fontSize: 11.5, color: colors.textSoft }]}>EMI {rupee(emi)}/mo</Text> : null}
          {highMatch ? (
            <View style={styles.matchPill}>
              <Icon name="bolt" size={11} color={colors.greenDeep} />
              <Text style={[font(700), { fontSize: 10, color: colors.greenDeep }]}>High match</Text>
            </View>
          ) : null}
          {offer.applied ? (
            <View style={styles.appliedPill}>
              <Icon name="check_circle" size={11} color={colors.primary} />
              <Text style={[font(700), { fontSize: 10, color: colors.primary }]}>Applied</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Icon name="chevron_right" size={22} color={colors.muted} />
    </Pressable>
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
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14,
  },
  cardRec: { borderColor: colors.primary, borderWidth: 1.5 },
  logoBox: { width: 48, height: 48, borderRadius: 13, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoBoxImg: { backgroundColor: '#FFFFFF' },
  matchPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.chip, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  appliedPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(7,159,160,0.12)', borderWidth: 1, borderColor: 'rgba(7,159,160,0.35)', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  applyGhost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 13, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 36, paddingHorizontal: 6 },
  emptyIcon: { width: 92, height: 92, borderRadius: 46, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
  benefits: { width: '100%', marginTop: 24, gap: 12 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
});
