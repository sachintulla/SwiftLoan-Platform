'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Award, CalendarClock, Check, Info, PiggyBank, Percent, Receipt, SlidersHorizontal, TrendingDown, Wallet, X, Zap, type LucideIcon } from 'lucide-react';
import { ApplyShell } from '@/components/apply/ApplyShell';
import { Slider } from '@/components/ui/slider';
import { fmtINR } from '@/lib/core';
import { useApply } from '@/lib/applyContext';
import { useAccountUser } from '@/hooks/useAccountUser';
import { useApplyToOffer } from '@/hooks/useApplyToOffer';
import { getApplication, type Offer } from '@/lib/applyApi';
import { useCopy } from '@/lib/i18n';
import { applyCompareCopy, COMPARE_LOAD_FALLBACK } from '@/i18n/apply-compare';
import {
  compareOffers,
  computeRow,
  defaultTenure,
  TENURES,
  type CompareRow,
  type RankBy,
} from '@/lib/compareOffers';

const RANKS: RankBy[] = ['cost', 'emi', 'rate', 'interest'];

type CompareCopy = (typeof applyCompareCopy)['en'];

interface Filters {
  tenure: number;
  rankBy: RankBy;
  maxEmi: number | null;
  minAmount: number | null;
  includeOnApproval: boolean;
}

/**
 * Compare offers — every offer on the application side by side, with EMI,
 * interest and total cost computed by us (lenders only send amount, rate and
 * fee; see lib/compareOffers.ts). The user picks what "best" means (rank by),
 * the tenure, and optional budget / amount filters; we recommend the winner
 * but they can select and apply to any offer.
 *
 * Desktop: filter panel on the left, recommendation + comparison table on the
 * right. Phones: quick tenure / rank chips + a filter sheet, ranked cards.
 */
