import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal, Image, ActivityIndicator } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../components/Frame';
import Icon from '../components/Icon';
import { PrimaryButton, Toggle } from '../components/Controls';
import { colors, font, rupee, heroGradient, heroGradientStart, heroGradientEnd } from '../theme/tokens';
import { useStore } from '../state/store';
import { api, Offer } from '../api/client';
import { loadOffersCache } from '../state/session';
import { useOfferSelect, displayLenderName } from './offers';
import {
  compareOffers,
  computeRow,
  defaultTenure,
  RANK_LABELS,
  TENURES,
  type CompareRow,
  type RankBy,
} from '../utils/compareOffers';

const RANKS: RankBy[] = ['cost', 'emi', 'rate', 'interest'];
const RANK_HINT: Record<RankBy, string> = {
  cost: 'Interest + fees per ₹1 lakh — the fairest overall measure',
  emi: 'Smallest monthly payment',
  rate: 'Lowest annual interest rate',
  interest: 'Least interest paid over the loan',
};
const WIN_TAG = { cost: 'Cheapest', emi: 'Lowest EMI', rate: 'Lowest rate', interest: 'Least interest' } as const;

/**
 * Compare offers — every unapplied offer side by side, with EMI, interest and
 * total cost computed on-device (lenders only send amount, rate and fee; see
 * utils/compareOffers.ts, shared logic with the website). Tenure + "best by"
 * chips on top, a filter sheet for EMI budget / amount / rate-on-approval,
 * ranked cards, and a pinned "Apply with …" footer that follows the user's
 * pick (the recommendation until they choose another).
 */
