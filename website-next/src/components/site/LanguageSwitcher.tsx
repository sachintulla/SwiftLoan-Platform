'use client';

import { Check, ChevronDown, Globe } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { defineCopy, languageOptions, useCopy, useLang } from '@/lib/i18n';

const copy = defineCopy({
  en: { change: 'Change language' },
  hi: { change: 'भाषा बदलें' },
  te: { change: 'భాష మార్చండి' },
});

/**
 * The language switch for pages that do not carry the site header — the application funnel
 * (/apply/*) and the account area (/account/*) hide it, which used to leave a visitor in the middle
 * of an application with no way to change language. Exactly the three languages the site supports:
 * English, Hindi and Telugu. Reads and writes the same LanguageProvider as the header's menu (and
 * the voice assistant's set_language), so all three always agree.
 */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { lang, setLang } = useLang();
  const t = useCopy(copy);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t.change}
          className={`border-primary/30 text-primary hover:bg-accent inline-flex cursor-pointer items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-bold tracking-wide transition-colors ${className}`}
        >
          <Globe className="h-3.5 w-3.5" />
          {languageOptions.find((l) => l.code === lang)?.short}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="bg-card min-w-52 rounded-2xl border-border/60 p-1.5 shadow-[var(--shadow-glass)]">
        {languageOptions.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onSelect={() => setLang(l.code)}
            className="focus:bg-accent cursor-pointer rounded-xl px-3.5 py-2.5 text-sm font-medium"
          >
            <span className="flex-1">{l.label}</span>
            {lang === l.code && <Check className="text-primary h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
