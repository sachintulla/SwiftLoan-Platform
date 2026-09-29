import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal, ActivityIndicator, Animated, Easing } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { LogoMark } from '../components/Logo';
import { PrimaryButton } from '../components/Controls';
import { colors, font, rupee, heroGradient } from '../theme/tokens';
import { useStore } from '../state/store';
import { api, Offer } from '../api/client';
import { loadOffersCache } from '../state/session';
import { useOfferSelect, displayLenderName } from './offers';
import { compareOffers, defaultTenure, formatApproval, TENURES, type CompareRow, type RankBy } from '../utils/compareOffers';

// Same visual language as the compare-offers design reference.
const C = {
  best: '#12805A',
  bestBg: '#E4F6EE',
  amber: '#B4740A',
  amberBg: '#FCEFD9',
  selBg: '#E1F3F3',
  segBg: '#EEF3F3',
};

// "Rank best offer by" — the four options of the reference, with the phrase
// the Best-overall banner uses.
const RANKS: { key: RankBy; label: string; phrase: string }[] = [
  { key: 'cost', label: 'Lowest total cost', phrase: 'lowest total cost' },
  { key: 'emi', label: 'Lowest monthly EMI', phrase: 'lowest monthly EMI' },
  { key: 'fee', label: 'Lowest processing fee', phrase: 'lowest processing fee' },
  { key: 'approval', label: '⚡ Quick approval', phrase: 'quickest approval' },
];

// Comparison-matrix geometry: a pinned label column + one column per lender,
// every row a fixed height so the pinned labels line up with the scrolled cells.
const LABEL_W = 112;
const COL_W = 124;
const H_HEAD = 86;
const H_EMI = 88;
const H_ROW = 58;

type Winners = { emi: string | null; rate: string | null; interest: string | null; cost: string | null; fee: string | null; approval: string | null };
type MetricRow = {
  key: string;
  label: string;
  height: number;
  big?: boolean;
  win?: keyof Winners;
  tag?: string;
  priced: boolean; // false = shown even for rate-on-approval offers
  value: (r: CompareRow) => string;
};
const METRICS: MetricRow[] = [
  { key: 'emi', label: 'Monthly EMI', height: H_EMI, big: true, win: 'emi', tag: 'Lowest EMI', priced: true, value: r => rupee(r.emi!) },
  { key: 'rate', label: 'Interest rate', height: H_ROW, win: 'rate', tag: 'Lowest rate', priced: true, value: r => `${r.rate}%` },
  { key: 'fee', label: 'Processing fee', height: H_ROW, win: 'fee', tag: 'Lowest', priced: false, value: r => rupee(r.fees) },
  { key: 'amount', label: 'Eligible amount', height: H_ROW, priced: false, value: r => rupee(r.amount) },
  { key: 'tenure', label: 'Tenure', height: H_ROW, priced: false, value: r => `${r.tenure} mo` },
  { key: 'interest', label: 'Total interest', height: H_ROW, win: 'interest', tag: 'Least interest', priced: true, value: r => rupee(r.totalInterest!) },
  { key: 'repay', label: 'Total you repay', height: H_ROW, win: 'cost', tag: 'Cheapest overall', priced: true, value: r => rupee(r.totalRepay!) },
];

/**
 * Compare offers — laid out after the compare-offers design reference:
 * gradient header (loan amount | offers matched), Tenure + "Rank best offer
 * by" dropdowns, a comparison matrix (pinned labels with the SwiftLoan mark,
 * a column per lender, best value per row in green, approval time under each
 * EMI), then the legend, a "Best overall" banner and Apply.
 *
 * Changing tenure or ranking drops any manual pick, scrolls the recommended
 * lender's column into view and pulses it. Tap a lender to choose it instead.
 *
 * EMI, interest and totals are computed on-device (utils/compareOffers.ts,
 * same logic as the website). Approval time comes from the partner catalog's
 * disbursalTimeHrs when present — "—" otherwise.
 */
