'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Award, Check, Info, SlidersHorizontal, TrendingDown, X } from 'lucide-react';
import { ApplyShell } from '@/components/apply/ApplyShell';
import { Slider } from '@/components/ui/slider';
import { fmtINR } from '@/lib/core';
import { useApply } from '@/lib/applyContext';
import { useAccountUser } from '@/hooks/useAccountUser';
import { useApplyToOffer } from '@/hooks/useApplyToOffer';
import { getApplication, type Offer } from '@/lib/applyApi';
import {
  compareOffers,
  computeRow,
  defaultTenure,
  RANK_LABELS,
  TENURES,
  type CompareRow,
  type RankBy,
} from '@/lib/compareOffers';

const RANKS: RankBy[] = ['cost', 'emi', 'rate', 'interest'];
const RANK_HINT: Record<RankBy, string> = {
  cost: 'Interest + fees per ₹1 lakh — the fairest overall measure',
  emi: 'Smallest monthly payment',
  rate: 'Lowest annual interest rate',
  interest: 'Least interest paid over the loan',
  fee: 'Smallest processing fee + GST',
  approval: 'Fastest typical approval decision',
};

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
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load your offers.'));
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
    <ApplyShell backHref="/apply/offers" backLabel="Back to offers" stepLabel="Compare offers" accountUser={accountUser} wide>
      {children}
    </ApplyShell>
  );

  if (loadError) return shell(<p className="text-danger py-10 text-center text-sm font-semibold">{loadError}</p>);
  if (!offers) return shell(<p className="text-muted-foreground py-10 text-center text-sm">Loading your offers…</p>);
  if (offers.length === 0) {
    return shell(
      <div className="py-10 text-center">
        <h1 className="text-xl font-extrabold">No offers to compare</h1>
        <button onClick={() => router.push('/apply/offers')} className="text-primary mt-3 text-sm font-bold underline">
          Back to offers
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
        <h1 className="text-2xl font-extrabold">Compare your offers</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          We&apos;ve worked out the EMI, interest and total cost of each offer for you — choose what matters most.
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-[272px_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* Desktop filters */}
        <aside className="border-border bg-card sticky top-4 hidden rounded-2xl border p-5 shadow-[var(--shadow-soft)] lg:block">{filterPanel}</aside>

        {/* Phones / tablets: quick controls + filter sheet */}
        <div className="mb-4 flex flex-col gap-3 lg:hidden">
          <ChipRow>
            {TENURES.map((t) => (
              <Chip key={t} on={filters.tenure === t} onClick={() => set({ tenure: t })}>
                {t} mo
              </Chip>
            ))}
          </ChipRow>
          <div className="flex items-center gap-2">
            <ChipRow className="flex-1">
              {RANKS.map((k) => (
                <Chip key={k} on={filters.rankBy === k} onClick={() => set({ rankBy: k })} dark>
                  {RANK_LABELS[k]}
                </Chip>
              ))}
            </ChipRow>
            <button
              onClick={() => setSheetOpen(true)}
              className="border-border bg-card relative grid h-10 w-10 shrink-0 place-items-center rounded-full border"
              aria-label="More filters"
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
            <BestCard row={result.best} rankBy={filters.rankBy} saves={result.bestSavesVsWorst} />
          ) : (
            <div className="bg-muted text-muted-foreground rounded-2xl p-4 text-sm">
              {result.rows.length ? 'These lenders confirm their rate only after approval, so we can’t rank them yet.' : null}
            </div>
          )}

          {result.rows.length === 0 ? (
            <div className="border-border rounded-2xl border border-dashed p-8 text-center">
              <p className="text-sm font-bold">No offers match these filters</p>
              <button onClick={resetFilters} className="text-primary mt-2 text-sm font-bold underline">
                Clear filters
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
              {result.hiddenCount} offer{result.hiddenCount > 1 ? 's' : ''} hidden by your filters ·{' '}
              <button onClick={resetFilters} className="text-primary font-semibold underline">
                show all
              </button>
            </p>
          )}

          <p className="text-muted-foreground flex items-start gap-2 text-xs">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Figures are indicative — calculated by SwiftLoan from each lender&apos;s rate and fees for the tenure you choose. The
            lender confirms final terms before disbursal.
          </p>

          {applyError && <p className="text-danger text-sm font-semibold">{applyError}</p>}

          {/* Desktop apply bar */}
          {selectedRow && selectedOffer && (
            <div className="hidden items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] lg:flex">
              <SelectionSummary row={selectedRow} bestId={result.best?.id ?? null} />
              <ApplyButton offer={selectedOffer} row={selectedRow} applyingId={applyingId} onApply={apply} />
            </div>
          )}
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
        <div className="fixed inset-0 z-[10002] lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="animate-in fade-in absolute inset-0 bg-black/40" onClick={() => setSheetOpen(false)} />
          <div className="animate-in slide-in-from-bottom bg-card absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl p-5 pb-8 shadow-[var(--shadow-float)] duration-200">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-extrabold">Filters</p>
              <button onClick={() => setSheetOpen(false)} className="bg-muted grid h-9 w-9 place-items-center rounded-full" aria-label="Close filters">
                <X className="h-4 w-4" />
              </button>
            </div>
            {filterPanel}
            <button onClick={() => setSheetOpen(false)} className="bg-brand-gradient text-primary-foreground mt-5 w-full rounded-full py-3.5 text-sm font-bold">
              Show {result.rows.length} offer{result.rows.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}
    </div>,
  );
}