export default function CompareOffersPage() {
  const t = useCopy(applyCompareCopy);
  const router = useRouter();
  const { applicationId, sessionReady } = useApply();
  const accountUser = useAccountUser();
  const { apply, applyingId, error: applyError } = useApplyToOffer();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ tenure: 24, rankBy: 'cost', maxEmi: null, minAmount: null, includeOnApproval: true });
  const [picked, setPicked] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!sessionReady) return;
    if (!applicationId) {
      router.replace('/apply/offers');
      return;
    }
    getApplication(applicationId)
      .then((app) => {
        const list = (app.offers ?? []).filter((o) => !o.applied);
        setOffers(list);
        const first = list.find((o) => o.apr > 0);
        setFilters((f) => ({ ...f, tenure: defaultTenure(first?.tenureMonths) }));
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : COMPARE_LOAD_FALLBACK));
  }, [sessionReady, applicationId, router]);

  const inputs = useMemo(
    () =>
      (offers ?? []).map((o) => ({
        id: o.id,
        lenderName: o.lenderName ?? o.partner?.name ?? 'Lender',
        amount: o.amount,
        apr: o.apr,
        processingFeeAmount: o.processingFeeAmount,
        gstOnProcessingFee: o.gstOnProcessingFee,
        logoUrl: o.lenderLogoUrl,
      })),
    [offers],
  );

  const result = useMemo(() => compareOffers(inputs, filters), [inputs, filters]);

  // Bounds for the EMI budget slider at the current tenure (unfiltered).
  const emiRange = useMemo(() => {
    const emis = inputs.map((o) => computeRow(o, filters.tenure).emi).filter((v): v is number => v != null);
    if (!emis.length) return null;
    const lo = Math.floor(Math.min(...emis) / 500) * 500;
    const hi = Math.ceil(Math.max(...emis) / 500) * 500;
    return lo === hi ? null : { lo, hi };
  }, [inputs, filters.tenure]);
  const amountOptions = useMemo(() => [...new Set(inputs.map((o) => o.amount))].sort((a, b) => a - b), [inputs]);

  // Selection: the user's pick if it's still visible, else the recommendation.
  const selectedRow = result.rows.find((r) => r.id === picked) ?? result.best ?? result.rows[0] ?? null;
  const selectedOffer = offers?.find((o) => o.id === selectedRow?.id) ?? null;
  const activeFilterCount = (filters.maxEmi != null ? 1 : 0) + (filters.minAmount != null ? 1 : 0) + (filters.includeOnApproval ? 0 : 1);
  const resetFilters = () => setFilters((f) => ({ ...f, maxEmi: null, minAmount: null, includeOnApproval: true }));
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  const shell = (children: React.ReactNode) => (
    <ApplyShell backHref="/apply/offers" backLabel={t.backToOffers} stepLabel={t.stepLabel} accountUser={accountUser} wide>
      {children}
    </ApplyShell>
  );

  if (loadError) return shell(<p className="text-danger py-10 text-center text-sm font-semibold">{loadError === COMPARE_LOAD_FALLBACK ? t.loadFailed : loadError}</p>);
  if (!offers) return shell(<p className="text-muted-foreground py-10 text-center text-sm" aria-busy="true">{t.loading}</p>);
  if (offers.length === 0) {
    return shell(
      <div className="py-10 text-center">
        <h1 className="text-xl font-extrabold">{t.noOffersTitle}</h1>
        <button onClick={() => router.push('/apply/offers')} className="text-primary mt-3 text-sm font-bold underline">
          {t.backToOffers}
        </button>
      </div>,
    );
  }

  const filterPanel = (
    <FilterPanel
      filters={filters}
      set={set}
      emiRange={emiRange}
      amountOptions={amountOptions}
      activeFilterCount={activeFilterCount}
      onReset={resetFilters}
    />
  );

  return shell(
    <div className="pb-28 lg:pb-8">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold">{t.heading}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t.subtitle}</p>
      </div>

      <div className="lg:grid lg:grid-cols-[272px_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* Desktop filters */}
        <aside className="border-border bg-card sticky top-4 hidden rounded-2xl border p-5 shadow-[var(--shadow-soft)] lg:block">
          <FilterPanel
            filters={filters}
            set={set}
            emiRange={emiRange}
            amountOptions={amountOptions}
            activeFilterCount={activeFilterCount}
            onReset={resetFilters}
            showHeader
          />
        </aside>

        {/* Phones / tablets: quick controls + filter sheet */}
        <div className="mb-4 flex flex-col gap-3 lg:hidden">
          <ChipRow>
            {TENURES.map((n) => (
              <Chip key={n} on={filters.tenure === n} onClick={() => set({ tenure: n })}>
                {t.tenureChip(n)}
              </Chip>
            ))}
          </ChipRow>
          <div className="flex items-center gap-2">
            <ChipRow className="flex-1">
              {RANKS.map((k) => (
                <Chip key={k} on={filters.rankBy === k} onClick={() => set({ rankBy: k })} dark>
                  {t.rankLabels[k]}
                </Chip>
              ))}
            </ChipRow>
            <button
              onClick={() => setSheetOpen(true)}
              className="border-border bg-card relative grid h-10 w-10 shrink-0 place-items-center rounded-full border"
              aria-label={t.moreFilters}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {activeFilterCount > 0 && (
                <span className="bg-primary absolute -top-1 -right-1 grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {result.best ? (
            <BestCard
              // Shows the currently selected lender (the best one until the
              // visitor picks another in the table) so the header and the
              // Apply button beside it always refer to the same offer.
              row={selectedRow ?? result.best}
              isBest={(selectedRow ?? result.best).id === result.best.id}
              rankBy={filters.rankBy}
              saves={result.bestSavesVsWorst}
              action={
                selectedRow && selectedOffer ? (
                  <ApplyButton offer={selectedOffer} row={selectedRow} applyingId={applyingId} onApply={apply} compact />
                ) : null
              }
            />
          ) : (
            <div className="bg-muted text-muted-foreground rounded-2xl p-4 text-sm">
              {result.rows.length ? t.rankOnApprovalNote : null}
            </div>
          )}

          {result.rows.length === 0 ? (
            <div className="border-border rounded-2xl border border-dashed p-8 text-center">
              <p className="text-sm font-bold">{t.noMatch}</p>
              <button onClick={resetFilters} className="text-primary mt-2 text-sm font-bold underline">
                {t.clearFilters}
              </button>
            </div>
          ) : (
            <>
              {/* Desktop / tablet: side-by-side table */}
              <CompareTable
                rows={result.rows}
                winners={result.winners}
                bestId={result.best?.id ?? null}
                selectedId={selectedRow?.id ?? null}
                onSelect={setPicked}
              />
              {/* Phones: ranked cards */}
              <div className="flex flex-col gap-3 md:hidden">
                {result.rows.map((r, i) => (
                  <OfferCard
                    key={r.id}
                    row={r}
                    rank={r.onApproval ? null : i + 1}
                    winners={result.winners}
                    isBest={r.id === result.best?.id}
                    selected={r.id === selectedRow?.id}
                    onSelect={() => setPicked(r.id)}
                  />
                ))}
              </div>
            </>
          )}

          {result.hiddenCount > 0 && (
            <p className="text-muted-foreground text-xs">
              {t.hidden(result.hiddenCount)}{' '}
              <button onClick={resetFilters} className="text-primary font-semibold underline">
                {t.showAll}
              </button>
            </p>
          )}

          <p className="text-muted-foreground flex items-start gap-2 text-xs">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t.disclaimer}
          </p>

          {applyError && <p className="text-danger text-sm font-semibold">{applyError}</p>}
        </div>
      </div>

      {/* Phones / tablets: sticky apply bar */}
      {selectedRow && selectedOffer && (
        <div className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t px-4 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
          {/* Stacked on phones: one summary line, then a full-width button —
              side by side, both the name and the button label got truncated. */}
          <div className="mx-auto flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <SelectionSummary row={selectedRow} bestId={result.best?.id ?? null} inline />
            <ApplyButton offer={selectedOffer} row={selectedRow} applyingId={applyingId} onApply={apply} block />
          </div>
        </div>
      )}

      {sheetOpen && (
        <div className="fixed inset-0 z-[10002] lg:hidden" role="dialog" aria-modal="true" aria-label={t.filters}>
          <div className="animate-in fade-in absolute inset-0 bg-black/40" onClick={() => setSheetOpen(false)} />
          <div className="animate-in slide-in-from-bottom bg-card absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl p-5 pb-8 shadow-[var(--shadow-float)] duration-200">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-extrabold">{t.filters}</p>
              <button onClick={() => setSheetOpen(false)} className="bg-muted grid h-9 w-9 place-items-center rounded-full" aria-label={t.closeFilters}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {filterPanel}
            <button onClick={() => setSheetOpen(false)} className="bg-brand-gradient text-primary-foreground mt-5 w-full rounded-full py-3.5 text-sm font-bold">
              {t.showOffers(result.rows.length)}
            </button>
          </div>
        </div>
      )}
    </div>,
  );
}