export default function Compare() {
  const { state, back } = useStore();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [tenure, setTenure] = useState(24);
  const [rankBy, setRankBy] = useState<RankBy>('cost');
  const [picked, setPicked] = useState<string | null>(null);
  const [picker, setPicker] = useState<'tenure' | 'rank' | null>(null);
  const [applying, setApplying] = useState(false);
  const select = useOfferSelect();

  // Horizontal-scroll affordance + "focus the recommendation" on changes.
  const matrixRef = useRef<ScrollView>(null);
  const [viewW, setViewW] = useState(0);
  const [swiped, setSwiped] = useState(false);
  const [scrolledX, setScrolledX] = useState(0);
  const focusNext = useRef(false);
  const flash = useRef(new Animated.Value(0)).current;
  const onMatrixScroll = (x: number) => {
    if (x > 12 && !swiped) setSwiped(true);
    if ((x > 4) !== (scrolledX > 4)) setScrolledX(x);
  };

  useEffect(() => {
    let cancelled = false;
    const adopt = (list: Offer[]) => {
      if (cancelled) return;
      const open = list.filter(o => !o.applied);
      setOffers(open);
      const first = open.find(o => o.apr > 0);
      setTenure(defaultTenure(first?.emiOptions?.find(e => e.recommended)?.tenureMonths ?? first?.emiOptions?.[0]?.tenureMonths));
    };
    (async () => {
      // Cache first (instant, offline), then the live application if we have one.
      const cache = await loadOffersCache().catch(() => null);
      if (cache?.offers?.length) adopt(cache.offers as Offer[]);
      if (state.applicationId) {
        const r: any = await api.getApplication(state.applicationId).catch(() => null);
        const live = r?.application?.offers as Offer[] | undefined;
        if (live?.length) adopt(live);
        else if (!cache?.offers?.length) adopt([]);
      } else if (!cache?.offers?.length) adopt([]);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inputs = useMemo(
    () => (offers ?? []).map(o => ({
      id: o.id,
      lenderName: displayLenderName(o.lenderName || o.partner?.name),
      amount: o.amount,
      apr: o.apr,
      processingFeeAmount: o.processingFeeAmount,
      gstOnProcessingFee: o.gstOnProcessingFee,
      logoUrl: o.lenderLogoUrl || o.partner?.logoUrl || null,
      approvalHrs: o.partner?.disbursalTimeHrs ?? null,
    })),
    [offers],
  );
  const result = useMemo(() => compareOffers(inputs, { tenure, rankBy }), [inputs, tenure, rankBy]);

  const best = result.best;
  const selected = result.rows.find(r => r.id === picked) ?? best ?? result.rows[0] ?? null;
  const selectedOffer = offers?.find(o => o.id === selected?.id) ?? null;
  const headlineAmount = Math.max(0, ...inputs.map(o => o.amount));
  const pricedCount = result.rows.filter(r => !r.onApproval).length;

  // Tenure / rank change: drop the manual pick, then (after render) scroll
  // the recommended column into view and pulse it.
  const changeTenure = (t: number) => { setTenure(t); setPicked(null); focusNext.current = true; };
  const changeRank = (k: RankBy) => { setRankBy(k); setPicked(null); focusNext.current = true; };
  useEffect(() => {
    if (!focusNext.current || !best) return;
    focusNext.current = false;
    const idx = result.rows.findIndex(r => r.id === best.id);
    const maxX = Math.max(0, result.rows.length * COL_W - viewW);
    matrixRef.current?.scrollTo({ x: Math.min(maxX, Math.max(0, idx * COL_W - 12)), animated: true });
    flash.setValue(0);
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [result, best, viewW, flash]);

  const onApply = async () => {
    if (!selectedOffer || applying) return;
    setApplying(true);
    try { await select(selectedOffer); } finally { setApplying(false); }
  };

  const rankLabel = RANKS.find(r => r.key === rankBy)!;

  return (
    <Screen padded={false} contentStyle={{ paddingBottom: 110 }}>
      {/* Header — a plain View sizes + rounds it; the gradient only fills it. */}
      <View style={styles.hd}>
        <LinearGradient colors={[heroGradient[0], heroGradient[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.hdRow}>
          <Pressable onPress={back} hitSlop={12} accessibilityLabel="Back" accessibilityRole="button">
            <Icon name="chevron_left" size={28} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[font(800), styles.hdTitle]}>Compare your offers</Text>
            <Text style={[font(400), styles.hdSub]}>Pick the offer that fits you best</Text>
          </View>
        </View>
        {offers && offers.length ? (
          <View style={styles.amt}>
            <View style={styles.stat}>
              <Text style={[font(600), styles.amtK]}>LOAN AMOUNT</Text>
              <Text style={[font(800), styles.amtV]}>{rupee(headlineAmount)}</Text>
            </View>
            <View style={styles.vline} />
            <View style={styles.stat}>
              <Text style={[font(600), styles.amtK]}>OFFERS MATCHED</Text>
              <Text style={[font(800), styles.amtV]}>{offers.length} offer{offers.length === 1 ? '' : 's'}</Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        {offers == null ? (
          <View style={{ paddingTop: 50, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View>
        ) : offers.length === 0 ? (
          <Text style={[font(600), styles.empty]}>No offers to compare yet.</Text>
        ) : (
          <>
            {/* Controls: two dropdowns */}
            <View style={styles.controls}>
              <View style={{ flex: 0.8 }}>
                <Text style={[font(700), styles.label]}>TENURE</Text>
                <Dropdown value={`${tenure} months`} onPress={() => setPicker('tenure')} />
              </View>
              <View style={{ flex: 1.2 }}>
                <Text style={[font(700), styles.label]} numberOfLines={1}>RANK “BEST OFFER” BY</Text>
                <Dropdown value={rankLabel.label} onPress={() => setPicker('rank')} />
              </View>
            </View>

            {/* Matrix */}
            <View style={styles.matrix}>
              {/* Pinned labels */}
              <View style={{ width: LABEL_W }}>
                <View style={[styles.brandCell, { height: H_HEAD }]}>
                  <LogoMark size={30} style={{ borderRadius: 9 }} />
                  <Text style={[font(800), styles.brandText]}>SwiftLoan</Text>
                </View>
                {METRICS.map(m => (
                  <View key={m.key} style={[styles.labelCell, { height: m.height }]}>
                    <Text style={[font(700), styles.metricLabel]}>{m.label}</Text>
                  </View>
                ))}
              </View>
              {/* Lender columns */}
              <View style={{ flex: 1 }}>
                <ScrollView
                  ref={matrixRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ flex: 1 }}
                  scrollEventThrottle={32}
                  onLayout={e => setViewW(e.nativeEvent.layout.width)}
                  onScroll={e => onMatrixScroll(e.nativeEvent.contentOffset.x)}
                >
                  {result.rows.map(r => {
                    const isSel = r.id === selected?.id;
                    const isBest = r.id === best?.id;
                    const fastest = result.winners.approval === r.id;
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => setPicked(r.id)}
                        style={[styles.col, isSel && { backgroundColor: C.selBg }]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSel }}
                        accessibilityLabel={`${r.lenderName}${isBest ? ', recommended' : ''}`}
                      >
                        {isBest ? (
                          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { opacity: flash }]} />
                        ) : null}
                        <View style={[styles.head, { height: H_HEAD }]}>
                          <Text style={[font(800), styles.nm, isSel && { color: colors.primary }]} numberOfLines={2}>{r.lenderName}</Text>
                          {r.onApproval ? <Badge tone="amber" label="Rate on approval" /> : null}
                          {isBest ? <Badge tone="amber" label="Recommended" /> : null}
                          {isSel ? <Badge tone="sel" label="✓ Selected" /> : null}
                        </View>
                        {METRICS.map(m => {
                          const show = !m.priced || !r.onApproval;
                          const win = show && m.win && pricedCount > 1 && result.winners[m.win] === r.id;
                          return (
                            <View key={m.key} style={[styles.cellWrap, { height: m.height }]}>
                              {show ? (
                                <View style={[styles.cell, win && styles.win]}>
                                  <Text style={[font(m.big ? 800 : 700), m.big ? styles.valBig : styles.val, win && { color: C.best }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                                    {m.value(r)}
                                  </Text>
                                  {win ? <Text style={[font(800), styles.tag]}>{m.tag!.toUpperCase()}</Text> : null}
                                </View>
                              ) : (
                                <Text style={[font(700), styles.approval]}>On approval</Text>
                              )}
                              {m.key === 'emi' ? (
                                <Text style={[font(700), styles.apprLine, fastest && styles.apprFast]} numberOfLines={1}>
                                  ⚡ {formatApproval(r.approvalHrs)} approval
                                </Text>
                              ) : null}
                            </View>
                          );
                        })}
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <SwipeHint visible={!swiped && result.rows.length * COL_W > viewW + 4 && viewW > 0} count={result.rows.length} scrolled={scrolledX > 4} />
              </View>
            </View>

            <Text style={[font(400), styles.legend]}>
              Green = best value in that row at the selected tenure. <Text style={font(700)}>Tap any lender</Text> to choose it over the recommendation.{'\n'}
              EMIs are indicative; final terms are set by the lender.
            </Text>

            {/* Best overall */}
            {best ? (
              <View style={styles.best}>
                <View style={styles.bestIc}><Icon name="check" size={18} color="#fff" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[font(800), styles.bestT]}>BEST OVERALL</Text>
                  <Text style={[font(400), styles.bestM]}>
                    <Text style={font(800)}>{best.lenderName}</Text> wins on <Text style={font(800)}>{rankLabel.phrase}</Text> over {tenure} months — EMI{' '}
                    <Text style={font(800)}>{rupee(best.emi!)}</Text> at <Text style={font(800)}>{best.rate}%</Text>, total repayment{' '}
                    <Text style={font(800)}>{rupee(best.totalRepay!)}</Text>
                    {best.approvalHrs != null ? <>, approval <Text style={font(800)}>{formatApproval(best.approvalHrs).toLowerCase()}</Text></> : null}.
                  </Text>
                </View>
              </View>
            ) : result.rows.length ? (
              <View style={styles.infoBox}><Text style={[font(500), styles.infoText]}>These lenders confirm their rate only after approval, so we can’t rank them yet.</Text></View>
            ) : null}

            {selected && selectedOffer ? (
              <View style={{ marginTop: 16 }}>
                <PrimaryButton
                  label={applying ? 'Applying…' : `Apply with ${selected.lenderName}`}
                  voiceId="Apply with selected offer"
                  disabled={applying}
                  onPress={onApply}
                />
                {picked && best && selected.id !== best.id ? (
                  <Text style={[font(700), styles.pickNote]}>You chose {selected.lenderName} instead of the recommended {best.lenderName}.</Text>
                ) : null}
              </View>
            ) : null}
            <Text style={[font(400), styles.note]}>SwiftLoan is a marketplace — loans are provided by RBI-regulated lenders.</Text>
          </>
        )}
      </View>

      <PickerSheet
        visible={picker === 'tenure'}
        title="Tenure"
        options={TENURES.map(t => ({ key: String(t), label: `${t} months` }))}
        value={String(tenure)}
        onPick={k => changeTenure(Number(k))}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'rank'}
        title="Rank “best offer” by"
        options={RANKS.map(r => ({ key: r.key, label: r.label }))}
        value={rankBy}
        onPick={k => changeRank(k as RankBy)}
        onClose={() => setPicker(null)}
      />
    </Screen>
  );
}

/** A select-style field: current value + chevron; opens a PickerSheet. */
function Dropdown({ value, onPress }: { value: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.dd, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={value}>
      <Text style={[font(700), styles.ddText]} numberOfLines={1}>{value}</Text>
      <Icon name="expand_more" size={20} color={colors.textSoft} />
    </Pressable>
  );
}

/** Bottom-sheet option list for a Dropdown (native select look on both platforms). */
function PickerSheet({ visible, title, options, value, onPick, onClose }: {
  visible: boolean; title: string; options: { key: string; label: string }[]; value: string;
  onPick: (key: string) => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: 14 + insets.bottom }]}>
        <View style={styles.sheetGrab} />
        <Text style={[font(800), styles.sheetTitle]}>{title}</Text>
        {options.map(o => {
          const on = o.key === value;
          return (
            <Pressable
              key={o.key}
              onPress={() => { onPick(o.key); onClose(); }}
              style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && { opacity: 0.8 }]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <Text style={[font(on ? 800 : 600), styles.optionText, on && { color: colors.primary }]}>{o.label}</Text>
              {on ? <Icon name="check" size={20} color={colors.primary} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}

/**
 * Right-edge fade + a theme-coloured arrow that nudges right — shown while
 * more lender columns sit off-screen, faded out the moment the user scrolls
 * them. A soft left-edge fade appears once scrolled so columns don't look
 * sliced where they pass under the pinned labels.
 */
function SwipeHint({ visible, count, scrolled }: { visible: boolean; count: number; scrolled: boolean }) {
  const show = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const nudge = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(show, { toValue: visible ? 1 : 0, duration: visible ? 300 : 220, useNativeDriver: true }).start();
  }, [visible, show]);
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(nudge, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(nudge, { toValue: 0, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(500),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, nudge]);
  const arrowX = nudge.interpolate({ inputRange: [0, 1], outputRange: [0, 5] });
  return (
    <>
      {scrolled ? (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(248,250,249,0.95)', 'rgba(248,250,249,0)']}
          start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
          style={[styles.edgeFade, { left: 0 }]}
        />
      ) : null}
      <Animated.View pointerEvents="none" style={[styles.edgeFadeRight, { opacity: show }]}>
        <LinearGradient
          colors={['rgba(248,250,249,0)', 'rgba(248,250,249,0.95)']}
          start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        accessible
        accessibilityLabel={`Scroll right to see all ${count} offers`}
        style={[styles.swipeArrow, { opacity: show, transform: [{ translateX: arrowX }] }]}
      >
        <Icon name="arrow_forward_ios" size={20} color={colors.primary} />
      </Animated.View>
    </>
  );
}

function Badge({ label, tone }: { label: string; tone: 'amber' | 'sel' }) {
  return (
    <View style={[styles.badge, tone === 'amber' ? { backgroundColor: C.amberBg } : { backgroundColor: colors.primary }]}>
      <Text style={[font(800), { fontSize: 10, color: tone === 'amber' ? C.amber : '#fff' }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hd: { marginHorizontal: 12, marginTop: 4, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, borderRadius: 22, overflow: 'hidden' },
  hdRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hdTitle: { fontSize: 19, color: '#fff', letterSpacing: -0.3 },
  hdSub: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  amt: {
    marginTop: 14, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14,
  },
  stat: { flex: 1 },
  vline: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 14 },
  amtK: { fontSize: 10.5, color: 'rgba(255,255,255,0.8)', letterSpacing: 0.4 },
  amtV: { fontSize: 16, color: '#fff', marginTop: 2 },

  body: { paddingHorizontal: 16, paddingTop: 16 },
  empty: { fontSize: 14, color: colors.textSoft, textAlign: 'center', marginTop: 40 },
  label: { fontSize: 11, color: colors.muted, letterSpacing: 0.6, marginBottom: 7, marginLeft: 2 },

  controls: { flexDirection: 'row', gap: 10 },
  dd: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4,
    height: 46, paddingLeft: 13, paddingRight: 8, borderRadius: 12,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
  },
  ddText: { flex: 1, fontSize: 13.5, color: colors.text },

  matrix: { flexDirection: 'row', marginTop: 16, borderTopWidth: 1, borderColor: colors.line },
  brandCell: { alignItems: 'flex-start', justifyContent: 'flex-end', gap: 5, paddingBottom: 10 },
  brandText: { fontSize: 12.5, color: colors.primary, letterSpacing: -0.2 },
  labelCell: { justifyContent: 'center', borderTopWidth: 1, borderColor: colors.line, paddingRight: 6 },
  metricLabel: { fontSize: 11.5, color: colors.muted },
  col: { width: COL_W, borderRadius: 12, overflow: 'hidden' },
  flash: { backgroundColor: 'rgba(47,177,131,0.22)', borderRadius: 12 },
  head: { alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingHorizontal: 6, paddingBottom: 10 },
  nm: { fontSize: 14, color: colors.text, textAlign: 'center' },
  badge: { borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  cellWrap: { borderTopWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  cell: { alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 5, paddingHorizontal: 6, maxWidth: COL_W - 8 },
  win: { backgroundColor: C.bestBg },
  val: { fontSize: 13, color: colors.text },
  valBig: { fontSize: 18, color: colors.text },
  tag: { fontSize: 9, color: C.best, letterSpacing: 0.4, marginTop: 2 },
  apprLine: { fontSize: 10.5, color: colors.textSoft, marginTop: 5 },
  apprFast: { color: C.best },
  approval: { fontSize: 12, color: colors.muted, fontStyle: 'italic' },
  edgeFade: { position: 'absolute', top: 0, bottom: 0, width: 18 },
  edgeFadeRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: 44 },
  // Just the theme-coloured arrow, vertically centred on the right edge.
  swipeArrow: { position: 'absolute', right: 4, top: '50%', marginTop: -10 },

  legend: { fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 12, lineHeight: 16 },
  best: { flexDirection: 'row', gap: 11, alignItems: 'flex-start', marginTop: 14, backgroundColor: C.bestBg, borderWidth: 1, borderColor: C.best, borderRadius: 14, padding: 13 },
  bestIc: { width: 30, height: 30, borderRadius: 9, backgroundColor: C.best, alignItems: 'center', justifyContent: 'center' },
  bestT: { fontSize: 11, color: C.best, letterSpacing: 0.5 },
  bestM: { fontSize: 13, color: colors.text, marginTop: 2, lineHeight: 19 },
  infoBox: { marginTop: 14, backgroundColor: colors.chip, borderRadius: 14, padding: 13 },
  infoText: { fontSize: 13, color: colors.textMid },
  pickNote: { fontSize: 11.5, color: C.amber, textAlign: 'center', marginTop: 8 },
  note: { fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 8 },

  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10 },
  sheetGrab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: 12 },
  sheetTitle: { fontSize: 16, color: colors.text, marginBottom: 8, marginLeft: 4 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12 },
  optionOn: { backgroundColor: C.selBg },
  optionText: { fontSize: 15, color: colors.text },
});
