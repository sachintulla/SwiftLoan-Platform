'use client';
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, ChevronDown, Globe, Menu, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { languageOptions, useCopy, useLang } from "@/lib/i18n";
import { siteHeaderCopy } from "@/i18n/site-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { href: "/", key: "home" },
  { href: "/#offers", key: "loans" },
  { href: "/#journey", key: "process" },
  { href: "/#emi-calculator", key: "emiCalc" },
  { href: "/faqs", key: "faqs" },
] as const;

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { lang, setLang } = useLang();
  const t = useCopy(siteHeaderCopy);
  const links = navItems.map((item) => ({ ...item, label: t.nav[item.key] }));


  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-50">
      <div
        className={cn(
          "border-b border-border text-muted-foreground transition-all duration-500",
          scrolled ? "bg-card/70 backdrop-blur-md" : "bg-card",
        )}
      >
        <div className="shell flex items-center justify-center gap-2 py-2 text-center text-[0.72rem] leading-snug sm:text-xs">
          <ShieldCheck className="hidden h-4 w-4 shrink-0 text-primary sm:block" />
          <p>
            {t.disclaimer}
          </p>
        </div>
      </div>

      <div className="px-3 pt-3 transition-all duration-500">
        <nav
          className={cn(
            "relative mx-auto flex max-w-6xl items-center gap-4 rounded-3xl border px-4 py-2.5 shadow-[var(--shadow-glass)] backdrop-blur-md transition-all duration-500",
            scrolled
              ? "bg-card/70 border-border/70 shadow-[var(--shadow-float)]"
              : "bg-card border-border",
          )}
        >
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <span className="bg-brand-gradient grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold text-primary-foreground shadow-[var(--shadow-soft)]">
              S
            </span>
            <span className="font-display truncate text-lg font-bold tracking-tight">
              SwiftLoan<span className="text-gradient">.ai</span>
            </span>
          </Link>

          <div className="pointer-events-none absolute inset-x-0 hidden justify-center md:flex">
            <div className="pointer-events-auto flex items-center gap-1">
              {links.map((l) => (
                <Link
                  key={l.key}
                  href={l.href}
                  className="rounded-full px-3.5 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="ml-auto hidden items-center gap-1 md:flex">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t.changeLanguage}
                  className="border-primary/30 text-primary hover:bg-accent inline-flex cursor-pointer items-center gap-1.5 rounded-2xl border bg-card/70 px-3 py-2 text-xs font-bold tracking-wide transition-colors"
                >
                  <Globe className="h-4 w-4" />
                  {languageOptions.find((l) => l.code === lang)?.short}
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={10}
                className="bg-card min-w-56 rounded-3xl border-border/60 p-2 shadow-[var(--shadow-glass)]"
              >
                {languageOptions.map((l) => (
                  <DropdownMenuItem
                    key={l.code}
                    onSelect={() => setLang(l.code)}
                    className="focus:bg-accent cursor-pointer rounded-2xl px-4 py-3 text-sm font-medium data-[state=on]:bg-accent"
                  >
                    <span className="flex-1">{l.label}</span>
                    {lang === l.code && <Check className="text-primary h-4 w-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Link
              href="/#lead-form"
              onClick={(e) => {
                if (
                  typeof window !== "undefined" &&
                  window.__swiftloanQuickCheck &&
                  window.innerWidth >= 768
                ) {
                  e.preventDefault();
                  window.__swiftloanQuickCheck.open();
                }
              }}
              className="bg-brand-gradient ml-2 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5"
            >
              {t.cta} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={t.toggleMenu}
            className="ml-auto grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl border border-border md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

        </nav>

        {open && (
          <div className="bg-card border border-border animate-in fade-in slide-in-from-top-2 mx-auto mt-2 max-w-6xl rounded-3xl p-3 shadow-[var(--shadow-glass)] md:hidden">
            <div className="flex flex-col">
              {links.map((l) => (
                <Link
                  key={l.key}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-2xl px-4 py-3 text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  {l.label}
                </Link>
              ))}
              <div className="mt-2 border-t border-border/60 pt-2">
                <p className="flex items-center gap-2 px-4 pb-1 text-xs font-semibold text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" /> {t.languageLabel}
                </p>
                {languageOptions.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setLang(l.code)}
                    className="flex w-full cursor-pointer items-center rounded-2xl px-4 py-2.5 text-left text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="flex-1">{l.label}</span>
                    {lang === l.code && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>

              <Link
                href="/#lead-form"
                onClick={() => setOpen(false)}
                className="bg-brand-gradient mt-2 inline-flex items-center justify-center gap-1.5 rounded-2xl px-5 py-3 text-sm font-semibold text-primary-foreground"
              >
                {t.cta} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
