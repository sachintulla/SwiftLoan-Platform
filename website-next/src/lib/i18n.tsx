'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const LANGS = ["en", "hi", "te"] as const;
export type Lang = (typeof LANGS)[number];

export const languageOptions = [
  { code: "en", short: "EN", label: "English" },
  { code: "hi", short: "हि", label: "हिन्दी · Hindi" },
  { code: "te", short: "తె", label: "తెలుగు · Telugu" },
] as const satisfies ReadonlyArray<{ code: Lang; short: string; label: string }>;

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

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  /** Every way of changing language (both menus, the voice assistant) goes through here, so it is remembered. */
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage blocked — the choice still holds for this page view */
    }
  }, []);

  // Restore the last choice after hydration (not in the initial state, which must match the server render).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const match = LANGS.find((l) => l === saved);
      if (match) setLangState(match);
    } catch {
      /* storage blocked */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
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

/** A copy bundle: the same shape translated into every supported language. */
export type Copy<T> = Record<Lang, T>;

/** Declare a copy bundle; the English entry drives the type of the others. */
export function defineCopy<T>(bundle: { en: T; hi: T; te: T }): Copy<T> {
  return bundle;
}

/** Read the active language's slice of a copy bundle. */
export function useCopy<T>(bundle: Copy<T>): T {
  const { lang } = useLang();
  return bundle[lang] ?? bundle.en;
}