export default function Compare() {
  const { state } = useStore();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [tenure, setTenure] = useState(24);
  const [rankBy, setRankBy] = useState<RankBy>('cost');
  const [maxEmi, setMaxEmi] = useState<number | null>(null);
  const [minAmount, setMinAmount] = useState<number | null>(null);
  const [includeOnApproval, setIncludeOnApproval] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [applying, setApplying] = useState(false);
  // Applying removes nothing here — useOfferSelect navigates on to the lender.
  const select = useOfferSelect();

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

  // EMI budget steps at this tenure (the priced offers' EMIs, rounded up).
  const emiSteps = useMemo(() => {
    const emis = inputs.map(o => computeRow(o, tenure).emi).filter((v): v is number => v != null).sort((a, b) => a - b);
    return [...new Set(emis.map(v => Math.ceil(v / 500) * 500))];
  }, [inputs, tenure]);
  const amountSteps = useMemo(() => [...new Set(inputs.map(o => o.amount))].sort((a, b) => a - b).slice(1), [inputs]);
  // A budget chip no longer offered at this tenure silently resets.
  useEffect(() => { if (maxEmi != null && !emiSteps.includes(maxEmi)) setMaxEmi(null); }, [emiSteps, maxEmi]);

  const selected = result.rows.find(r => r.id === picked) ?? result.best ?? result.rows[0] ?? null;
  const selectedOffer = offers?.find(o => o.id === selected?.id) ?? null;
  const activeFilters = (maxEmi != null ? 1 : 0) + (minAmount != null ? 1 : 0) + (includeOnApproval ? 0 : 1);
  const resetFilters = () => { setMaxEmi(null); setMinAmount(null); setIncludeOnApproval(true); };

  const onApply = async () => {
    if (!selectedOffer || applying) return;
    setApplying(true);
    try { await select(selectedOffer); } finally { setApplying(false); }
  };

  const footer = selected && selectedOffer ? (
    <View style={styles.footer}>
      <Text style={[font(500), styles.footerLine]} numberOfLines={1}>
        <Text style={[font(700), { color: colors.primary }]}>{selected.id === result.best?.id ? 'Best for you' : 'Your choice'}</Text>
        <Text style={[font(800), { color: colors.text }]}> · {selected.lenderName}</Text>
        {!selected.onApproval ? ` · ${rupee(selected.emi!)}/mo` : ''}
      </Text>
      <PrimaryButton
        label={applying ? 'Applying…' : `Apply with ${selected.lenderName}`}
        voiceId="Apply with selected offer"
        disabled={applying}
        onPress={onApply}
      />
    </View>
  ) : undefined;

  return (
    <Screen collapsingTitle="Compare offers" footer={footer}>
      <Text style={[font(800), styles.title]}>Compare your offers</Text>
      <Text style={[font(400), styles.sub]}>We've worked out the EMI, interest and total cost of each offer for you — choose what matters most.</Text>

      {offers == null ? (
        <View style={{ paddingTop: 60, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View>
      ) : offers.length === 0 ? (
        <Text style={[font(600), styles.empty]}>No offers to compare yet.</Text>
      ) : (
        <>
          {/* Tenure */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={styles.chipScroll}>
            {TENURES.map(t => (
              <Pill key={t} on={tenure === t} onPress={() => setTenure(t)} label={`${t} mo`} />
            ))}
          </ScrollView>

          {/* Best by + filters */}
          <View style={styles.rankRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ flex: 1 }}>
              {RANKS.map(k => (
                <Pill key={k} dark on={rankBy === k} onPress={() => setRankBy(k)} label={RANK_LABELS[k]} />
              ))}
            </ScrollView>
            <Pressable onPress={() => setSheet(true)} style={styles.filterBtn} accessibilityLabel="More filters" accessibilityRole="button">
              <Icon name="tune" size={19} color={colors.text} />
              {activeFilters > 0 ? (
                <View style={styles.filterBadge}><Text style={[font(700), styles.filterBadgeText]}>{activeFilters}</Text></View>
              ) : null}
            </Pressable>
          </View>

          {result.best ? (
            <BestCard row={result.best} rankBy={rankBy} saves={result.bestSavesVsWorst} />
          ) : result.rows.length ? (
            <View style={styles.note}><Text style={[font(500), styles.noteText]}>These lenders confirm their rate only after approval, so we can't rank them yet.</Text></View>
          ) : null}

          {result.rows.length === 0 ? (
            <View style={styles.noMatch}>
              <Text style={[font(700), { fontSize: 14, color: colors.text }]}>No offers match these filters</Text>
              <Pressable onPress={resetFilters}><Text style={[font(700), styles.link]}>Clear filters</Text></Pressable>
            </View>
          ) : (
            <View style={{ gap: 12, marginTop: 14 }}>
              {result.rows.map((r, i) => (
                <OfferCard
                  key={r.id}
                  row={r}
                  rank={r.onApproval ? null : i + 1}
                  winners={result.winners}
                  isBest={r.id === result.best?.id}
                  selected={r.id === selected?.id}
                  onPress={() => setPicked(r.id)}
                />
              ))}
            </View>
          )}

          {result.hiddenCount > 0 ? (
            <Pressable onPress={resetFilters} style={{ marginTop: 12 }}>
              <Text style={[font(500), styles.hidden]}>
                {result.hiddenCount} offer{result.hiddenCount > 1 ? 's' : ''} hidden by your filters · <Text style={[font(700), styles.link]}>show all</Text>
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.disclaimer}>
            <Icon name="info" size={14} color={colors.muted} />
            <Text style={[font(400), styles.disclaimerText]}>
              Figures are indicative — calculated by SwiftLoan from each lender's rate and fees for the tenure you choose. The lender confirms final terms before disbursal.
            </Text>
          </View>
        </>
      )}

      <FilterSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        tenure={tenure} setTenure={setTenure}
        rankBy={rankBy} setRankBy={setRankBy}
        emiSteps={emiSteps} maxEmi={maxEmi} setMaxEmi={setMaxEmi}
        amountSteps={amountSteps} minAmount={minAmount} setMinAmount={setMinAmount}
        includeOnApproval={includeOnApproval} setIncludeOnApproval={setIncludeOnApproval}
        activeFilters={activeFilters} onReset={resetFilters}
        resultCount={result.rows.length}
      />
    </Screen>
  );
}

function Pill({ label, on, onPress, dark }: { label: string; on: boolean; onPress: () => void; dark?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.pill, on && (dark ? styles.pillOnDark : styles.pillOn)]}
    >
      <Text style={[font(700), styles.pillText, on && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

function LenderMark({ row, light }: { row: CompareRow; light?: boolean }) {
  if (row.logoUrl) {
    return <View style={[styles.mark, styles.markImg]}><Image source={{ uri: row.logoUrl }} style={{ width: 34, height: 34 }} resizeMode="contain" /></View>;
  }
  return (
    <View style={[styles.mark, light ? { backgroundColor: 'rgba(255,255,255,0.16)' } : null]}>
      <Text style={[font(800), { fontSize: 12, color: light ? '#fff' : colors.primary }]}>{row.lenderName.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

function BestCard({ row, rankBy, saves }: { row: CompareRow; rankBy: RankBy; saves: number | null }) {
  return (
    <LinearGradient colors={heroGradient as unknown as string[]} start={heroGradientStart} end={heroGradientEnd} style={styles.best}>
      <View style={styles.bestHead}>
        <LenderMark row={row} light />
        <View style={{ flex: 1 }}>
          <Text style={[font(700), styles.bestEyebrow]} numberOfLines={1}>BEST FOR YOU · {RANK_LABELS[rankBy].toUpperCase()}</Text>
          <Text style={[font(800), styles.bestName]} numberOfLines={1}>{row.lenderName}</Text>
        </View>
      </View>
      {saves != null && saves > 0 ? (
        <View style={styles.saves}>
          <Icon name="trending_down" size={14} color="#fff" />
          <Text style={[font(700), styles.savesText]}>Saves {rupee(saves)} vs the costliest</Text>
        </View>
      ) : null}
      <View style={styles.bestStats}>
        <BestStat k="Monthly EMI" v={rupee(row.emi!)} />
        <BestStat k="Interest" v={`${row.rate}%`} />
        <BestStat k="Total cost" v={rupee(row.costOfBorrowing!)} />
      </View>
      <Text style={[font(500), styles.bestFoot]}>{rupee(row.amount)} over {row.tenure} months · you repay {rupee(row.totalRepay!)}</Text>
    </LinearGradient>
  );
}

function BestStat({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.bestStat}>
      <Text style={[font(700), styles.bestStatK]}>{k.toUpperCase()}</Text>
      <Text style={[font(800), styles.bestStatV]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{v}</Text>
    </View>
  );
}

type Winners = { emi: string | null; rate: string | null; interest: string | null; cost: string | null };

function OfferCard({ row, rank, winners, isBest, selected, onPress }: {
  row: CompareRow; rank: number | null; winners: Winners; isBest: boolean; selected: boolean; onPress: () => void;
}) {
  const tags = (['cost', 'emi', 'rate', 'interest'] as const).filter(k => winners[k] === row.id && !(isBest && k === 'cost')).map(k => WIN_TAG[k]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${row.lenderName}${isBest ? ', best for you' : ''}`}
      style={[styles.card, selected && styles.cardSel]}
    >
      <View style={styles.cardHead}>
        {rank != null ? (
          <View style={[styles.rank, isBest && { backgroundColor: colors.mint }]}>
            <Text style={[font(800), { fontSize: 12, color: isBest ? '#fff' : colors.textSoft }]}>{rank}</Text>
          </View>
        ) : null}
        <LenderMark row={row} />
        <View style={{ flex: 1 }}>
          <Text style={[font(800), styles.cardName]} numberOfLines={1}>{row.lenderName}</Text>
          <Text style={[font(500), styles.cardSub]}>{rupee(row.amount)} eligible</Text>
        </View>
        <View style={[styles.radio, selected && styles.radioOn]}>
          {selected ? <Icon name="check" size={14} color="#fff" /> : null}
        </View>
      </View>

      {isBest || row.onApproval || tags.length ? (
        <View style={styles.tags}>
          {isBest ? <Tag tone="best" label="Best for you" /> : null}
          {row.onApproval ? <Tag tone="amber" label="Rate on approval" /> : null}
          {tags.map(t => <Tag key={t} tone="soft" label={t} />)}
        </View>
      ) : null}

      {row.onApproval ? (
        <Text style={[font(400), styles.onApprovalText]}>This lender confirms the interest rate after approval, so EMI and costs can't be worked out yet.</Text>
      ) : (
        <View style={styles.grid}>
          <Stat k="Monthly EMI" v={rupee(row.emi!)} win={winners.emi === row.id} />
          <Stat k="Interest rate" v={`${row.rate}% p.a.`} win={winners.rate === row.id} />
          <Stat k="Total interest" v={rupee(row.totalInterest!)} win={winners.interest === row.id} />
          <Stat k="Fee + GST" v={rupee(row.fees)} />
          <View style={styles.costRow}>
            <Text style={[font(700), styles.statK]}>TOTAL COST OF LOAN</Text>
            <Text style={[font(800), { fontSize: 14, color: winners.cost === row.id ? colors.greenDeep : colors.text }]}>{rupee(row.costOfBorrowing!)}</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

function Stat({ k, v, win }: { k: string; v: string; win?: boolean }) {
  return (
    <View style={[styles.stat, win && styles.statWin]}>
      <Text style={[font(700), styles.statK]}>{k.toUpperCase()}</Text>
      <Text style={[font(800), styles.statV, win && { color: colors.greenDeep }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{v}</Text>
    </View>
  );
}

function Tag({ label, tone }: { label: string; tone: 'best' | 'amber' | 'soft' }) {
  const bg = tone === 'best' ? colors.mint : tone === 'amber' ? '#FCEFD9' : '#E4F6EE';
  const fg = tone === 'best' ? '#fff' : tone === 'amber' ? '#B4740A' : colors.greenDeep;
  return <View style={[styles.tag, { backgroundColor: bg }]}><Text style={[font(700), { fontSize: 10.5, color: fg }]}>{label}</Text></View>;
}

function FilterSheet(p: {
  visible: boolean; onClose: () => void;
  tenure: number; setTenure: (t: number) => void;
  rankBy: RankBy; setRankBy: (r: RankBy) => void;
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
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 20, paddingBottom: 6 }}>
          <View>
            <Text style={[font(700), styles.sheetLabel]}>TENURE</Text>
            <View style={styles.wrapRow}>
              {TENURES.map(t => <Pill key={t} on={p.tenure === t} onPress={() => p.setTenure(t)} label={`${t} mo`} />)}
            </View>
          </View>
          <View>
            <Text style={[font(700), styles.sheetLabel]}>BEST OFFER BY</Text>
            <View style={{ gap: 8 }}>
              {RANKS.map(k => {
                const on = p.rankBy === k;
                return (
                  <Pressable key={k} onPress={() => p.setRankBy(k)} style={[styles.option, on && styles.optionOn]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                    <View style={[styles.optRadio, on && { borderColor: colors.primary }]}>{on ? <View style={styles.optDot} /> : null}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={[font(700), { fontSize: 14, color: colors.text }]}>{RANK_LABELS[k]}</Text>
                      <Text style={[font(400), { fontSize: 11.5, color: colors.textSoft, marginTop: 1 }]}>{RANK_HINT[k]}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {p.emiSteps.length > 1 ? (
            <View>
              <Text style={[font(700), styles.sheetLabel]}>MONTHLY EMI BUDGET</Text>
              <View style={styles.wrapRow}>
                <Pill on={p.maxEmi == null} onPress={() => p.setMaxEmi(null)} label="Any" />
                {p.emiSteps.slice(0, -1).map(v => <Pill key={v} on={p.maxEmi === v} onPress={() => p.setMaxEmi(v)} label={`Up to ${rupee(v)}`} />)}
              </View>
            </View>
          ) : null}
          {p.amountSteps.length ? (
            <View>
              <Text style={[font(700), styles.sheetLabel]}>LOAN AMOUNT</Text>
              <View style={styles.wrapRow}>
                <Pill on={p.minAmount == null} onPress={() => p.setMinAmount(null)} label="Any" />
                {p.amountSteps.map(a => <Pill key={a} on={p.minAmount === a} onPress={() => p.setMinAmount(a)} label={`${rupee(a)}+`} />)}
              </View>
            </View>
          ) : null}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[font(700), { fontSize: 14, color: colors.text }]}>Include "rate on approval"</Text>
              <Text style={[font(400), { fontSize: 11.5, color: colors.textSoft }]}>Lenders who confirm the rate later</Text>
            </View>
            <Toggle value={p.includeOnApproval} onChange={p.setIncludeOnApproval} />
          </View>
          {p.activeFilters > 0 ? (
            <Pressable onPress={p.onReset}><Text style={[font(700), styles.link]}>Reset filters</Text></Pressable>
          ) : null}
        </ScrollView>
        <PrimaryButton label={`Show ${p.resultCount} offer${p.resultCount === 1 ? '' : 's'}`} icon={null} onPress={p.onClose} style={{ marginTop: 12 }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, letterSpacing: -0.5, color: colors.text, marginTop: 8 },
  sub: { fontSize: 13.5, color: colors.textSoft, marginTop: 4, lineHeight: 19 },
  empty: { fontSize: 14, color: colors.textSoft, textAlign: 'center', marginTop: 40 },
  chipScroll: { marginTop: 16, marginHorizontal: -20 },
  chipRow: { gap: 8, paddingHorizontal: 20 },
  rankRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginRight: -4, gap: 6 },
  pill: { paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillOnDark: { backgroundColor: colors.ink, borderColor: colors.ink },
  pillText: { fontSize: 12.5, color: colors.textMid },
  filterBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  filterBadge: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filterBadgeText: { fontSize: 10, color: '#fff' },

  best: { borderRadius: 22, padding: 18, marginTop: 16 },
  bestHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bestEyebrow: { fontSize: 10.5, letterSpacing: 0.4, color: 'rgba(255,255,255,0.75)' },
  bestName: { fontSize: 18, color: '#fff', marginTop: 1 },
  saves: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, paddingVertical: 5, paddingHorizontal: 10, marginTop: 12 },
  savesText: { fontSize: 11.5, color: '#fff' },
  bestStats: { flexDirection: 'row', gap: 8, marginTop: 14 },
  bestStat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingVertical: 9, paddingHorizontal: 10 },
  bestStatK: { fontSize: 9.5, letterSpacing: 0.4, color: 'rgba(255,255,255,0.7)' },
  bestStatV: { fontSize: 15, color: '#fff', marginTop: 2 },
  bestFoot: { fontSize: 11.5, color: 'rgba(255,255,255,0.72)', marginTop: 12 },

  note: { backgroundColor: colors.chip, borderRadius: 14, padding: 14, marginTop: 16 },
  noteText: { fontSize: 13, color: colors.textMid },
  noMatch: { alignItems: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, borderRadius: 16, padding: 24, marginTop: 14 },
  link: { fontSize: 13, color: colors.primary, textDecorationLine: 'underline' },
  hidden: { fontSize: 12, color: colors.textSoft },

  card: { backgroundColor: colors.surface, borderRadius: 20, borderWidth: 2, borderColor: colors.line, padding: 14 },
  cardSel: { borderColor: colors.primary, shadowColor: '#0A3F41', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  markImg: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line },
  cardName: { fontSize: 15, color: colors.text },
  cardSub: { fontSize: 12, color: colors.textSoft, marginTop: 1 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: { borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8 },
  onApprovalText: { fontSize: 12.5, color: colors.textSoft, marginTop: 10, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  stat: { width: '48.5%', backgroundColor: colors.chip, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 },
  statWin: { backgroundColor: '#E4F6EE' },
  statK: { fontSize: 9.5, letterSpacing: 0.3, color: colors.textSoft },
  statV: { fontSize: 14, color: colors.text, marginTop: 2 },
  costRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.chip, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },

  disclaimer: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 8 },
  disclaimerText: { flex: 1, fontSize: 11.5, color: colors.textSoft, lineHeight: 16 },

  footer: { gap: 8 },
  footerLine: { fontSize: 12.5, color: colors.textSoft, textAlign: 'center' },

  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 16, maxHeight: '86%' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  sheetLabel: { fontSize: 11, letterSpacing: 0.6, color: colors.muted, marginBottom: 10 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12 },
  optionOn: { borderColor: colors.primary, backgroundColor: '#E1F3F3' },
  optRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  optDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
