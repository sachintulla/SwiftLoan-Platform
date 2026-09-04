import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { PrimaryButton } from '../components/Controls';
import { colors, font, rupee } from '../theme/tokens';
import { useStore } from '../state/store';
import { api, isAuthed, Offer } from '../api/client';
import { loadOffersCache, saveOffersCache, clearOffersCache } from '../state/session';
import { useOfferSelect, displayLenderName } from './offers';
import { useVoiceTarget } from '../voice/useVoiceTarget';

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
  const { set, mergeApiContext, go, showToast } = useStore();
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
      mergeApiContext({ applications: apps });
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
      } else {
        // The backend authoritatively has NO eligible offers for this account
        // (fresh login, deleted data, or a superseded run). The fetch succeeded,
        // so the cache is stale — clear it and the display instead of leaving
        // the previous offers on screen. (On a fetch FAILURE we fall to the
        // catch below and keep the cache, for offline resilience.)
        setOffers([]);
        setAppId(null);
        setSavedAt(null);
        set({ applicationId: null });
        await clearOffersCache().catch(() => {});
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
        {/* "Recheck" only makes sense once there's an existing offer set to
            recheck — with none yet, this was an always-visible second button
            doing the exact same thing as EmptyOffers' "Apply for a loan"
            below (both just call startApply()), which left two competing,
            differently-labelled CTAs for one action — a person who's never
            applied doesn't have anything to "recheck". */}
        {hasOffers && (
          <Pressable
            onPress={refresh}
            accessibilityLabel="Recheck offers"
            style={({ pressed }) => [styles.refreshBtn, pressed && { opacity: 0.7 }]}
          >
            <Icon name="autorenew" size={19} color={colors.primary} />
            <Text style={[font(700), styles.refreshLabel]}>Recheck offers</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={{ paddingTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : hasOffers ? (
        <>
          <View style={{ gap: 14 }}>
            {offers.map(o => (
              <MyOfferCard key={o.id} offer={o} onSelect={select} />
            ))}
          </View>
          <View style={styles.moreRow}>
            <Icon name="auto_awesome" size={15} color={colors.primary} />
            <Text style={[font(500), { fontSize: 12.5, color: colors.textMid }]}>More offers available. Keep checking for better matches.</Text>
          </View>
        </>
      ) : (
        <EmptyOffers onApply={startApply} />
      )}
    </Screen>
  );
}

/** My Offers card — the eligible/partner-lender offer tile (per design). */
function MyOfferCard({ offer, onSelect }: { offer: Offer; onSelect: (offer: Offer) => void }) {
  const name = displayLenderName(offer.lenderName || offer.partner?.name);
  const logoUri = offer.lenderLogoUrl || offer.partner?.logoUrl;
  const highMatch = !!offer.offerLikelihood && offer.offerLikelihood !== '0';
  const disbursal = offer.partner?.disbursalTimeHrs ? `${offer.partner.disbursalTimeHrs} hr` : 'Instant';
  const applied = offer.applied;

  // Same reasoning as offers.tsx's OfferCard (see its own comment): a bare
  // lender name auto-discovered from the card never matches a generic "apply"
  // query, only a query that happens to name the lender exactly — and this
  // card had NO voice registration at all before, generic or otherwise
  // (confirmed live: select_option on a lender name here returned not_found
  // even though the card was on screen), so "Apply to <lender>" is a genuinely
  // new fix here, not just a label rename.
  useVoiceTarget(
    `Apply to ${name}`,
    { kind: 'button', onTap: () => onSelect(offer) },
    [offer],
  );

  return (
    <View style={styles.card}>
      {/* Partner-lender pill floats over the divider on the right. */}
      <View style={[styles.partnerPill, applied && { backgroundColor: colors.greenDeep }]}>
        <Text style={[font(700), { fontSize: 11.5, color: '#fff' }]}>{applied ? 'Applied' : 'Partner lender'}</Text>
      </View>

      {/* Header (inside the box): logo · name / high-match */}
      <View style={styles.headRow}>
        <View style={[styles.logoBox, logoUri ? styles.logoBoxImg : null]}>
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={{ width: 42, height: 42 }} resizeMode="contain" />
          ) : (
            <Icon name={offer.partner?.icon || 'account_balance'} size={26} color={colors.primary} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[font(800), styles.lender]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{name}</Text>
          {highMatch ? (
            <View style={styles.matchChip}>
              <Icon name="bolt" size={12} color={colors.greenDeep} />
              <Text style={[font(700), { fontSize: 11, color: colors.greenDeep }]}>High match</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.divider} />

      {/* amount + interest rate on one row · disbursal chip · receipt · apply */}
      <View>
        <View style={styles.amountRow}>
          <View style={{ flex: 1 }}>
            <Text style={[font(500), { fontSize: 12.5, color: colors.textSoft }]}>Eligible amount</Text>
            <Text style={[font(800), styles.amount]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{rupee(offer.amount)}</Text>
          </View>
          <View style={styles.rateCol}>
            <View style={styles.rateIcon}><Icon name="percent" size={13} color={colors.primary} /></View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[font(500), { fontSize: 11, color: colors.textSoft }]}>Interest rate</Text>
              <Text style={[font(800), { fontSize: 15, color: colors.text, marginTop: 1 }]}>{offer.apr}% p.a.</Text>
            </View>
          </View>
        </View>

        <View style={styles.disbursalChip}>
          <Icon name="schedule" size={13} color={colors.greenDeep} />
          <Text style={[font(700), { fontSize: 11.5, color: colors.greenDeep }]}>{disbursal} disbursal</Text>
        </View>

        <View style={styles.receipt}>
          <View style={{ flex: 1 }}>
            <Text style={[font(500), { fontSize: 11.5, color: colors.muted }]}>Processing fee</Text>
            <Text style={[font(700), { fontSize: 12.5, color: colors.text, marginTop: 1 }]} numberOfLines={1}>
              {rupee(offer.processingFeeAmount)} <Text style={{ color: colors.textSoft, fontSize: 11 }}>+ {rupee(offer.gstOnProcessingFee)} GST</Text>
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[font(500), { fontSize: 11.5, color: colors.muted }]}>You receive</Text>
            <Text style={[font(800), { fontSize: 14, color: colors.greenDeep, marginTop: 1 }]}>{rupee(offer.netDisbursalAmount)}</Text>
          </View>
        </View>

        <Pressable onPress={() => onSelect(offer)} style={styles.applyBtn}>
          <Text style={[font(700), { fontSize: 15, color: '#fff' }]}>{applied ? 'Apply Again' : (offer.redirectionUrl ? 'Apply Loan' : 'Select Offer')}</Text>
          <Icon name="arrow_forward" size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
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

  // ── Offer card ─────────────────────────────────────────────────────────
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 22, padding: 16,
    shadowColor: '#0A3F41', shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 2,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoBoxImg: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line },
  lender: { fontSize: 16, color: colors.text, letterSpacing: -0.2 },
  divider: { height: 1, backgroundColor: colors.line, marginTop: 12, marginBottom: 14 },
  matchChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 5,
    backgroundColor: colors.chip, borderRadius: 9999, paddingVertical: 3, paddingHorizontal: 8,
  },
  partnerPill: {
    // Floats over the divider between the header and the amount, on the right.
    position: 'absolute', top: 56, right: 16, zIndex: 2,
    backgroundColor: colors.primary, borderRadius: 9999, paddingVertical: 6, paddingHorizontal: 12,
    shadowColor: '#0A3F41', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  amount: { fontSize: 24, color: colors.primary, letterSpacing: -0.6, marginTop: 2 },
  amountRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  rateCol: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rateIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  disbursalChip: {
    flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 5, marginTop: 12,
    backgroundColor: colors.chip, borderRadius: 9999, paddingVertical: 4, paddingHorizontal: 10,
  },
  receipt: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  applyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 14, height: 48, marginTop: 14 },
  moreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 18, paddingHorizontal: 20 },

  empty: { alignItems: 'center', paddingTop: 36, paddingHorizontal: 6 },
  emptyIcon: { width: 92, height: 92, borderRadius: 46, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
  benefits: { width: '100%', marginTop: 24, gap: 12 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#E1F3F3', alignItems: 'center', justifyContent: 'center' },
});
