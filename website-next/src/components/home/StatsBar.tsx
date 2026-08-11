'use client';
import {
  Banknote,
  Building2,
  CreditCard,
  Fingerprint,
  Landmark,
  Lock,
  Network,
  Repeat,
  ScanFace,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Counter, Reveal } from "@/components/site/Reveal";
import type { LucideIcon } from "lucide-react";
import { useCopy } from "@/lib/i18n";
import { statsBarCopy } from "@/i18n/stats-bar";

const statValues: number[] = [2400, 18, 94, 500000];

const railIcons: LucideIcon[] = [
  Building2,
  Landmark,
  Network,
  CreditCard,
  Fingerprint,
  Repeat,
  ScanFace,
  ShieldCheck,
  Lock,
  Wallet,
  Smartphone,
  Banknote,
];

const railTones = [
  "text-primary",
  "text-info",
  "text-success",
  "text-violet",
  "text-warning",
  "text-brand-deep",
];

export function StatsBar() {
  const t = useCopy(statsBarCopy);
  const stats = t.stats.map((s, i) => ({ ...s, value: statValues[i]! }));
  const rails = t.rails.map((label, i) => ({ label, icon: railIcons[i]! }));

  const visuals = [
    <GrowthAreaChart key="growth" delta={t.growthDelta} />,
    <PartnerCapsules key="partner" partners={t.partners} />,
    <MatchGauge key="match" matchLabel={t.matchLabel} excellent={t.matchExcellent} />,
    <CustomerNetwork key="customer" growth={t.customerGrowth} badge={t.customerBadge} />,
  ];

  return (
    <section id="stats" className="py-8">
      <div className="shell">
        <Reveal>
          <div className="glass-panel grid gap-6 p-5 sm:grid-cols-2 sm:p-8 lg:grid-cols-4">
            {stats.map((s, i) => (
              <div key={s.label} className="min-w-0">
                <p className="font-display text-gradient text-2xl font-extrabold sm:text-3xl lg:text-4xl">
                  <Counter value={s.value} prefix={s.prefix} suffix={s.suffix} />
                </p>
                <p className="text-muted-foreground mt-2 text-sm leading-snug">{s.label}</p>
                <div aria-hidden className="mt-4">
                  {visuals[i]}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      <Reveal delay={120}>
        <div className="mt-12">
          <p className="text-muted-foreground px-4 text-center text-xs font-semibold tracking-[0.22em] uppercase">
            {t.poweringLabel}
          </p>

          <div className="marquee mt-6">
            <div className="marquee-track">
              {[0, 1].map((copy) => (
                <div key={copy} className="marquee-group" aria-hidden={copy === 1}>
                  {rails.map((r, i) => (
                    <div
                      key={r.label}
                      className="glass flex shrink-0 items-center gap-2.5 rounded-2xl px-5 py-3.5"
                    >
                      <r.icon className={`h-4.5 w-4.5 shrink-0 ${railTones[i % railTones.length]}`} />
                      <span className="text-xs font-semibold whitespace-nowrap">{r.label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function GrowthAreaChart({ delta }: { delta: string }) {
  return (
    <div className="relative h-8 w-full">
      <svg viewBox="0 0 120 28" preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id="areaStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--info)" />
            <stop offset="55%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--success)" />
          </linearGradient>
          <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Grid lines */}
        <line x1="0" y1="7" x2="120" y2="7" stroke="var(--border)" strokeWidth="1" strokeDasharray="2 2" />
        <line x1="0" y1="21" x2="120" y2="21" stroke="var(--border)" strokeWidth="1" strokeDasharray="2 2" />
        <path
          d="M0,24 L14,21 L28,22 L42,17 L56,18 L70,13 L84,14 L98,9 L112,7 L120,5 L120,28 L0,28 Z"
          fill="url(#areaFill)"
        />
        <polyline
          points="0,24 14,21 28,22 42,17 56,18 70,13 84,14 98,9 112,7 120,5"
          fill="none"
          stroke="url(#areaStroke)"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#glow)"
        />
        <circle cx="120" cy="5" r="3.5" fill="var(--success)" stroke="var(--background)" strokeWidth="2" filter="url(#glow)" />
      </svg>
      <span className="absolute top-0 right-0 flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-success">
        <TrendingUp className="h-3 w-3 shrink-0" /> {delta}
      </span>
    </div>
  );
}

function PartnerCapsules({ partners }: { partners: readonly string[] }) {
  const colors = ["bg-info", "bg-primary", "bg-success", "bg-violet", "bg-warning"];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {partners.map((label, i) => (
          <span
            key={label}
            className={`${colors[i % colors.length]} text-primary-foreground rounded-full px-1.5 py-0.5 text-[9px] font-semibold shadow-sm`}
            style={{ opacity: 0.9 + (i % 2) * 0.1 }}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
        <div
          className="h-full rounded-full"
          style={{
            width: "100%",
            background: "linear-gradient(90deg, var(--info), var(--primary) 30%, var(--success) 60%, var(--violet) 85%, var(--warning))",
          }}
        />
      </div>
    </div>
  );
}

function MatchGauge({ matchLabel, excellent }: { matchLabel: string; excellent: string }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - 0.94);
  return (
    <div className="flex h-10 items-center gap-3">
      <div className="relative h-10 w-10 shrink-0">
        <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90">
          <defs>
            <linearGradient id="gaugeStroke" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--info)" />
              <stop offset="60%" stopColor="var(--primary)" />
              <stop offset="100%" stopColor="var(--success)" />
            </linearGradient>
          </defs>
          <circle cx="20" cy="20" r={radius} fill="none" stroke="var(--muted)" strokeWidth="4.5" />
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke="url(#gaugeStroke)"
            strokeWidth="4.5"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[9px] font-extrabold leading-none text-success">94</span>
          <span className="text-[6px] font-semibold leading-none text-muted-foreground">%</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex justify-between gap-2 text-[10px] font-semibold">
          <span className="text-muted-foreground">{matchLabel}</span>
          <span className="text-success">{excellent}</span>
        </div>
        <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
          <div
            className="h-full rounded-full"
            style={{ width: "94%", background: "linear-gradient(90deg, var(--info), var(--primary) 55%, var(--success))" }}
          />
        </div>
      </div>
    </div>
  );
}

function CustomerNetwork({ growth, badge }: { growth: string; badge: string }) {
  const gradients = [
    "from-info to-primary",
    "from-primary to-mint",
    "from-violet to-info",
    "from-success to-warning",
    "from-warning to-danger",
    "from-danger to-info",
    "from-info to-violet",
    "from-mint to-primary",
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center pl-1">
        {gradients.map((gradient, i) => (
          <span
            key={i}
            className={`bg-gradient-to-br ${gradient} -ml-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-background shadow-sm`}
          >
            <Users className="h-2.5 w-2.5 text-primary-foreground" />
          </span>
        ))}
        <span className="bg-success-soft text-success -ml-1.5 flex h-6 shrink-0 items-center justify-center rounded-full border-2 border-background px-1.5 text-[9px] font-bold whitespace-nowrap">
          {badge}
        </span>
      </div>
      <span className="text-[10px] font-semibold whitespace-nowrap text-success">{growth}</span>
    </div>
  );
}
