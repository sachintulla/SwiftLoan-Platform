'use client';
import { useEffect, useMemo, useState } from "react";

/** Voice-agent control surface for this calculator. See the useEffect below. */
export interface SwiftLoanCalcApi {
  read: () => { amount: number; rate: number; tenure: number; emi: number; interest: number; total: number };
  set: (v: { amount?: number; rate?: number; tenure?: number }) => void;
}
import Link from "next/link";
import { ArrowRight, CalendarClock, Percent, TrendingDown, Wallet } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Reveal } from "@/components/site/Reveal";
import { useCopy } from "@/lib/i18n";
import { emiCalculatorCopy } from "@/i18n/emi-calculator";

type EmiCopy = (typeof emiCalculatorCopy)["en"];

const inr = (n: number) =>
  "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

const compact = (n: number) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(n % 10000000 === 0 ? 0 : 1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`;
  if (n >= 1000) return `₹${Math.round(n / 1000)}K`;
  return inr(n);
};

const AMOUNT_PRESETS = [200000, 500000, 1000000, 2500000];
const TENURE_PRESETS = [12, 24, 36, 60];

export function EmiCalculator() {
  const t = useCopy(emiCalculatorCopy);
  const [amount, setAmount] = useState(500000);
  const [rate, setRate] = useState(11.5);
  const [tenure, setTenure] = useState(36);
  const [view, setView] = useState<"balance" | "yearly">("balance");

  const { emi, interest, total, balances, yearly } = useMemo(() => {
    const r = rate / 12 / 100;
    const e =
      r === 0 ? amount / tenure : (amount * r * Math.pow(1 + r, tenure)) / (Math.pow(1 + r, tenure) - 1);
    const tot = e * tenure;
    const pts: number[] = [];
    const rows: { label: string; principal: number; interest: number }[] = [];
    let bal = amount;
    let bucket = { principal: 0, interest: 0 };
    for (let m = 1; m <= tenure; m++) {
      pts.push(Math.max(bal, 0));
      const int = bal * r;
      const pri = Math.min(e - int, bal);
      bucket.principal += pri;
      bucket.interest += int;
      bal = bal - pri;
      if (m % 12 === 0 || m === tenure) {
        rows.push({ label: `${t.yearPrefix}${rows.length + 1}`, ...bucket });
        bucket = { principal: 0, interest: 0 };
      }
    }
    pts.push(Math.max(bal, 0));
    return { emi: e, interest: tot - amount, total: tot, balances: pts, yearly: rows };
  }, [amount, rate, tenure, t.yearPrefix]);

  const principalShare = (amount / total) * 100;
  const interestShare = 100 - principalShare;

  /**
   * Imperative bridge for the voice agent.
   *
   * The sliders are Radix components driven by React state, so the widget's
   * generic fillInput() (native value setter + input event) cannot move them —
   * there is no native <input type="range"> to write to. Rather than have the
   * agent fake pointer events on a slider thumb, the calculator publishes a
   * tiny read/set API and VoiceWidget calls it. Registered on mount, removed on
   * unmount, so `availableWhen` is simply "is this section on screen".
   *
   * Values are clamped here, not in the caller: the agent is a user of this
   * control and should not be able to drive it outside its own bounds.
   */
  useEffect(() => {
    const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
    const api: SwiftLoanCalcApi = {
      read: () => ({ amount, rate, tenure, emi, interest, total }),
      set: (v) => {
        if (typeof v.amount === 'number') setAmount(clamp(Math.round(v.amount), 50000, 7500000));
        if (typeof v.rate === 'number') setRate(clamp(v.rate, 9, 28));
        if (typeof v.tenure === 'number') setTenure(clamp(Math.round(v.tenure), 3, 60));
      },
    };
    (window as unknown as { __swiftloanCalc?: SwiftLoanCalcApi }).__swiftloanCalc = api;
    return () => {
      delete (window as unknown as { __swiftloanCalc?: SwiftLoanCalcApi }).__swiftloanCalc;
    };
  }, [amount, rate, tenure, emi, interest, total]);

  return (
    <section id="emi-calculator" className="shell scroll-mt-28 py-16 sm:py-24">
      <Reveal delay={0}>
        <div className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">{t.eyebrow}</span>
          <h2 className="mt-5 text-3xl leading-snug font-extrabold sm:text-4xl">{t.title}</h2>
          <p className="text-muted-foreground mt-4 text-base leading-relaxed">{t.subtitle}</p>
        </div>
      </Reveal>

      <Reveal delay={90}>
        <div className="glass-panel mt-12 grid gap-8 p-4 sm:p-6 lg:grid-cols-[1.1fr_1fr] lg:p-8">
          {/* ---------- controls ---------- */}
          <div className="min-w-0 space-y-7">
            <Field
              icon={<Wallet className="h-4 w-4" />}
              label={t.fields.amount.label}
              value={inr(amount)}
              minLabel={t.fields.amount.minLabel}
              maxLabel={t.fields.amount.maxLabel}
              min={50000}
              max={7500000}
              step={10000}
              current={amount}
              onChange={setAmount}
              presets={AMOUNT_PRESETS.map((v) => ({ v, label: compact(v) }))}
            />
            <Field
              icon={<Percent className="h-4 w-4" />}
              label={t.fields.rate.label}
              value={`${rate.toFixed(2)}%`}
              minLabel={t.fields.rate.minLabel}
              maxLabel={t.fields.rate.maxLabel}
              min={9}
              max={28}
              step={0.05}
              current={rate}
              onChange={setRate}
            />
            <Field
              icon={<CalendarClock className="h-4 w-4" />}
              label={t.fields.tenure.label}
              value={`${tenure} ${t.monthsShort}`}
              minLabel={t.fields.tenure.minLabel}
              maxLabel={t.fields.tenure.maxLabel}
              min={3}
              max={60}
              step={1}
              current={tenure}
              onChange={setTenure}
              presets={TENURE_PRESETS.map((v) => ({ v, label: `${v}m` }))}
            />

            <div className="bg-card border-border/50 rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <TrendingDown className="text-info h-4 w-4 shrink-0" />
                  <p className="text-info min-w-0 text-[0.65rem] font-bold tracking-[0.16em] uppercase">
                    {view === "balance" ? t.chart.balanceLabel : t.chart.yearlyLabel}
                  </p>
                </div>
                <div className="glass flex flex-wrap rounded-full p-0.5 text-[0.68rem] font-semibold">
                  {(["balance", "yearly"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      className={`cursor-pointer rounded-full px-3 py-1.5 transition-colors active:scale-95 ${
                        view === v
                          ? "bg-brand-gradient text-primary-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {v === "balance" ? t.chart.balance : t.chart.yearly}
                    </button>
                  ))}
                </div>
              </div>

              {view === "balance" ? (
                <BalanceChart points={balances} tenure={tenure} t={t} />
              ) : (
                <YearlyBars rows={yearly} t={t} />
              )}
            </div>
          </div>

          {/* ---------- result ---------- */}
          <div className="glass min-w-0 rounded-3xl p-5 sm:p-7">
            <p className="text-primary text-xs font-semibold tracking-[0.18em] uppercase">
              {t.result.monthlyEmi}
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <p className="font-display text-gradient text-4xl font-extrabold sm:text-5xl">
                {inr(emi)}
              </p>
              <span className="text-muted-foreground pb-2 text-xs font-semibold">
                {t.result.months(tenure)}
              </span>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-6">
              <Donut interestShare={interestShare} label={t.result.donutInterest} />
              <dl className="min-w-[9rem] flex-1 space-y-3 text-sm">
                <Row label={t.result.principal} value={inr(amount)} dot="bg-primary" valueClass="text-primary" />
                <Row
                  label={t.result.interestRow}
                  value={inr(interest)}
                  dot="bg-warning"
                  valueClass="text-warning-foreground"
                />
                <Row label={t.result.totalPayable} value={inr(total)} strong />
              </dl>
            </div>

            <div className="bg-warning mt-6 flex h-2.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-brand-gradient h-full transition-all duration-500"
                style={{ width: `${principalShare}%` }}
              />
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2.5">
              <Stat label={t.result.perLakh} value={inr((emi / amount) * 100000)} tone="text-primary" />
              <Stat
                label={t.result.interestCost}
                value={`${Math.round(interestShare)}%`}
                tone={interestShare > 25 ? "text-danger" : "text-warning-foreground"}
              />
              <Stat label={t.result.instalments} value={`${tenure}`} tone="text-info" />
            </div>

            <Link
              href="/#lead-form"
              className="bg-brand-gradient text-primary-foreground mt-7 inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-full px-6 py-3.5 text-center text-sm font-semibold transition-transform hover:-translate-y-0.5"
            >
              {t.result.cta} <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>

            <p className="text-muted-foreground mt-4 text-center text-[0.7rem] leading-relaxed italic">
              {t.result.disclaimer}
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-card border-border/50 min-w-0 rounded-2xl border px-2 py-2.5 text-center sm:px-3">
      <p className={`font-display text-sm leading-snug font-bold ${tone ?? ""}`}>{value}</p>
      <p className="text-muted-foreground mt-0.5 text-[0.6rem] leading-snug font-semibold tracking-[0.1em] uppercase">
        {label}
      </p>
    </div>
  );
}

