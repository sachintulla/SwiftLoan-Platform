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
import { upshotEvent } from "./upshot";

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

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const currentLang = useRef<Lang>("en");

  /** Every way of changing language (both menus, the voice assistant) goes through here, so it is remembered. */
  const setLang = useCallback((next: Lang) => {
    // Upshot: an actual choice (not the post-hydration restore, which uses setLangState).
    if (next !== currentLang.current) {
      upshotEvent("language_selected", { language: next, label: UPSHOT_LANG_LABELS[next] });
    }
    currentLang.current = next;
    setLangState(next);
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
      const saved = localStorage.getItem(STORAGE_KEY);
      const match = LANGS.find((l) => l === saved);
      if (match && match !== currentLang.current) {
        currentLang.current = match;
        setLangState(match);
      }
    } catch {
      /* storage blocked */
    }
  }, []);
  useIsoLayoutEffect(() => {
    restore();
  }, [restore]);

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