// ── Filters ────────────────────────────────────────────────────────────────

function FilterPanel({
  filters,
  set,
  emiRange,
  amountOptions,
  activeFilterCount,
  onReset,
}: {
  filters: Filters;
  set: (p: Partial<Filters>) => void;
  emiRange: { lo: number; hi: number } | null;
  amountOptions: number[];
  activeFilterCount: number;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Section title="Tenure">
        <div className="grid grid-cols-5 gap-1.5">
          {TENURES.map((t) => (
            <button
              key={t}
              onClick={() => set({ tenure: t })}
              className={`rounded-lg py-2 text-xs font-bold transition-colors ${
                filters.tenure === t ? 'bg-primary text-white shadow-[var(--shadow-soft)]' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {t}
              <span className="block text-[9px] font-semibold opacity-80">mo</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Best offer by">
        <div className="flex flex-col gap-1.5">
          {RANKS.map((k) => {
            const on = filters.rankBy === k;
            return (
              <button
                key={k}
                onClick={() => set({ rankBy: k })}
                className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  on ? 'border-primary bg-accent' : 'border-border hover:bg-muted/60'
                }`}
              >
                <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-primary' : 'border-border'}`}>
                  {on && <span className="bg-primary h-2 w-2 rounded-full" />}
                </span>
                <span>
                  <span className="block text-sm font-bold">{RANK_LABELS[k]}</span>
                  <span className="text-muted-foreground block text-[11px] leading-snug">{RANK_HINT[k]}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {emiRange && (
        <Section title="Monthly EMI budget" right={filters.maxEmi != null ? `Up to ${fmtINR(filters.maxEmi)}` : 'Any'}>
          <Slider
            min={emiRange.lo}
            max={emiRange.hi}
            step={500}
            value={[filters.maxEmi ?? emiRange.hi]}
            onValueChange={([v]) => v != null && set({ maxEmi: v >= emiRange.hi ? null : v })}
          />
          <div className="text-muted-foreground mt-2 flex justify-between text-[11px] font-semibold">
            <span>{fmtINR(emiRange.lo)}</span>
            <span>{fmtINR(emiRange.hi)}</span>
          </div>
        </Section>
      )}

      {amountOptions.length > 1 && (
        <Section title="Loan amount">
          <div className="flex flex-wrap gap-1.5">
            <SmallChip on={filters.minAmount == null} onClick={() => set({ minAmount: null })}>
              Any
            </SmallChip>
            {amountOptions.slice(1).map((a) => (
              <SmallChip key={a} on={filters.minAmount === a} onClick={() => set({ minAmount: a })}>
                {fmtINR(a)}+
              </SmallChip>
            ))}
          </div>
        </Section>
      )}

      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span>
          <span className="block text-sm font-bold">Include “rate on approval”</span>
          <span className="text-muted-foreground block text-[11px]">Lenders who confirm the rate later</span>
        </span>
        <input
          type="checkbox"
          checked={filters.includeOnApproval}
          onChange={(e) => set({ includeOnApproval: e.target.checked })}
          className="accent-primary h-5 w-5 shrink-0"
        />
      </label>

      {activeFilterCount > 0 && (
        <button onClick={onReset} className="text-primary self-start text-sm font-bold underline">
          Reset filters
        </button>
      )}
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">{title}</p>
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

function BestCard({ row, rankBy, saves }: { row: CompareRow; rankBy: RankBy; saves: number | null }) {
  return (
    <div className="bg-deep-gradient relative overflow-hidden rounded-2xl p-5 text-white shadow-[var(--shadow-float)]">
      <div className="absolute -top-10 -right-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" aria-hidden />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <LenderMark row={row} light />
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-white/75 uppercase">
              <Award className="h-3.5 w-3.5" /> Best for you · {RANK_LABELS[rankBy].toLowerCase()}
            </p>
            <p className="text-lg font-extrabold">{row.lenderName}</p>
          </div>
        </div>
        {saves != null && saves > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">
            <TrendingDown className="h-3.5 w-3.5" /> Saves {fmtINR(saves)} vs the costliest
          </span>
        )}
      </div>
      <div className="relative mt-4 grid grid-cols-3 gap-2">
        <BigStat k="Monthly EMI" v={fmtINR(row.emi)} />
        <BigStat k="Interest" v={`${row.rate}% p.a.`} />
        <BigStat k="Total cost" v={fmtINR(row.costOfBorrowing)} />
      </div>
      <p className="relative mt-3 text-xs text-white/70">
        {fmtINR(row.amount)} over {row.tenure} months · you repay {fmtINR(row.totalRepay)} in total
      </p>
    </div>
  );
}

function BigStat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-white/12 px-3 py-2.5">
      <p className="text-[10px] font-bold tracking-wide text-white/70 uppercase">{k}</p>
      <p className="mt-0.5 text-sm font-extrabold sm:text-base">{v}</p>
    </div>
  );
}

function LenderMark({ row, light }: { row: CompareRow; light?: boolean }) {
  if (row.logoUrl) {
    return (
      <img src={row.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl border border-white/20 bg-white object-contain p-1" />
    );
  }
  return (
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-extrabold ${light ? 'bg-white/15 text-white' : 'bg-accent text-primary'}`}>
      {row.lenderName.slice(0, 2).toUpperCase()}
    </span>
  );
}

type Winners = { emi: string | null; rate: string | null; interest: string | null; cost: string | null };

const METRICS: { key: string; label: string; win?: keyof Winners; tag?: string; value: (r: CompareRow) => string; sub?: (r: CompareRow) => string }[] = [
  { key: 'emi', label: 'Monthly EMI', win: 'emi', tag: 'Lowest EMI', value: (r) => fmtINR(r.emi) },
  { key: 'rate', label: 'Interest rate', win: 'rate', tag: 'Lowest rate', value: (r) => `${r.rate}% p.a.` },
  { key: 'amount', label: 'Eligible amount', value: (r) => fmtINR(r.amount) },
  { key: 'interest', label: 'Total interest', win: 'interest', tag: 'Least interest', value: (r) => fmtINR(r.totalInterest) },
  { key: 'fees', label: 'Processing fee + GST', value: (r) => fmtINR(r.fees) },
  { key: 'cost', label: 'Total cost of loan', win: 'cost', tag: 'Cheapest', value: (r) => fmtINR(r.costOfBorrowing), sub: (r) => `${fmtINR(r.costPerLakh)} per ₹1L` },
  { key: 'repay', label: 'Total you repay', value: (r) => fmtINR(r.totalRepay) },
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
                        {r.id === bestId && <MiniBadge tone="best">Best for you</MiniBadge>}
                        {r.onApproval && <MiniBadge tone="amber">Rate on approval</MiniBadge>}
                        {sel ? (
                          <MiniBadge tone="sel">
                            <Check className="h-3 w-3" /> Selected
                          </MiniBadge>
                        ) : (
                          <span className="text-primary text-[11px] font-bold">Select</span>
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
                <td className="text-muted-foreground bg-card sticky left-0 z-10 p-3 text-xs font-bold">{m.label}</td>
                {rows.map((r) => {
                  const sel = r.id === selectedId;
                  const priced = !r.onApproval || m.key === 'amount';
                  const win = m.win && winners[m.win] === r.id && rows.filter((x) => !x.onApproval).length > 1;
                  return (
                    <td key={r.id} className={`p-3 text-center ${sel ? 'bg-accent/60' : ''}`}>
                      {priced ? (
                        <div className={`inline-flex flex-col items-center rounded-lg px-2 py-1 ${win ? 'bg-success-soft text-success' : ''}`}>
                          <span className="font-extrabold">{m.value(r)}</span>
                          {m.sub && <span className="text-muted-foreground text-[10px] font-semibold">{m.sub(r)}</span>}
                          {win && <span className="text-[10px] font-bold">{m.tag}</span>}
                        </div>
                      ) : (
                        <span className="text-warning text-xs font-bold">On approval</span>
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
  const tags = (['cost', 'emi', 'rate', 'interest'] as const)
    .filter((k) => winners[k] === row.id)
    .map((k) => ({ cost: 'Cheapest', emi: 'Lowest EMI', rate: 'Lowest rate', interest: 'Least interest' })[k]);
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
          <p className="text-muted-foreground text-xs">{fmtINR(row.amount)} eligible</p>
        </div>
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${selected ? 'border-primary bg-primary text-white' : 'border-border'}`}>
          {selected && <Check className="h-3.5 w-3.5" />}
        </span>
      </div>

      {(isBest || row.onApproval || tags.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {isBest && <MiniBadge tone="best">Best for you</MiniBadge>}
          {row.onApproval && <MiniBadge tone="amber">Rate on approval</MiniBadge>}
          {tags.filter((t) => !(isBest && t === 'Cheapest')).map((t) => (
            <MiniBadge key={t} tone="soft">
              {t}
            </MiniBadge>
          ))}
        </div>
      )}

      {row.onApproval ? (
        <p className="text-muted-foreground mt-3 text-xs">This lender confirms the interest rate after approval, so EMI and costs can’t be worked out yet.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat k="Monthly EMI" v={fmtINR(row.emi)} win={winners.emi === row.id} />
          <Stat k="Interest rate" v={`${row.rate}% p.a.`} win={winners.rate === row.id} />
          <Stat k="Total interest" v={fmtINR(row.totalInterest)} win={winners.interest === row.id} />
          <Stat k="Fee + GST" v={fmtINR(row.fees)} />
          <div className="bg-muted col-span-2 flex items-center justify-between rounded-xl px-3 py-2.5">
            <span className="text-muted-foreground text-[11px] font-bold uppercase">Total cost of loan</span>
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
  if (inline) {
    return (
      <p className="min-w-0 truncate text-xs sm:flex-1">
        <span className="text-primary font-bold">{row.id === bestId ? 'Best for you' : 'Your choice'}</span>
        <span className="text-foreground font-extrabold"> · {row.lenderName}</span>
        {!row.onApproval && <span className="text-muted-foreground font-semibold"> · {fmtINR(row.emi)}/mo</span>}
      </p>
    );
  }
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground truncate text-[11px] font-bold uppercase">
        {row.id === bestId ? 'Best for you' : 'Your choice'}
      </p>
      <p className="truncate text-sm font-extrabold">
        {row.lenderName}
        {!row.onApproval && (
          <span className="text-muted-foreground font-semibold">
            {' '}
            · {fmtINR(row.emi)}/mo for {row.tenure} months
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
}: {
  offer: Offer;
  row: CompareRow;
  applyingId: string | null;
  onApply: (o: Offer) => void;
  /** Full width (phones). */
  block?: boolean;
}) {
  const busy = applyingId === offer.id;
  return (
    <button
      onClick={() => onApply(offer)}
      disabled={!!applyingId}
      className={`bg-brand-gradient text-primary-foreground inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-6 py-3 text-sm font-bold whitespace-nowrap shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5 disabled:opacity-60 ${
        block ? 'w-full sm:w-auto sm:max-w-xs' : 'max-w-xs'
      }`}
    >
      {busy ? 'Applying…' : (
        <>
          <span className="truncate">Apply with {row.lenderName}</span>
          <span aria-hidden>→</span>
        </>
      )}
    </button>
  );
}
