'use client';
import Link from "next/link";
import { AtSign, Hash, Users } from "lucide-react";
import { useCopy } from "@/lib/i18n";
import { siteFooterCopy } from "@/i18n/site-footer";

/** Routes per column item, matched by index (null = non-navigating label). */
type FooterRoute = "/" | "/faqs" | null;
const companyRoutes: readonly FooterRoute[] = [null, null, null, "/faqs"];

export function SiteFooter() {
  const t = useCopy(siteFooterCopy);
  return (
    <footer className="bg-card relative mt-16 sm:mt-24 overflow-hidden border-t border-border text-foreground">
      <div
        aria-hidden
        className="orb animate-drift -top-32 left-1/4 h-[28rem] w-[28rem] opacity-10"
        style={{ background: "var(--gradient-brand)" }}
      />
      <div className="shell relative py-12 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div className="min-w-0 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <span className="bg-brand-gradient grid h-9 w-9 place-items-center rounded-xl text-sm font-bold text-primary-foreground shadow-[var(--shadow-soft)]">
                S
              </span>
              <span className="font-display text-lg font-bold">SwiftLoan.ai</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {t.tagline}
            </p>
            <div className="mt-6 flex gap-3">
              {[Users, Hash, AtSign].map((Icon, i) => (
                <span
                  key={i}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-muted text-muted-foreground transition-transform hover:-translate-y-1 hover:bg-primary/10 hover:text-primary"
                >
                  <Icon className="h-4.5 w-4.5" />
                </span>
              ))}
            </div>
          </div>

          <FooterCol title={t.columns.products} items={t.products} />
          <FooterCol title={t.columns.company} items={t.company} routes={companyRoutes} />
          <FooterCol title={t.columns.legal} items={t.legal} />
        </div>

        <div className="bg-muted mt-12 rounded-3xl border border-border p-5 sm:mt-14 sm:p-6">
          <h4 className="text-sm font-bold tracking-wide uppercase">{t.disclosureTitle}</h4>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t.disclosure}</p>
          <h4 className="mt-6 text-sm font-bold tracking-wide uppercase">{t.disclaimerTitle}</h4>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t.disclaimer}</p>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">{t.copyright}</p>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  items,
  routes,
}: {
  title: string;
  items: readonly string[];
  routes?: readonly FooterRoute[];
}) {
  return (
    <div className="min-w-0">
      <h4 className="text-sm font-bold tracking-wide uppercase">{title}</h4>
      <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
        {items.map((item, i) => {
          const to = routes?.[i] ?? null;
          return (
            <li key={item}>
              {to ? (
                <Link href={to} className="transition-colors hover:text-foreground hover:underline">
                  {item}
                </Link>
              ) : (
                <span className="cursor-pointer transition-colors hover:text-foreground hover:underline">
                  {item}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
