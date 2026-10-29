import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { LogoMark } from '../components/Logo';
import { VoiceHidden } from '../voice/screenGraph';
// import { MarketLoanOffers } from '../components/MarketLoanOffers'; // "Available offers" catalog hidden for now
import { PrequalifiedOffers } from '../components/PrequalifiedOffers';
import { colors, font, rupee } from '../theme/tokens';
import { useStore, useT } from '../state/store';
import { api, isAuthed, Offer, PrequalifyingOffer } from '../api/client';
import { displayLenderName } from './offers';
import { useUnreadCount } from './notifications';

// Applications whose offers are still worth surfacing on the dashboard.
const OFFER_STATUSES = ['offers_ready', 'handoff', 'under_review', 'approved', 'disbursed'];

// Fallback highlights when a lender didn't return its own feature list.
const DEFAULT_FEATURES = ['Low interest rates', 'Flexible tenure', 'Minimal documents', 'Quick approval'];
const FEATURE_ICONS: Record<string, string> = {
  'Low interest rates': 'trending_down',
  'Flexible tenure': 'event',
  'Minimal documents': 'description',
  'Quick approval': 'bolt',
};

/** Lowest monthly EMI advertised across an offer's tenure options (or null). */
function minEmiOf(offer: Offer): number | null {
  const emis = (offer.emiOptions ?? []).map(o => o.monthlyEmi).filter(n => n > 0);
  return emis.length ? Math.min(...emis) : null;
}