function Donut({ interestShare, label }: { interestShare: number; label: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 88 88" className="h-full w-full -rotate-90">
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--warning)" strokeWidth="14" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="14"
          strokeDasharray={`${(c * (100 - interestShare)) / 100} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <p className="font-display text-warning-foreground text-base font-bold">
          {Math.round(interestShare)}%
        </p>
        <p className="text-muted-foreground text-[0.6rem] font-semibold tracking-[0.14em] uppercase">
          {label}
        </p>
      </div>
    </div>
  );
}

function YearlyBars({
  rows,
  t,
}: {
  rows: { label: string; principal: number; interest: number }[];
  t: EmiCopy;
}) {
  const max = Math.max(...rows.map((r) => r.principal + r.interest), 1);
  return (
    <div className="mt-4">
      <div className="flex h-28 items-end gap-2 sm:gap-3">
        {rows.map((r) => {
          const totalH = ((r.principal + r.interest) / max) * 100;
          const pShare = (r.principal / (r.principal + r.interest)) * 100;
          return (
            <div key={r.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <div
                className="bg-warning/80 flex w-full max-w-10 flex-col justify-end overflow-hidden rounded-lg transition-all duration-500"
                style={{ height: `${Math.max(totalH, 6)}%` }}
              >
                <div className="bg-brand-gradient w-full" style={{ height: `${pShare}%` }} />
              </div>
              <span className="text-muted-foreground text-[0.62rem] leading-snug font-semibold">{r.label}</span>
            </div>
          );
        })}
      </div>
      <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-4 text-[0.65rem] font-semibold">
        <span className="flex items-center gap-1.5">
          <span className="bg-primary h-2 w-2 shrink-0 rounded-full" /> {t.legend.principal}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-warning h-2 w-2 shrink-0 rounded-full" /> {t.legend.interest}
        </span>
      </div>
    </div>
  );
}

function BalanceChart({
  points,
  tenure,
  t,
}: {
  points: number[];
  tenure: number;
  t: EmiCopy;
}) {
  const max = points[0] ?? 1;
  const path = points
    .map((p, i) => `${(i / (points.length - 1)) * 100},${40 - (p / max) * 36}`)
    .join(" ");

  return (
    <div>
      <svg viewBox="0 0 100 44" preserveAspectRatio="none" className="mt-4 h-28 w-full">
        <defs>
          <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--info)" stopOpacity="0.3" />
            <stop offset="60%" stopColor="var(--primary)" stopOpacity="0.14" />
            <stop offset="100%" stopColor="var(--success)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="balStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--info)" />
            <stop offset="55%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--success)" />
          </linearGradient>
        </defs>
        {[10, 20, 30].map((y) => (
          <line
            key={y}
            x1="0"
            x2="100"
            y1={y}
            y2={y}
            stroke="var(--border)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <polygon points={`0,44 ${path} 100,44`} fill="url(#balFill)" />
        <polyline
          points={path}
          fill="none"
          stroke="url(#balStroke)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      </svg>
      <div className="text-muted-foreground mt-2 flex justify-between gap-2 text-[0.7rem]">
        <span>{t.monthLabel(1)}</span>
        <span className="text-right">{t.monthLabel(tenure)}</span>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
  minLabel,
  maxLabel,
  min,
  max,
  step,
  current,
  onChange,
  presets,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  minLabel: string;
  maxLabel: string;
  min: number;
  max: number;
  step: number;
  current: number;
  onChange: (v: number) => void;
  presets?: { v: number; label: string }[];
}) {
  return (
    <div className="min-w-0">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <span className="text-muted-foreground flex min-w-0 items-center gap-2 text-sm font-semibold">
          <span className="text-primary shrink-0">{icon}</span>
          <span className="text-foreground">{label}</span>
        </span>
        <span className="font-display text-primary text-lg font-bold">{value}</span>
      </div>
      <Slider
        className="mt-4"
        min={min}
        max={max}
        step={step}
        value={[current]}
        onValueChange={(v) => onChange(v[0] ?? current)}
      />
      <div className="text-muted-foreground mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="shrink-0">{minLabel}</span>
        {presets && (
          <span className="flex flex-1 flex-wrap justify-center gap-1.5">
            {presets.map((p) => (
              <button
                key={p.v}
                type="button"
                onClick={() => onChange(p.v)}
                className={`min-h-9 cursor-pointer rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold transition-colors active:scale-95 ${
                  current === p.v
                    ? "border-primary text-primary bg-primary/10"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </span>
        )}
        <span className="shrink-0">{maxLabel}</span>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  dot,
  valueClass,
}: {
  label: string;
  value: string;
  strong?: boolean;
  dot?: string;
  valueClass?: string;
}) {
  return (
    <div className="border-border/60 flex items-center justify-between gap-3 border-b pb-2.5 last:border-0">
      <dt className="text-muted-foreground flex min-w-0 items-center gap-2">
        {dot && <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />}
        <span>{label}</span>
      </dt>
      <dd
        className={`shrink-0 ${strong ? "font-display text-base font-bold" : "font-semibold"} ${valueClass ?? ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