// ── Filters ────────────────────────────────────────────────────────────────

const RANK_ICONS: Partial<Record<RankBy, LucideIcon>> = {
  cost: Wallet,
  emi: CalendarClock,
  rate: Percent,
  interest: PiggyBank,
  fee: Receipt,
  approval: Zap,
};

function FilterPanel({
  filters,
  set,
  emiRange,
  amountOptions,
  activeFilterCount,
  onReset,
  showHeader,
}: {
  filters: Filters;
  set: (p: Partial<Filters>) => void;
  emiRange: { lo: number; hi: number } | null;
  amountOptions: number[];
  activeFilterCount: number;
  onReset: () => void;
  /** Desktop sidebar only — the phone sheet already has its own "Filters" title. */
  showHeader?: boolean;
}) {
  const t = useCopy(applyCompareCopy);
  return (
    <div className="flex flex-col">
      {showHeader && (
        <div className="border-border mb-5 flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-2.5">
            <span className="bg-accent text-primary grid h-8 w-8 place-items-center rounded-lg">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm leading-tight font-extrabold">{t.filters}</p>
              <p className="text-muted-foreground text-[11px]">
                {activeFilterCount > 0 ? t.filterPanel.applied(activeFilterCount) : t.filterPanel.fineTune}
              </p>
            </div>
          </div>
          {activeFilterCount > 0 && (
            <button onClick={onReset} className="text-primary hover:bg-accent rounded-full px-2.5 py-1 text-xs font-bold transition-colors">
              {t.filterPanel.reset}
            </button>
          )}
        </div>
      )}

      <div className="divide-border flex flex-col gap-5 [&>*:not(:first-child)]:border-t [&>*:not(:first-child)]:border-border [&>*:not(:first-child)]:pt-5">
        <Section title={t.filterPanel.tenure} right={t.filterPanel.months(filters.tenure)}>
          <div role="radiogroup" aria-label={t.filterPanel.tenure} className="bg-muted grid grid-cols-5 gap-1 rounded-xl p-1">
            {TENURES.map((n) => {
              const on = filters.tenure === n;
              return (
                <button
                  key={n}
                  role="radio"
                  aria-checked={on}
                  onClick={() => set({ tenure: n })}
                  className={`rounded-lg py-2 text-xs font-extrabold transition-all ${
                    on ? 'bg-card text-primary shadow-[var(--shadow-soft)]' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <p className="text-muted-foreground mt-1.5 text-center text-[10px] font-semibold">{t.filterPanel.monthsUnit}</p>
        </Section>

        <Section title={t.filterPanel.bestBy}>
          <div role="radiogroup" aria-label={t.filterPanel.bestBy} className="flex flex-col gap-1">
            {RANKS.map((k) => {
              const on = filters.rankBy === k;
              const Icon = RANK_ICONS[k] ?? Award;
              return (
                <button
                  key={k}
                  role="radio"
                  aria-checked={on}
                  onClick={() => set({ rankBy: k })}
                  className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${
                    on ? 'bg-accent' : 'hover:bg-muted/70'
                  }`}
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors ${
                      on ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13px] leading-tight font-bold ${on ? 'text-foreground' : 'text-foreground/80'}`}>{t.rankLabels[k]}</span>
                    {on && <span className="text-muted-foreground mt-0.5 block text-[11px] leading-snug">{t.rankHints[k]}</span>}
                  </span>
                  {on && <Check className="text-primary h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </Section>

        {emiRange && (
          <Section title={t.filterPanel.emiBudget} right={filters.maxEmi != null ? t.filterPanel.upTo(fmtINR(filters.maxEmi)) : t.filterPanel.any}>
            <Slider
              aria-label={t.filterPanel.emiBudget}
              min={emiRange.lo}
              max={emiRange.hi}
              step={500}
              value={[filters.maxEmi ?? emiRange.hi]}
              onValueChange={([v]) => v != null && set({ maxEmi: v >= emiRange.hi ? null : v })}
            />
            <div className="text-muted-foreground mt-2.5 flex justify-between text-[11px] font-semibold">
              <span>{fmtINR(emiRange.lo)}</span>
              <span>{fmtINR(emiRange.hi)}</span>
            </div>
          </Section>
        )}

        {amountOptions.length > 1 && (
          <Section title={t.filterPanel.minAmount}>
            <div className="flex flex-wrap gap-1.5">
              <SmallChip on={filters.minAmount == null} onClick={() => set({ minAmount: null })}>
                {t.filterPanel.any}
              </SmallChip>
              {amountOptions.slice(1).map((a) => (
                <SmallChip key={a} on={filters.minAmount === a} onClick={() => set({ minAmount: a })}>
                  {fmtINR(a)}+
                </SmallChip>
              ))}
            </div>
          </Section>
        )}

        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-[13px] font-bold">{t.filterPanel.includeOnApproval}</span>
            <span className="text-muted-foreground block text-[11px]">{t.filterPanel.includeOnApprovalHint}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={filters.includeOnApproval}
            aria-label={t.filterPanel.includeOnApprovalAria}
            onClick={() => set({ includeOnApproval: !filters.includeOnApproval })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${filters.includeOnApproval ? 'bg-primary' : 'bg-border'}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${filters.includeOnApproval ? 'translate-x-5' : ''}`}
            />
          </button>
        </div>

        {!showHeader && activeFilterCount > 0 && (
          <button onClick={onReset} className="text-primary self-start text-sm font-bold underline">
            {t.filterPanel.resetFilters}
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-foreground text-xs font-extrabold tracking-wide uppercase">{title}</p>
        {right && <p className="text-primary text-xs font-bold">{right}</p>}
      </div>
      {children}
    </div>
  );
}

function ChipRow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 ${className}`}>{children}</div>;
}

function Chip({ on, onClick, children, dark }: { on: boolean; onClick: () => void; children: React.ReactNode; dark?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-colors ${
        on ? (dark ? 'border-foreground bg-foreground text-background' : 'border-primary bg-primary text-white') : 'border-border bg-card text-muted-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function SmallChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-bold ${on ? 'border-primary bg-accent text-primary' : 'border-border text-muted-foreground'}`}
    >
      {children}
    </button>
  );
}

// ── Results ────────────────────────────────────────────────────────────────

function BestCard({
  row,
  isBest,
  rankBy,
  saves,
  action,
}: {
  row: CompareRow;
  isBest: boolean;
  rankBy: RankBy;
  saves: number | null;
  /** Apply button — desktop only; phones/tablets keep the sticky bottom bar. */
  action?: React.ReactNode;
}) {
  const t = useCopy(applyCompareCopy);
  return (
    // Light mint card (not the dark green) so the gradient Apply button in the
    // corner stands out instead of blending into the background.
    <div
      className="border-primary/20 relative overflow-hidden rounded-2xl border p-5 shadow-[var(--shadow-soft)]"
      style={{ background: 'linear-gradient(135deg, #e8f8f3 0%, #ffffff 55%, #ddf2ec 100%)' }}
    >
      <div className="bg-primary/10 absolute -top-12 -right-12 h-40 w-40 rounded-full blur-3xl" aria-hidden />
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <LenderMark row={row} />
          <div>
            <p className="text-primary flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase">
              <Award className="h-3.5 w-3.5" /> {isBest ? t.best.bestForRank(t.rankLabels[rankBy].toLowerCase()) : t.best.yourChoice}
            </p>
            <p className="text-foreground text-lg font-extrabold">{row.lenderName}</p>
          </div>
        </div>
        {action && <div className="hidden max-w-[60%] min-w-0 shrink-0 lg:flex">{action}</div>}
      </div>
      <div className="relative mt-4 grid grid-cols-3 gap-2">
        <BigStat k={t.best.monthlyEmi} v={fmtINR(row.emi)} />
        <BigStat k={t.best.interest} v={t.best.perYear(row.rate)} />
        <BigStat k={t.best.totalCost} v={fmtINR(row.costOfBorrowing)} />
      </div>
      <div className="relative mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-muted-foreground text-xs">
          {t.best.summary(fmtINR(row.amount), row.tenure, fmtINR(row.totalRepay))}
        </p>
        {isBest && saves != null && saves > 0 && (
          <span className="bg-success-soft text-success inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold">
            <TrendingDown className="h-3.5 w-3.5" /> {t.best.saves(fmtINR(saves))}
          </span>
        )}
      </div>
    </div>
  );
}

function BigStat({ k, v }: { k: string; v: string }) {
  return (
    <div className="border-border rounded-xl border bg-white/80 px-3 py-2.5">
      <p className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">{k}</p>
      <p className="text-foreground mt-0.5 text-sm font-extrabold sm:text-base">{v}</p>
    </div>
  );
}

function LenderMark({ row, light }: { row: CompareRow; light?: boolean }) {
  if (row.logoUrl) {
    return (
      <img src={row.logoUrl} alt="" className="border-border h-10 w-10 shrink-0 rounded-xl border bg-white object-contain p-1" />
    );
  }
  return (
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-extrabold ${light ? 'bg-white/15 text-white' : 'bg-accent text-primary'}`}>
      {row.lenderName.slice(0, 2).toUpperCase()}
    </span>
  );
}

type Winners = { emi: string | null; rate: string | null; interest: string | null; cost: string | null };

const METRICS: {
  key: keyof CompareCopy['table']['metrics'];
  win?: keyof Winners;
  value: (r: CompareRow, t: CompareCopy) => string;
  sub?: (r: CompareRow, t: CompareCopy) => string;
}[] = [
  { key: 'emi', win: 'emi', value: (r) => fmtINR(r.emi) },
  { key: 'rate', win: 'rate', value: (r, t) => t.best.perYear(r.rate) },
  { key: 'amount', value: (r) => fmtINR(r.amount) },
  { key: 'interest', win: 'interest', value: (r) => fmtINR(r.totalInterest) },
  { key: 'fees', value: (r) => fmtINR(r.fees) },
  { key: 'cost', win: 'cost', value: (r) => fmtINR(r.costOfBorrowing), sub: (r, t) => t.table.perLakh(fmtINR(r.costPerLakh)) },
  { key: 'repay', value: (r) => fmtINR(r.totalRepay) },
];

function CompareTable({
  rows,
  winners,
  bestId,
  selectedId,
  onSelect,
}: {
  rows: CompareRow[];
  winners: Winners;
  bestId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useCopy(applyCompareCopy);
  return (
    <div className="border-border bg-card hidden overflow-hidden rounded-2xl border shadow-[var(--shadow-soft)] md:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="bg-card sticky left-0 z-10 w-40 p-3" />
              {rows.map((r) => {
                const sel = r.id === selectedId;
                return (
                  <th key={r.id} className={`p-3 align-top ${sel ? 'bg-accent' : ''}`}>
                    <button onClick={() => onSelect(r.id)} className="flex w-full flex-col items-center gap-1.5 text-center">
                      <LenderMark row={r} />
                      <span className="text-sm font-extrabold">{r.lenderName}</span>
                      <span className="flex flex-wrap justify-center gap-1">
                        {r.id === bestId && <MiniBadge tone="best">{t.best.bestForYou}</MiniBadge>}
                        {r.onApproval && <MiniBadge tone="amber">{t.table.rateOnApproval}</MiniBadge>}
                        {sel ? (
                          <MiniBadge tone="sel">
                            <Check className="h-3 w-3" /> {t.table.selected}
                          </MiniBadge>
                        ) : (
                          <span className="text-primary text-[11px] font-bold">{t.table.select}</span>
                        )}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => (
              <tr key={m.key} className="border-border border-t">
                <td className="text-muted-foreground bg-card sticky left-0 z-10 p-3 text-xs font-bold">{t.table.metrics[m.key]}</td>
                {rows.map((r) => {
                  const sel = r.id === selectedId;
                  const priced = !r.onApproval || m.key === 'amount';
                  const win = m.win && winners[m.win] === r.id && rows.filter((x) => !x.onApproval).length > 1;
                  return (
                    <td key={r.id} className={`p-3 text-center ${sel ? 'bg-accent/60' : ''}`}>
                      {priced ? (
                        <div className={`inline-flex flex-col items-center rounded-lg px-2 py-1 ${win ? 'bg-success-soft text-success' : ''}`}>
                          <span className="font-extrabold">{m.value(r, t)}</span>
                          {m.sub && <span className="text-muted-foreground text-[10px] font-semibold">{m.sub(r, t)}</span>}
                          {win && m.win &&<span className="text-[10px] font-bold">{t.table.tags[m.win]}</span>}
                        </div>
                      ) : (
                        <span className="text-warning text-xs font-bold">{t.table.onApproval}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OfferCard({
  row,
  rank,
  winners,
  isBest,
  selected,
  onSelect,
}: {
  row: CompareRow;
  rank: number | null;
  winners: Winners;
  isBest: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useCopy(applyCompareCopy);
  const tags = (['cost', 'emi', 'rate', 'interest'] as const).filter((k) => winners[k] === row.id);
  return (
    <button
      onClick={onSelect}
      className={`bg-card w-full rounded-2xl border-2 p-4 text-left transition-colors ${selected ? 'border-primary shadow-[var(--shadow-soft)]' : 'border-border'}`}
    >
      <div className="flex items-center gap-3">
        {rank != null && (
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${isBest ? 'bg-mint text-white' : 'bg-muted text-muted-foreground'}`}>
            {rank}
          </span>
        )}
        <LenderMark row={row} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{row.lenderName}</p>
          <p className="text-muted-foreground text-xs">{t.card.eligible(fmtINR(row.amount))}</p>
        </div>
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${selected ? 'border-primary bg-primary text-white' : 'border-border'}`}>
          {selected && <Check className="h-3.5 w-3.5" />}
        </span>
      </div>

      {(isBest || row.onApproval || tags.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {isBest && <MiniBadge tone="best">{t.best.bestForYou}</MiniBadge>}
          {row.onApproval && <MiniBadge tone="amber">{t.table.rateOnApproval}</MiniBadge>}
          {tags.filter((k) => !(isBest && k === 'cost')).map((k) => (
            <MiniBadge key={k} tone="soft">
              {t.table.tags[k]}
            </MiniBadge>
          ))}
        </div>
      )}

      {row.onApproval ? (
        <p className="text-muted-foreground mt-3 text-xs">{t.card.onApprovalNote}</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat k={t.card.monthlyEmi} v={fmtINR(row.emi)} win={winners.emi === row.id} />
          <Stat k={t.card.interestRate} v={t.best.perYear(row.rate)} win={winners.rate === row.id} />
          <Stat k={t.card.totalInterest} v={fmtINR(row.totalInterest)} win={winners.interest === row.id} />
          <Stat k={t.card.feeGst} v={fmtINR(row.fees)} />
          <div className="bg-muted col-span-2 flex items-center justify-between rounded-xl px-3 py-2.5">
            <span className="text-muted-foreground text-[11px] font-bold uppercase">{t.card.totalCostOfLoan}</span>
            <span className={`text-sm font-extrabold ${winners.cost === row.id ? 'text-success' : ''}`}>{fmtINR(row.costOfBorrowing)}</span>
          </div>
        </div>
      )}
    </button>
  );
}

function Stat({ k, v, win }: { k: string; v: string; win?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${win ? 'bg-success-soft' : 'bg-muted'}`}>
      <p className="text-muted-foreground text-[10px] font-bold uppercase">{k}</p>
      <p className={`mt-0.5 text-sm font-extrabold ${win ? 'text-success' : ''}`}>{v}</p>
    </div>
  );
}