export default function Home() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { state, set, go, showToast } = useStore();
  const unread = useUnreadCount();
  const [offers, setOffers] = useState<Offer[]>([]);
  // The amount this user actually enquired about — pulled from their live
  // application on the backend, so the hero headline is dynamic per user.
  const [enquiredAmount, setEnquiredAmount] = useState<number | null>(null);

  // Pull the user's live application (with its personalised offers) so the hero
  // headline, offer count, best rate and lowest EMI are all real per-user data.
  useEffect(() => {
    if (!isAuthed()) return;
    api.listApplications()
      .then((r: any) => {
        const apps: any[] = r?.applications || [];
        // Deliberately NOT pushed into apiContext (mergeApiContext) — this
        // fetch exists purely to render Home's own hero headline/offers
        // card/CTA state below, not to feed the voice agent.
        const withOffers =
          apps.find(a => (a.offers?.length ?? 0) > 0 && OFFER_STATUSES.includes(a.status)) ||
          apps.find(a => (a.offers?.length ?? 0) > 0) ||
          apps[0];
        if (withOffers) {
          setOffers((withOffers.offers || []) as Offer[]);
          setEnquiredAmount(withOffers.amount ?? null);
          set({
            applicationId: withOffers.id,
            loanId: withOffers.loan?.id ?? null,
            hasSavedOffers: (withOffers.offers?.length ?? 0) > 0,
          });
        } else {
          set({ hasSavedOffers: false });
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstName = (state.authUser?.firstName || state.authUser?.fullName || state.pdName || '').trim().split(/\s+/)[0];
  // Headline amount: the enquired amount from the backend, falling back to the
  // amount held in the funnel state, then a sensible default.
  const amount = enquiredAmount ?? state.appAmount ?? 300000;

  const hasOffers = offers.length > 0;
  const count = offers.length;
  const minRate = hasOffers ? Math.min(...offers.map(o => o.apr).filter(n => n > 0)) : null;
  const emiValues = offers.map(minEmiOf).filter((n): n is number => n != null);
  const minEmi = emiValues.length ? Math.min(...emiValues) : null;

  // "Ask Ruby" reveals + animates the support FAB and starts a session, so a
  // first-time user learns the assistant is always one tap away (see VoiceWidget).
  const askRuby = () => set({ voiceFabUnlocked: true, voiceTrigger: state.voiceTrigger + 1 });
  const viewOffers = () => { set({ offersReturn: 'home' }); go('fare'); };
  const changeAmount = () => { set({ offersReturn: 'home' }); go('basicpan'); };
  const startFresh = () => { set({ offersReturn: 'home', applicationId: null, offersError: '' }); go('basicpan'); };
  // A sponsored "featured offer" ad — tapping "Check eligibility" seeds the
  // advertised amount and drops the user into the normal application funnel.
  // (These ads are marketing, not firm offers, so there is no "accept".)
  const checkEligibility = (o: PrequalifyingOffer) => {
    set({ appAmount: Math.round(o.amount / 100), offersReturn: 'home', applicationId: null, offersError: '' });
    go('basicpan');
  };

  return (
    <Screen scroll bottomNav padded statusBar="light-content">
      {/* Dark welcome header band — bleeds full-width and up under the status bar
          so the dashboard shares the login screens' deep-teal theme. The content
          below it stays on the light app background, unchanged. */}
      <View style={[styles.headerBand, { marginTop: -(insets.top + 8), paddingTop: insets.top + 12 }]}>
        <LinearGradient
          colors={['#0A2C2E', '#0E3B3A', '#114440']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Ruby illustration — anchored to the band's bottom-right so she stands
            on the dark header (clipped cleanly at the band edge). Rendered before
            the content so the "Ask Ruby" bubble and headline paint in front. */}
        <Pressable onPress={askRuby} style={styles.rubyWrap} accessibilityLabel="Ask Ruby for help">
          <Image source={require('../../assets/brand/ruby-hero.png')} style={styles.ruby} resizeMode="contain" />
        </Pressable>
        {/* Top bar: brand lockup + subtitle | RBI badge + notifications bell */}
        <View style={styles.topBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <LogoMark size={34} style={{ borderRadius: 11 }} />
            <View style={{ flex: 1 }}>
              <Text style={[font(800), { fontSize: 20, letterSpacing: -0.5 }]}>
                <Text style={{ color: '#fff' }}>Swift</Text>
                <Text style={{ color: colors.mint }}>Loan</Text>
              </Text>
              <Text style={[font(500), styles.brandSub]} numberOfLines={1}>Digital Lending Marketplace</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* RBI compliance badge (matches the login header) */}
            <View style={styles.rbiPill}>
              <Icon name="verified_user" size={13} color={colors.mint} />
              <Text style={[font(600), { color: '#fff', fontSize: 12 }]}>RBI Regulated</Text>
            </View>
            <Pressable
              onPress={() => go('notifications')}
              style={styles.bellBtn}
              accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            >
              <Icon name="notifications" size={22} color="#fff" />
              {unread > 0 ? (
                <View style={styles.bellBadge}>
                  <Text style={[font(700), { color: '#fff', fontSize: 10 }]}>{unread > 9 ? '9+' : String(unread)}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <View style={styles.hero}>
        {/* Ruby speech bubble (the illustration is anchored to the band, behind). */}
        <Pressable onPress={askRuby} style={styles.bubble} accessibilityLabel="Ask Ruby, your AI loan assistant — tap to talk">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[font(800), { flex: 1, fontSize: 15, letterSpacing: -0.3, color: colors.text }]}>{t.askRuby}</Text>
            <Icon name="chevron_right" size={17} color={colors.primary} />
          </View>
          {/* Cone tail on the right edge, pointing toward Ruby. */}
          <View style={styles.bubbleTail} />
        </Pressable>

        <VoiceHidden>
          <Text style={[font(700), styles.welcomeText]}>
            {firstName ? `${t.welcomeBack}, ${firstName} 👋` : `${t.welcomeGeneric} 👋`}
          </Text>

          <Text style={[font(800), styles.heroTitle]}>
            {t.heroYourPrefix} {rupee(amount)}{'\n'}{hasOffers ? t.personalLoanJourney : t.loanJourneyStart}
          </Text>

          <Text style={[font(400), styles.heroSub]}>
            {hasOffers
              ? `${count} ${count === 1 ? t.offerWord : t.offersWord} ${t.matchedToProfile}` +
                (minRate != null ? `  ·  ${t.ratesFrom} ${minRate}% p.a.` : '') +
                (minEmi != null ? `  ·  ${t.emiFrom} ${rupee(minEmi)}${t.perMonth}` : '')
              : t.applyOncePersonalised}
          </Text>
        </VoiceHidden>

        <View style={styles.heroBtns}>
          {hasOffers ? (
            <>
              <Pressable onPress={viewOffers} style={styles.primaryBtn}>
                <Text style={[font(700), { fontSize: 11.5, color: '#fff' }]} numberOfLines={1}>{t.viewBestOffers}</Text>
                <Icon name="chevron_right" size={14} color="#fff" />
              </Pressable>
              <Pressable onPress={changeAmount} style={styles.ghostBtn}>
                <Icon name="edit" size={11} color="#fff" />
                <Text style={[font(700), { fontSize: 10.5, color: '#fff' }]} numberOfLines={1}>{t.changeAmount}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={startFresh} style={[styles.primaryBtn, { flex: 1 }]}>
              <Text style={[font(700), { fontSize: 14.5, color: '#fff' }]} numberOfLines={1}>{t.applyForLoan}</Text>
              <Icon name="arrow_forward" size={17} color="#fff" />
            </Pressable>
          )}
        </View>

        </View>
      </View>

      {/* ── Featured offers — sponsored lender ads, shown on login ──────── */}
      <PrequalifiedOffers onCheckEligibility={checkEligibility} />

      {/* "Available offers" (the admin-curated market catalog from GET /market-loan-offers) is switched
          off on Home for now: the screen does not show it and the API is not called. To bring it back,
          restore the block below and the MarketLoanOffers import above.
      <Text style={[font(800), styles.sectionTitle]}>{t.availableOffers}</Text>
      <Text style={[font(400), styles.sectionSub]}>{t.availableOffersSub}</Text>
      <View style={{ marginTop: 6 }}>
        <MarketLoanOffers
          mode="home"
          showIntro={false}
          onApply={plan => {
            if (plan.maxAmount) set({ appAmount: Math.round(plan.maxAmount / 100) });
            set({ offersReturn: 'home', applicationId: null, offersError: '' });
            go('basicpan');
          }}
        />
      </View>
      */}

      <VoiceHidden>
        <Text style={[font(400), { fontSize: 10.5, lineHeight: 16, color: colors.muted, marginTop: 24 }]}>{t.disclaimer}</Text>
      </VoiceHidden>
    </Screen>
  );
}

/** Lender logo tile — the lender's own logo, or a bank glyph fallback. */
function LenderLogo({ offer, size = 52 }: { offer: Offer; size?: number }) {
  const uri = offer.lenderLogoUrl || offer.partner?.logoUrl;
  return (
    <View style={[styles.logoBox, { width: size, height: size, borderRadius: size * 0.28 }]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size - 12, height: size - 12 }} resizeMode="contain" />
      ) : (
        <Icon name={offer.partner?.icon || 'account_balance'} size={size * 0.42} color={colors.primary} />
      )}
    </View>
  );
}

/** Rate range label — real ROI range when present, else the flat APR. */
function rateLabel(offer: Offer): string {
  return `${offer.apr}% p.a.`;
}

/** The prominent "Recommended for you" best-match card. */
function RecommendedCard({ offer, onPress }: { offer: Offer; onPress: () => void }) {
  const name = displayLenderName(offer.lenderName || offer.partner?.name);
  const emi = minEmiOf(offer);
  const features = (offer.partner?.features?.length ? offer.partner.features : DEFAULT_FEATURES).slice(0, 4);
  return (
    <View style={styles.recCard}>
      <View style={styles.recTop}>
        <LenderLogo offer={offer} />
        <View style={{ flex: 1 }}>
          <Text style={[font(800), { fontSize: 16.5, color: colors.text }]} numberOfLines={1}>{name}</Text>
        </View>
        <View style={styles.bestPill}>
          <Text style={[font(700), { fontSize: 11, color: colors.greenDeep }]}>Best Match</Text>
        </View>
      </View>

      <View style={styles.recMetrics}>
        <Metric label="Loan amount" value={`Up to ${rupee(offer.amount)}`} />
        <View style={styles.metricDiv} />
        <Metric label="Interest rate" value={rateLabel(offer)} />
        <View style={styles.metricDiv} />
        <Metric label="Est. EMI from" value={emi != null ? `${rupee(emi)}/mo` : '—'} last />
      </View>

      <View style={styles.recBottom}>
        <View style={styles.featureWrap}>
          {features.map(f => (
            <View key={f} style={styles.featureChip}>
              <Icon name={FEATURE_ICONS[f] || 'check'} size={13} color={colors.primary} />
              <Text style={[font(600), { fontSize: 10.5, color: colors.textMid }]} numberOfLines={2}>{f}</Text>
            </View>
          ))}
        </View>
        <Pressable onPress={onPress} style={styles.viewOfferBtn}>
          <Text style={[font(700), { fontSize: 13.5, color: '#fff' }]}>View Offer</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Compact tile for the "Other matched offers" row. */
function OtherOfferTile({ offer, onPress }: { offer: Offer; onPress: () => void }) {
  const name = displayLenderName(offer.lenderName || offer.partner?.name);
  return (
    <Pressable onPress={onPress} style={styles.otherTile}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <LenderLogo offer={offer} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={[font(800), { fontSize: 14, color: colors.text }]} numberOfLines={1}>{name}</Text>
          <Text style={[font(500), { fontSize: 11.5, color: colors.textSoft, marginTop: 1 }]} numberOfLines={1}>{rateLabel(offer)}</Text>
        </View>
        <Icon name="chevron_right" size={18} color={colors.muted} />
      </View>
      <Text style={[font(700), { fontSize: 12, color: colors.greenDeep, marginTop: 8 }]}>Up to {rupee(offer.amount)}</Text>
    </Pressable>
  );
}

function Metric({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: last ? 'flex-end' : 'flex-start' }}>
      <Text style={[font(500), { fontSize: 11, color: colors.textSoft }]} numberOfLines={1}>{label}</Text>
      <Text style={[font(800), { fontSize: 13.5, color: colors.primary, marginTop: 3 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Full-bleed dark header band (shares the login screens' deep-teal theme).
  headerBand: {
    position: 'relative',
    marginHorizontal: -18,
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    overflow: 'hidden',
  },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  brandSub: { fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.3, marginTop: 1 },
  rbiPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(47,177,131,0.12)', borderWidth: 1, borderColor: 'rgba(47,177,131,0.4)',
    borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11,
  },
  bellBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  bellBadge: {
    position: 'absolute', top: 5, right: 4, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.red,
  },

  hero: { marginTop: 6, position: 'relative' },
  // Anchored to the band's bottom-right; aspect matches the source (≈0.79) so
  // 'contain' fills the box and she reaches the band's bottom edge.
  rubyWrap: { position: 'absolute', bottom: -10, right: 5, width: 166, height: 210, zIndex: 0 },
  ruby: { width: 166, height: 210 },
  bubble: {
    position: 'absolute', top: 44, right: 84, width: 132, zIndex: 3,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    borderRadius: 14, paddingVertical: 8, paddingHorizontal: 13,
    shadowColor: '#0A3F41', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 5,
  },
  // Tail on the right edge, pointing toward Ruby.
  // Right-pointing triangle "cone" tail, flush with the bubble's right edge and
  // vertically centred, so it reads as a speech bubble pointing at Ruby.
  bubbleTail: {
    position: 'absolute', right: -6, top: 17,
    width: 0, height: 0, backgroundColor: 'transparent',
    borderTopWidth: 7, borderBottomWidth: 7, borderLeftWidth: 11,
    borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: colors.surface,
    transform: [{ rotate: '25deg' }],
  },
  welcomeText: { fontSize: 14.5, color: colors.mint, letterSpacing: -0.2, marginTop: 2 },
  heroTitle: { fontSize: 13.5, lineHeight: 19, letterSpacing: -0.2, color: '#fff', marginTop: 6, marginRight: 232 },
  heroSub: { fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.72)', marginTop: 6, marginRight: 205 },
  heroBtns: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginRight: 107 },
  primaryBtn: {
    flex: 1.3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2,
    backgroundColor: colors.mint, borderRadius: 10, paddingHorizontal: 8, height: 30,
    shadowColor: colors.mint, shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 3,
  },
  ghostBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 10,
    paddingHorizontal: 8, height: 30, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)',
  },
  sectionTitle: { fontSize: 18, letterSpacing: -0.3, color: colors.text, marginTop: 22 },
  sectionSub: { fontSize: 12.5, color: colors.textSoft, marginTop: 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },

  logoBox: { backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },

  recCard: {
    marginTop: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    borderRadius: 22, padding: 18,
    shadowColor: '#0A3F41', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 2,
  },
  recTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bestPill: { backgroundColor: colors.chip, borderRadius: 9999, paddingVertical: 5, paddingHorizontal: 12 },
  recMetrics: { flexDirection: 'row', alignItems: 'center', marginTop: 18, gap: 10 },
  metricDiv: { width: 1, height: 34, backgroundColor: colors.line },
  recBottom: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  featureWrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  featureChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '48%',
    backgroundColor: colors.chip, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8,
  },
  viewOfferBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 18, height: 46, alignItems: 'center', justifyContent: 'center' },

  otherRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  otherTile: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 14 },

  seeAll: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 16,
  },
  seeAllIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
});
