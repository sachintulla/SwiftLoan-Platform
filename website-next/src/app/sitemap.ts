import type { MetadataRoute } from 'next';
import { PUBLIC_PAGES, languageAlternates, pageUrl } from '@/lib/seo';
import { ALL_LANGS, DEFAULT_LANG } from '@/lib/locale';

/**
 * /sitemap.xml — every public page (lib/seo.ts PUBLIC_PAGES), for Google Search Console.
 * A page with language versions gets one line per language (/x, /hi/x, /te/x), each carrying the
 * same hreflang alternates; an English-only page gets its one line and no alternates.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_PAGES.flatMap((p) => {
    const langs = p.i18n ? ALL_LANGS : [DEFAULT_LANG];
    return langs.map((lang) => ({
      url: pageUrl(p.path, lang),
      lastModified,
      changeFrequency: p.changeFrequency,
      priority: p.priority,
      ...(p.i18n ? { alternates: { languages: languageAlternates(p.path) } } : {}),
    }));
  });
}