function MiniBadge({ tone, children }: { tone: 'best' | 'amber' | 'sel' | 'soft'; children: React.ReactNode }) {
  const cls = {
    best: 'bg-mint text-white',
    amber: 'bg-warning-soft text-warning',
    sel: 'bg-primary text-white',
    soft: 'bg-success-soft text-success',
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${cls}`}>{children}</span>;
}

function SelectionSummary({ row, bestId, inline }: { row: CompareRow; bestId: string | null; inline?: boolean }) {
  const t = useCopy(applyCompareCopy);
  if (inline) {
    return (
      <p className="min-w-0 truncate text-xs sm:flex-1">
        <span className="text-primary font-bold">{row.id === bestId ? t.best.bestForYou : t.best.yourChoice}</span>
        <span className="text-foreground font-extrabold"> · {row.lenderName}</span>
        {!row.onApproval && <span className="text-muted-foreground font-semibold"> · {t.summary.perMonth(fmtINR(row.emi))}</span>}
      </p>
    );
  }
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground truncate text-[11px] font-bold uppercase">
        {row.id === bestId ? t.best.bestForYou : t.best.yourChoice}
      </p>
      <p className="truncate text-sm font-extrabold">
        {row.lenderName}
        {!row.onApproval && (
          <span className="text-muted-foreground font-semibold">
            {' '}
            · {t.summary.perMonthFor(fmtINR(row.emi), row.tenure)}
          </span>
        )}
      </p>
    </div>
  );
}

function ApplyButton({
  offer,
  row,
  applyingId,
  onApply,
  block,
  compact,
}: {
  offer: Offer;
  row: CompareRow;
  applyingId: string | null;
  onApply: (o: Offer) => void;
  /** Full width (phones). */
  block?: boolean;
  /** Plain "Apply now" — for the best-offer card, which already names the lender beside it. */
  compact?: boolean;
}) {
  const t = useCopy(applyCompareCopy);
  const busy = applyingId === offer.id;
  return (
    <button
      onClick={() => onApply(offer)}
      disabled={!!applyingId}
      data-voice-gate="apply-offer"
      className={`bg-brand-gradient text-primary-foreground inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-6 py-3 text-sm font-bold whitespace-nowrap shadow-[var(--shadow-float)] transition-transform hover:-translate-y-0.5 disabled:opacity-60 ${
        block ? 'w-full sm:w-auto sm:max-w-xs' : 'max-w-sm'
      }`}
    >
      {busy ? t.apply.applying : (
        <>
          <span className="truncate">{compact ? t.apply.applyNow : t.apply.applyWith(row.lenderName)}</span>
          <span aria-hidden>→</span>
        </>
      )}
    </button>
  );
}
