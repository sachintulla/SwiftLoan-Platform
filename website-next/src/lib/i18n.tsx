'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { upshotEvent } from "./upshot";
import { languageLinks, localizedHref, urlLangOf } from "./localeRoutes";

export const LANGS = ["en", "hi", "te"] as const;
export type Lang = (typeof LANGS)[number];

export const languageOptions = [
  { code: "en", short: "EN", label: "English" },
  { code: "hi", short: "हि", label: "हिन्दी · Hindi" },
  { code: "te", short: "తె", label: "తెలుగు · Telugu" },
] as const satisfies ReadonlyArray<{ code: Lang; short: string; label: string }>;

/** English names for the Upshot `language_selected` event (mobile sends the same labels). */
const UPSHOT_LANG_LABELS: Record<Lang, string> = { en: "English", hi: "Hindi", te: "Telugu" };

/** Voice-agent control surface for the language switcher. */
export interface SwiftLoanLangApi {
  get: () => Lang;
  set: (code: string) => boolean;
  available: () => Lang[];
}

type LanguageContextValue = { lang: Lang; setLang: (lang: Lang) => void };

const LanguageContext = createContext<LanguageContextValue>({
  lang: "en",
  setLang: () => {},
});

const STORAGE_KEY = "sl_lang";
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Where the language comes from, in order:
 *
 *  1. A language URL (/hi/…, /te/… of a page that has language versions, lib/localeRoutes.ts):
 *     the URL decides, on the server and on the first client render alike, so the HTML Google and
 *     the visitor get is already in that language (no flash of English, nothing to re-render).
 *     Opening such a URL also saves it as the visitor's language, so the pages that have no
 *     language URL (/apply, /account) carry on in it.
 *  2. Any other URL (English pages, the application, the account): as before, the first render is
 *     English (it must match the server's HTML) and the saved choice (`sl_lang`) is put on screen
 *     right after hydration. Nobody is redirected: a visitor with Hindi saved who opens /faqs
 *     stays on /faqs and reads it in Hindi; Google, which has nothing saved, gets English there.
 *  3. A choice made on this page without changing URL (the voice assistant's set_language, or a
 *     menu on a page without language URLs) applies at once, on any URL, until the page changes.
 *     The menus on pages WITH language versions are links to the other version's URL instead.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const urlLang = urlLangOf(pathname);
  /** The remembered language (mirrors localStorage once hydrated). */
  const [saved, setSaved] = useState<Lang>("en");
  /** A choice made in place; it only holds for the page it was made on. */
  const [picked, setPicked] = useState<{ lang: Lang; path: string | null } | null>(null);
  const lang: Lang = (picked && picked.path === pathname ? picked.lang : null) ?? urlLang ?? saved;

  const currentLang = useRef<Lang>(lang);
  currentLang.current = lang;
  const currentPath = useRef(pathname);
  currentPath.current = pathname;

  /** Every way of changing language (both menus, the voice assistant) goes through here, so it is remembered. */
  const setLang = useCallback((next: Lang) => {
    // Upshot: an actual choice (not the post-hydration restore, nor arriving on a language URL).
    if (next !== currentLang.current) {
      upshotEvent("language_selected", { language: next, label: UPSHOT_LANG_LABELS[next] });
    }
    currentLang.current = next;
    setSaved(next);
    setPicked({ lang: next, path: currentPath.current });
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage blocked — the choice still holds for this page view */
    }
  }, []);

  // Restore the last choice after hydration (not in the initial state, which must match the server render).
  // Layout effect so the saved language is on screen before the first paint, not a flash of English after it.
  const restore = useCallback(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const match = LANGS.find((l) => l === stored);
      if (match) setSaved(match);
    } catch {
      /* storage blocked */
    }
  }, []);
  useIsoLayoutEffect(() => {
    if (!urlLang) {
      restore();
      return;
    }
    // On a language URL the URL is the choice: remember it for the pages that have no language URL.
    setSaved(urlLang);
    try {
      localStorage.setItem(STORAGE_KEY, urlLang);
    } catch {
      /* storage blocked */
    }
  }, [urlLang, restore]);

  // Coming back to the page without a fresh mount — the browser's Back from a partner lender's site (bfcache),
  // or another tab changing the language — must keep the saved language, not fall back to English.
  useEffect(() => {
    const onPageShow = () => restore();
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) restore(); };
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("storage", onStorage);
    };
  }, [restore]);

  useEffect(() => {
    document.documentElement.lang = lang;
    // The floating voice widget is built outside React; this is how it hears about a change.
    window.dispatchEvent(new CustomEvent("swiftloan:lang", { detail: lang }));
  }, [lang]);

  /**
   * Imperative bridge for the voice agent.
   *
   * Language is React context now, so the widget's old approach — clicking a
   * `.langtoggle__btn` element — has nothing to click. Publishing get/set here
   * keeps the agent working without it reaching into React internals, and means
   * a visitor can say "switch to Hindi" mid-call.
   */
  useEffect(() => {
    const api: SwiftLoanLangApi = {
      get: () => lang,
      set: (code: string) => {
        const match = LANGS.find((l) => l === code.toLowerCase());
        if (!match) return false;
        setLang(match);
        return true;
      },
      available: () => LANGS.slice(),
    };
    (window as unknown as { __swiftloanLang?: SwiftLoanLangApi }).__swiftloanLang = api;
    return () => {
      delete (window as unknown as { __swiftloanLang?: SwiftLoanLangApi }).__swiftloanLang;
    };
  }, [lang, setLang]);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  return useContext(LanguageContext);
}

/**
 * Keeps internal links in the visitor's language: `const href = useLocalizedHref()` then
 * `<Link href={href('/faqs')}>` gives /hi/faqs to a Hindi reader. Links to pages that have no
 * language version come back unchanged (rules: lib/localeRoutes.ts `localizedHref`).
 */
export function useLocalizedHref(): (href: string) => string {
  const { lang } = useLang();
  return useCallback((href: string) => localizedHref(href, lang), [lang]);
}

/**
 * For a language menu: each language's URL for the page being viewed, or null when that page has
 * no language versions (then the menu switches in place with `setLang`).
 */
export function useLanguageLinks(): Record<Lang, string> | null {
  const pathname = usePathname();
  return useMemo(() => languageLinks(pathname), [pathname]);
}

// Copy bundles live in lib/copy.ts (no React) so the server can read them too.
import type { Copy } from './copy';
export { defineCopy } from './copy';
export type { Copy } from './copy';

/** Read the active language's slice of a copy bundle. */
export function useCopy<T>(bundle: Copy<T>): T {
  const { lang } = useLang();
  return bundle[lang] ?? bundle.en;
}
