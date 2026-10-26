import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal, ActivityIndicator, Animated, Easing, Image } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { PrimaryButton, Toggle } from '../components/Controls';
import { colors, font, rupee, heroGradient } from '../theme/tokens';
import { useStore } from '../state/store';
import { api, Offer } from '../api/client';
import { loadOffersCache } from '../state/session';
import { useOfferSelect, displayLenderName } from './offers';
import { compareOffers, computeRow, defaultTenure, summariseCompareForAgent, TENURES, type CompareRow, type RankBy } from '../utils/compareOffers';
import { registerTarget } from '../voice/actionRegistry';
import { VoiceHidden } from '../voice/screenGraph';

// Same visual language as the compare-offers design reference.
const C = {
  best: '#12805A',
  bestBg: '#E4F6EE',
  amber: '#B4740A',
  amberBg: '#FCEFD9',
  selBg: '#E1F3F3',
  segBg: '#EEF3F3',
  fixcol: '#EAF5F4',   // slight brand tint for the pinned label column
  stripe: '#F5F9F9',   // alternating row shade
};

const RANKS: { key: RankBy; label: string; phrase: string }[] = [
  { key: 'cost', label: 'Lowest total cost', phrase: 'lowest total cost' },
  { key: 'emi', label: 'Lowest EMI', phrase: 'lowest EMI' },
  { key: 'rate', label: 'Lowest rate', phrase: 'lowest interest rate' },
  { key: 'interest', label: 'Least interest', phrase: 'least total interest' },
];

// Comparison-matrix geometry: a pinned label column + one column per lender,
// every row a fixed height so the pinned labels line up with the scrolled cells.
const LABEL_W = 112;
const COL_W = 124;
const H_HEAD = 92;
const H_EMI = 70;
const H_ROW = 58;
// total column height = header + every metric row; used to size the pulse overlay.
const TOTAL_H = H_HEAD + H_EMI + H_ROW * 6;

type Winners = { emi: string | null; rate: string | null; interest: string | null; cost: string | null };
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
  { key: 'amount', label: 'Eligible amount (up to)', height: H_ROW, priced: false, value: r => rupee(r.amount) },
  { key: 'tenure', label: 'Tenure', height: H_ROW, priced: false, value: r => `${r.tenure} mo` },
  { key: 'interest', label: 'Total interest', height: H_ROW, win: 'interest', tag: 'Least interest', priced: true, value: r => rupee(r.totalInterest!) },
  { key: 'fee', label: 'Processing fee', height: H_ROW, priced: true, value: r => rupee(r.fees) },
  { key: 'repay', label: 'Total you repay', height: H_ROW, win: 'cost', tag: 'Cheapest overall', priced: true, value: r => rupee(r.totalRepay!) },
];

/**
 * Compare offers — laid out after the compare-offers design reference: a
 * gradient header with the loan amount, a tenure segmented control, "rank
 * best offer by" chips, a "Best overall" banner, and a comparison matrix
 * (pinned metric labels + a column per lender, best value per row in green).
 * Tap a lender to choose it over the recommendation; Apply follows the pick.
 *
 * EMI, interest and totals are computed on-device from each offer's amount,
 * rate and fee (+GST) — see utils/compareOffers.ts (same logic as the
 * website). Extra filters (EMI budget, amount, rate-on-approval) sit behind
 * a small "Filters" link so the main view stays as simple as the design.
 */
