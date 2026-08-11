'use client';
import { Banknote, BadgeCheck, GitCompare, MousePointerClick, SearchCheck } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import type { LucideIcon } from "lucide-react";
import { useCopy } from "@/lib/i18n";
import { journeyCopy } from "@/i18n/journey";

const stepIcons = [MousePointerClick, SearchCheck, GitCompare, Banknote] as const;

export function Journey() {
  const t = useCopy(journeyCopy);
  const visuals = [<GoalVisual key="g" />, <SoftCheckVisual key="s" />, <OffersVisual key="o" />, <FundedVisual key="f" />];
  const steps = t.steps.map((s, i) => ({
    ...s,
    Icon: stepIcons[i] as LucideIcon,
    visual: visuals[i],
  }));

  return (
    <section id="journey" className="shell scroll-mt-28 py-16 sm:py-24">
      <Reveal className="mx-auto max-w-2xl text-center">
        <div>
          <span className="eyebrow">{t.eyebrow}</span>
          <h2 className="mt-6 text-3xl leading-snug font-extrabold sm:text-4xl">{t.title}</h2>
          <p className="text-muted-foreground mt-4 text-base leading-relaxed">{t.subtitle}</p>
        </div>
      </Reveal>

      <div className="relative mt-16">
        <div
          aria-hidden
          className="bg-brand-gradient absolute top-[3.25rem] right-8 left-8 hidden h-px opacity-40 lg:block"
        />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-[auto_auto_auto_1fr]">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 110} className="lg:row-span-4 lg:grid lg:grid-rows-subgrid">
              <div className="glass lift relative h-full min-w-0 rounded-3xl p-6 lg:row-span-4 lg:grid lg:grid-rows-subgrid">
                <div className="flex items-center justify-between gap-3">
                  <span className="bg-brand-gradient grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-primary-foreground shadow-[var(--shadow-soft)]">
                    <s.Icon className="h-5 w-5" />
                  </span>
                  <span className="font-display text-primary/25 text-3xl font-extrabold">
                    {s.n}
                  </span>
                </div>

                <div
                  aria-hidden
                  className="bg-card border-border/50 mt-5 flex min-h-[6.5rem] items-center rounded-2xl border p-4"
                >
                  <div className="w-full min-w-0">{s.visual}</div>
                </div>

                <h3 className="mt-5 text-lg leading-snug font-bold">{s.title}</h3>
                <p className="text-muted-foreground mt-2.5 text-sm leading-relaxed">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

      </div>
    </section>
  );
}

function GoalVisual() {
  const t = useCopy(journeyCopy);
  return (
    <div className="space-y-3">
      <div className="bg-muted grid grid-cols-2 gap-1 rounded-full p-1 text-[0.7rem] font-semibold">
        <span className="bg-brand-gradient text-primary-foreground rounded-full px-3 py-1.5 text-center leading-snug">
          {t.goalVisual.personal}
        </span>
        <span className="text-muted-foreground rounded-full px-3 py-1.5 text-center leading-snug">
          {t.goalVisual.business}
        </span>
      </div>
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div className="bg-info h-full w-[46%] rounded-full" />
      </div>
      <div className="bg-muted h-2 w-[72%] overflow-hidden rounded-full">
        <div className="bg-violet/70 h-full w-[38%] rounded-full" />
      </div>
    </div>
  );
}

function SoftCheckVisual() {
  const t = useCopy(journeyCopy);
  const pct = 78;
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-14 w-14 shrink-0">
        <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90">
          <circle cx="24" cy="24" r={r} fill="none" stroke="var(--muted)" strokeWidth="5" />
          <circle
            cx="24"
            cy="24"
            r={r}
            fill="none"
            stroke="var(--success)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${(c * pct) / 100} ${c}`}
          />
        </svg>
        <span className="font-display text-success absolute inset-0 grid place-items-center text-xs font-bold">
          {pct}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-success text-[0.65rem] font-bold tracking-[0.16em] uppercase">
          {t.softCheckVisual.label}
        </p>
        <p className="text-muted-foreground text-xs leading-snug">{t.softCheckVisual.sub}</p>
      </div>
    </div>
  );
}

function OffersVisual() {
  const rows = [
    { w: "94%", rate: "10.49%", tone: "bg-success", text: "text-success" },
    { w: "72%", rate: "12.25%", tone: "bg-primary", text: "text-primary" },
    { w: "48%", rate: "13.90%", tone: "bg-warning", text: "text-warning-foreground" },
  ];
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.rate} className="flex items-center gap-2.5">
          <div className="bg-muted h-2 min-w-0 flex-1 overflow-hidden rounded-full">
            <div className={`${r.tone} h-full rounded-full`} style={{ width: r.w }} />
          </div>
          <span className={`w-12 shrink-0 text-right text-[0.7rem] font-bold ${r.text}`}>
            {r.rate}
          </span>
        </div>
      ))}
    </div>
  );
}

function FundedVisual() {
  const t = useCopy(journeyCopy);
  return (
    <div className="flex items-center gap-3">
      <span className="bg-success text-success-foreground grid h-9 w-9 shrink-0 place-items-center rounded-xl">
        <BadgeCheck className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="font-display text-success text-sm leading-snug font-bold">{t.fundedVisual.credited}</p>
        <p className="text-muted-foreground text-xs leading-snug">{t.fundedVisual.sub}</p>
      </div>
    </div>
  );
}