export default function Compare() {
  const { state, back, mergeApiContext } = useStore();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [tenure, setTenure] = useState(24);
  const [rankBy, setRankBy] = useState<RankBy>('cost');
  const [maxEmi, setMaxEmi] = useState<number | null>(null);
  const [minAmount, setMinAmount] = useState<number | null>(null);
  const [includeOnApproval, setIncludeOnApproval] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [applying, setApplying] = useState(false);
  const select = useOfferSelect();
  // Horizontal-scroll affordance: a nudging arrow until the user
  // scrolls the lender columns once; then it's gone for good on this visit.
  const [viewW, setViewW] = useState(0);
  const [swiped, setSwiped] = useState(false);
  const [scrolledX, setScrolledX] = useState(0);
  // Reveal + pulse the recommended column when the ranking / tenure changes.
  const matrixRef = useRef<ScrollView>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const [pulseIndex, setPulseIndex] = useState<number | null>(null);
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
    })),
    [offers],
  );
  const result = useMemo(
    () => compareOffers(inputs, { tenure, rankBy, maxEmi, minAmount, includeOnApproval }),
    [inputs, tenure, rankBy, maxEmi, minAmount, includeOnApproval],
  );

  const emiSteps = useMemo(() => {
    const emis = inputs.map(o => computeRow(o, tenure).emi).filter((v): v is number => v != null).sort((a, b) => a - b);
    return [...new Set(emis.map(v => Math.ceil(v / 500) * 500))];
  }, [inputs, tenure]);
  const amountSteps = useMemo(() => [...new Set(inputs.map(o => o.amount))].sort((a, b) => a - b).slice(1), [inputs]);
  useEffect(() => { if (maxEmi != null && !emiSteps.includes(maxEmi)) setMaxEmi(null); }, [emiSteps, maxEmi]);

  const best = result.best;
  const selected = result.rows.find(r => r.id === picked) ?? best ?? result.rows[0] ?? null;
  const selectedOffer = offers?.find(o => o.id === selected?.id) ?? null;
  const activeFilters = (maxEmi != null ? 1 : 0) + (minAmount != null ? 1 : 0) + (includeOnApproval ? 0 : 1);
  const resetFilters = () => { setMaxEmi(null); setMinAmount(null); setIncludeOnApproval(true); };
  const headlineAmount = Math.max(0, ...inputs.map(o => o.amount));
  const pricedCount = result.rows.filter(r => !r.onApproval).length;

  // Tenure / rank change: drop the manual pick; the effect below scrolls the
  // recommended column into view and pulses it.
  const changeTenure = (t: number) => { setTenure(t); setPicked(null); };
  const changeRank = (k: RankBy) => { setRankBy(k); setPicked(null); };
  useEffect(() => {
    if (!best) return;
    const idx = result.rows.findIndex(r => r.id === best.id);
    if (idx < 0) return;
    const t = setTimeout(() => {
      matrixRef.current?.scrollTo({ x: Math.max(0, idx * COL_W - 8), animated: true });
    }, 60);
    setPulseIndex(idx);
    pulse.setValue(0);
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankBy, tenure, best?.id]);
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.26] });

  const onApply = async () => {
    if (!selectedOffer || applying) return;
    setApplying(true);
    try { await select(selectedOffer); } finally { setApplying(false); }
  };

  const rankLabel = RANKS.find(r => r.key === rankBy)!;

  // ── What the voice agent can see and do on this screen ─────────────────────
  // The matrix is a horizontally scrolling grid of Pressables and prop-only cells,
  // which the screen walker cannot read (and its 40-line cap would cut it short), so
  // the agent is given the whole comparison as data instead...
  useEffect(() => {
    if (offers == null) { mergeApiContext({ compare: { status: 'loading' } }); return; }
    if (offers.length === 0) { mergeApiContext({ compare: { status: 'empty', message: 'No offers to compare yet.' } }); return; }
    mergeApiContext({
      compare: summariseCompareForAgent({
        result,
        tenure,
        rankLabel: rankLabel.label,
        rankOptions: RANKS.map(r => r.label),
        selectedId: selected?.id ?? null,
        pickedId: picked,
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers, result, tenure, rankBy, picked, selected?.id]);

  // ...and the controls are exposed directly, so it never has to open the tenure /
  // ranking sheets (which live in a Modal it cannot see): every tenure, every ranking
  // and every lender is a selectable option with a selected state.
  useEffect(() => {
    if (!offers?.length) return undefined;
    const un: Array<() => void> = [];
    TENURES.forEach(tn =>
      un.push(registerTarget(state.screen, `compare:tenure:${tn}`, {
        kind: 'chips', group: 'Tenure', label: `${tn} months`, getValue: () => tenure === tn, onTap: () => changeTenure(tn),
      })),
    );
    RANKS.forEach(r =>
      un.push(registerTarget(state.screen, `compare:rank:${r.key}`, {
        kind: 'chips', group: 'Rank best offer by', label: r.label, getValue: () => rankBy === r.key, onTap: () => changeRank(r.key),
      })),
    );
    result.rows.forEach(r =>
      un.push(registerTarget(state.screen, `compare:lender:${r.id}`, {
        kind: 'chips', group: 'Lender', label: r.lenderName, getValue: () => r.id === selected?.id, onTap: () => setPicked(r.id),
      })),
    );
    un.push(registerTarget(state.screen, 'compare:back', { kind: 'button', label: 'Back', onTap: back }));
    return () => un.forEach(u => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers, result, tenure, rankBy, selected?.id, state.screen]);

  return (
    <Screen padded={false} contentStyle={{ paddingBottom: 110 }}>
      {/* Header */}
      {/* A plain View sizes + rounds the header; the gradient only fills it
          as a background layer (sizing a LinearGradient by its own padding
          rendered it narrower-offset and shorter than its content). */}
      <View style={styles.hd}>
        <LinearGradient colors={[heroGradient[0], heroGradient[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.hdRow}>
          <Pressable onPress={back} hitSlop={12} accessibilityLabel="Back" accessibilityRole="button">
            <Icon name="chevron_left" size={28} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[font(800), styles.hdTitle]}>Compare your offers</Text>
            <Text style={[font(400), styles.hdSub]}>
              {offers ? `${offers.length} matched offer${offers.length === 1 ? '' : 's'} · pick what fits you` : 'Loading your offers…'}
            </Text>
          </View>
        </View>
        {headlineAmount > 0 ? (
          <View style={styles.amt}>
            <Text style={[font(600), styles.amtK]}>LOAN AMOUNT</Text>
            <Text style={[font(800), styles.amtV]}>{rupee(headlineAmount)}</Text>
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
            {/* Tenure + Rank as two dropdowns (tenure narrow, rank takes the rest) */}
            <View style={styles.controls2}>
              <View style={styles.ctrlNarrow}>
                <Text style={[font(700), styles.label]}>TENURE</Text>
                <Dropdown
                  ariaLabel="Repayment tenure"
                  value={tenure}
                  options={TENURES.map(t => ({ value: t as number, label: `${t} months` }))}
                  onChange={v => changeTenure(v)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.labelRow}>
                  <Text style={[font(700), styles.label, { marginBottom: 0 }]}>RANK “BEST OFFER” BY</Text>
                  <Pressable onPress={() => setSheet(true)} hitSlop={10} style={styles.filtersLink} accessibilityRole="button" accessibilityLabel="More filters">
                    <Icon name="tune" size={15} color={colors.primary} />
                    <Text style={[font(700), styles.filtersText]}>Filters{activeFilters ? ` · ${activeFilters}` : ''}</Text>
                  </Pressable>
                </View>
                <Dropdown
                  ariaLabel="Rank best offer by"
                  value={rankBy}
                  options={RANKS.map(r => ({ value: r.key, label: r.label }))}
                  onChange={v => changeRank(v)}
                />
              </View>
            </View>

            {/* Matrix — hidden from the text scrape; the agent gets it as `compare` data. */}
            <VoiceHidden>
            {result.rows.length === 0 ? (
              <View style={styles.noMatch}>
                <Text style={[font(700), { fontSize: 14, color: colors.text }]}>No offers match these filters</Text>
                <Pressable onPress={resetFilters}><Text style={[font(700), styles.link]}>Clear filters</Text></Pressable>
              </View>
            ) : (
              <View style={styles.matrix}>
                {/* Pinned labels — branded corner + tinted column */}
                <View style={{ width: LABEL_W }}>
                  <LinearGradient colors={['#1FA890', '#3AC2A4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.cornerCell, { height: H_HEAD }]}>
                    <Image source={require('../../assets/brand/icon_fullbleed.png')} style={styles.cornerIcon} resizeMode="contain" />
                    <Text style={[font(800), styles.cornerText]}>SwiftLoan</Text>
                  </LinearGradient>
                  {METRICS.map((m, i) => (
                    <View key={m.key} style={[styles.labelCell, { height: m.height }, i % 2 === 1 && { backgroundColor: C.stripe }]}>
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
                  {pulseIndex != null ? (
                    <Animated.View pointerEvents="none" style={[styles.pulseCol, { left: pulseIndex * COL_W, height: TOTAL_H, opacity: pulseOpacity }]} />
                  ) : null}
                  {result.rows.map(r => {
                    const isSel = r.id === selected?.id;
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => setPicked(r.id)}
                        style={[styles.col, isSel && { backgroundColor: C.selBg }]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSel }}
                        accessibilityLabel={`${r.lenderName}${r.id === best?.id ? ', recommended' : ''}`}
                      >
                        <View style={[styles.head, { height: H_HEAD }]}>
                          <Text style={[font(800), styles.nm, isSel && { color: colors.primary }]} numberOfLines={2}>{r.lenderName}</Text>
                          {r.onApproval ? <Badge tone="amber" label="Rate on approval" /> : null}
                          {r.id === best?.id ? <Badge tone="amber" label="Recommended" /> : null}
                          {isSel ? <Badge tone="sel" label="✓ Selected" /> : null}
                        </View>
                        {METRICS.map((m, i) => {
                          const show = !m.priced || !r.onApproval;
                          const win = show && m.win && pricedCount > 1 && result.winners[m.win] === r.id;
                          const stripe = i % 2 === 1 && !isSel && !win;
                          return (
                            <View key={m.key} style={[styles.cellWrap, { height: m.height }, stripe && { backgroundColor: C.stripe }]}>
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
                            </View>
                          );
                        })}
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <SwipeHint
                  visible={!swiped && result.rows.length * COL_W > viewW + 4 && viewW > 0}
                  count={result.rows.length}
                  scrolled={scrolledX > 4}
                />
                </View>
              </View>
            )}

            {result.hiddenCount > 0 ? (
              <Pressable onPress={resetFilters} style={{ marginTop: 10 }}>
                <Text style={[font(500), styles.legend]}>
                  {result.hiddenCount} offer{result.hiddenCount > 1 ? 's' : ''} hidden by your filters · <Text style={[font(700), styles.link]}>show all</Text>
                </Text>
              </Pressable>
            ) : null}

            <Text style={[font(400), styles.legend]}>
              Green = best value in that row at the selected tenure. <Text style={font(700)}>Tap any lender</Text> to choose it over the recommendation.{'\n'}
              EMIs are indicative; some lenders confirm the rate only after approval.
            </Text>
            </VoiceHidden>

            {/* Best overall — sits just above Apply */}
            <VoiceHidden>
            {best ? (
              <View style={styles.best}>
                <View style={styles.bestIc}><Icon name="check" size={14} color="#fff" /></View>
                <Text style={[font(400), styles.bestM]}>
                  <Text style={[font(800), { color: C.best }]}>{best.lenderName}</Text> wins on{' '}
                  <Text style={[font(800), { color: C.best }]}>{RANKS.find(r => r.key === rankBy)!.phrase}</Text> over {tenure} months — EMI{' '}
                  <Text style={font(800)}>{rupee(best.emi!)}</Text> at <Text style={font(800)}>{best.rate}%</Text>, total repayment{' '}
                  <Text style={font(800)}>{rupee(best.totalRepay!)}</Text>.
                </Text>
              </View>
            ) : result.rows.length ? (
              <View style={styles.infoBox}><Text style={[font(500), styles.infoText]}>These lenders confirm their rate only after approval, so we can’t rank them yet.</Text></View>
            ) : null}
            </VoiceHidden>

            {selected && selectedOffer ? (
              <View style={{ marginTop: 4 }}>
                <PrimaryButton
                  label={applying ? 'Applying…' : `Apply with ${selected.lenderName}${selected.onApproval ? ' (rate on approval)' : ''}`}
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

      <FilterSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        emiSteps={emiSteps} maxEmi={maxEmi} setMaxEmi={setMaxEmi}
        amountSteps={amountSteps} minAmount={minAmount} setMinAmount={setMinAmount}
        includeOnApproval={includeOnApproval} setIncludeOnApproval={setIncludeOnApproval}
        activeFilters={activeFilters} onReset={resetFilters}
        resultCount={result.rows.length}
      />
    </Screen>
  );
}

/**
 * Right-edge fade + a theme-coloured arrow that nudges right
 * — shown while more lender columns sit off-screen, faded out the moment the
 * user scrolls them. A soft left-edge fade appears once scrolled so columns
 * don't look sliced where they pass under the pinned labels.
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

/** Compact dropdown: a pill showing the current option that opens a bottom-sheet list. */
function Dropdown<T extends string | number>({ value, options, onChange, ariaLabel }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const cur = options.find(o => o.value === value);
  return (
    <>
      <Pressable style={styles.dd} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={ariaLabel} accessibilityValue={{ text: cur?.label }}>
        <Text style={[font(700), styles.ddText]} numberOfLines={1}>{cur?.label ?? ''}</Text>
        <Icon name="expand_more" size={18} color={colors.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.ddSheet, { paddingBottom: 12 + insets.bottom }]}>
          <Text style={[font(700), styles.label, { marginLeft: 6 }]}>{ariaLabel.toUpperCase()}</Text>
          {options.map(o => {
            const on = o.value === value;
            return (
              <Pressable key={String(o.value)} style={[styles.ddItem, on && { backgroundColor: C.selBg }]} onPress={() => { onChange(o.value); setOpen(false); }} accessibilityRole="button" accessibilityState={{ selected: on }}>
                <Text style={[font(on ? 800 : 600), styles.ddItemText, on && { color: colors.primary }]}>{o.label}</Text>
                {on ? <Icon name="check" size={16} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.rankBtn, on && styles.rankOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[font(700), styles.rankText, on && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

function FilterSheet(p: {
  visible: boolean; onClose: () => void;
  emiSteps: number[]; maxEmi: number | null; setMaxEmi: (v: number | null) => void;
  amountSteps: number[]; minAmount: number | null; setMinAmount: (v: number | null) => void;
  includeOnApproval: boolean; setIncludeOnApproval: (v: boolean) => void;
  activeFilters: number; onReset: () => void; resultCount: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={p.visible} transparent animationType="slide" onRequestClose={p.onClose}>
      <Pressable style={styles.scrim} onPress={p.onClose} accessibilityLabel="Close filters" />
      <View style={[styles.sheet, { paddingBottom: 18 + insets.bottom }]}>
        <View style={styles.sheetHead}>
          <Text style={[font(800), { fontSize: 17, color: colors.text }]}>Filters</Text>
          <Pressable onPress={p.onClose} style={styles.sheetClose} accessibilityLabel="Close filters"><Icon name="close" size={18} color={colors.text} /></Pressable>
        </View>
        <View style={{ gap: 20 }}>
          {p.emiSteps.length > 1 ? (
            <View>
              <Text style={[font(700), styles.label]}>MONTHLY EMI BUDGET</Text>
              <View style={styles.rankWrap}>
                <Chip on={p.maxEmi == null} onPress={() => p.setMaxEmi(null)} label="Any" />
                {p.emiSteps.slice(0, -1).map(v => <Chip key={v} on={p.maxEmi === v} onPress={() => p.setMaxEmi(v)} label={`Up to ${rupee(v)}`} />)}
              </View>
            </View>
          ) : null}
          {p.amountSteps.length ? (
            <View>
              <Text style={[font(700), styles.label]}>LOAN AMOUNT</Text>
              <View style={styles.rankWrap}>
                <Chip on={p.minAmount == null} onPress={() => p.setMinAmount(null)} label="Any" />
                {p.amountSteps.map(a => <Chip key={a} on={p.minAmount === a} onPress={() => p.setMinAmount(a)} label={`${rupee(a)}+`} />)}
              </View>
            </View>
          ) : null}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[font(700), { fontSize: 14, color: colors.text }]}>Include “rate on approval”</Text>
              <Text style={[font(400), { fontSize: 11.5, color: colors.textSoft }]}>Lenders who confirm the rate later</Text>
            </View>
            <Toggle value={p.includeOnApproval} onChange={p.setIncludeOnApproval} />
          </View>
          {p.activeFilters > 0 ? (
            <Pressable onPress={p.onReset}><Text style={[font(700), styles.link]}>Reset filters</Text></Pressable>
          ) : null}
        </View>
        <PrimaryButton label={`Show ${p.resultCount} offer${p.resultCount === 1 ? '' : 's'}`} icon={null} onPress={p.onClose} style={{ marginTop: 18 }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  hd: { marginHorizontal: 12, marginTop: 4, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, borderRadius: 22, overflow: 'hidden' },
  hdRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hdTitle: { fontSize: 19, color: '#fff', letterSpacing: -0.3 },
  hdSub: { fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  amt: {
    marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12, paddingVertical: 9, paddingHorizontal: 13,
  },
  amtK: { fontSize: 11, color: 'rgba(255,255,255,0.8)', letterSpacing: 0.3 },
  amtV: { fontSize: 16, color: '#fff' },

  body: { paddingHorizontal: 16, paddingTop: 16 },
  empty: { fontSize: 14, color: colors.textSoft, textAlign: 'center', marginTop: 40 },
  label: { fontSize: 11.5, color: colors.muted, letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  filtersLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  filtersText: { fontSize: 12, color: colors.primary },

  seg: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: C.segBg, borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  segBtn: { flex: 1, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  segText: { fontSize: 13, color: colors.textMid },

  controls2: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  ctrlNarrow: { width: 118 },
  dd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 11, backgroundColor: C.segBg },
  ddText: { flex: 1, fontSize: 12.5, color: colors.text },
  ddSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 14, paddingHorizontal: 10 },
  ddItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 10 },
  ddItemText: { fontSize: 14.5, color: colors.text },
  pulseCol: { position: 'absolute', top: 0, width: COL_W, backgroundColor: colors.primary, borderRadius: 12 },

  rankWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rankBtn: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: C.segBg },
  rankOn: { backgroundColor: colors.inkDeep, borderColor: colors.inkDeep },
  rankText: { fontSize: 12, color: colors.textMid },

  best: { flexDirection: 'row', gap: 9, alignItems: 'center', marginTop: 16, marginBottom: 6, backgroundColor: C.bestBg, borderWidth: 1, borderColor: C.best, borderRadius: 11, paddingVertical: 9, paddingHorizontal: 11 },
  bestIc: { width: 22, height: 22, borderRadius: 7, backgroundColor: C.best, alignItems: 'center', justifyContent: 'center' },
  bestM: { flex: 1, fontSize: 12, color: colors.text, lineHeight: 17 },
  infoBox: { marginTop: 16, backgroundColor: colors.chip, borderRadius: 14, padding: 13 },
  infoText: { fontSize: 13, color: colors.textMid },

  matrix: { flexDirection: 'row', marginTop: 14, borderTopWidth: 1, borderColor: colors.line },
  labelCell: { justifyContent: 'center', borderTopWidth: 1, borderColor: colors.line, paddingLeft: 8, paddingRight: 6, backgroundColor: C.fixcol },
  metricLabel: { fontSize: 11.5, color: colors.text, fontWeight: '700' },
  cornerCell: { alignItems: 'center', justifyContent: 'center', gap: 5, borderTopLeftRadius: 12 },
  cornerIcon: { width: 34, height: 34, borderRadius: 9 },
  cornerText: { fontSize: 12, color: '#fff', letterSpacing: -0.2 },
  col: { width: COL_W, borderRadius: 12 },
  head: { alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingHorizontal: 6, paddingBottom: 10 },
  nm: { fontSize: 14, color: colors.text, textAlign: 'center' },
  badge: { borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2 },
  cellWrap: { borderTopWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  cell: { alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 5, paddingHorizontal: 6, maxWidth: COL_W - 8 },
  win: { backgroundColor: C.bestBg },
  val: { fontSize: 13, color: colors.text },
  valBig: { fontSize: 18, color: colors.text },
  tag: { fontSize: 9, color: C.best, letterSpacing: 0.4, marginTop: 2 },
  approval: { fontSize: 12, color: colors.muted, fontStyle: 'italic' },
  edgeFade: { position: 'absolute', top: 0, bottom: 0, width: 18 },
  edgeFadeRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: 44 },
  // Just the theme-coloured arrow, vertically centred on the right edge.
  swipeArrow: { position: 'absolute', right: 4, top: '50%', marginTop: -10 },

  noMatch: { alignItems: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, borderRadius: 16, padding: 24, marginTop: 14 },
  link: { fontSize: 13, color: colors.primary, textDecorationLine: 'underline' },
  legend: { fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 12, lineHeight: 16 },
  pickNote: { fontSize: 11.5, color: C.amber, textAlign: 'center', marginTop: 8 },
  note: { fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 8 },

  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 16 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sheetClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
