import type { Metadata } from 'next';
import type { PublicPage } from './seoTypes';
import { ALL_LANGS, DEFAULT_LANG, LOCALE_TAGS, withLang, type Lang } from './locale';
import { DOCS_PAGES } from './seoPages.docs';
import { PURPOSE_PAGES } from './seoPages.purpose';

/**
 * Search-engine setup for swiftloan.ai, in one place: the public pages Google should index
 * (they feed sitemap.xml), the private ones it must not (they feed robots.txt and a `noindex`
 * on their layouts), each page's title/description/canonical, and the structured data
 * (schema.org JSON-LD) Google reads to understand who we are.
 *
 * Languages: a page whose entry has `i18n` (Hindi + Telugu title and description) also exists at
 * /hi/<path> and /te/<path>, with hreflang tags between the three and its own sitemap lines. How a
 * page gets those versions is written at the top of app/[lang]/localizedPages.tsx.
 *
 * Only facts that are true go into structured data: no phone number, address or registration
 * number until the real ones are confirmed (the app still shows placeholders for those).
 */
export const SITE_URL = 'https://swiftloan.ai';
export const SITE_NAME = 'SwiftLoan.ai';
/** The company behind the brand, as named in the Privacy Policy. */
export const LEGAL_NAME = 'Purpletalk India Private Limited';

export type { PublicPage } from './seoTypes';

/** The core pages. Page families keep their own lists (seoPages.*.ts) and are joined below. */
const CORE_PAGES: PublicPage[] = [
  {
    path: '/',
    title: 'SwiftLoan.ai — AI loan matching across 18+ RBI-registered lenders',
    description:
      'Compare personal & business loan offers matched by AI. Soft credit check, 3-minute application, 100% paperless. ₹50K–₹75L from RBI-registered lending partners.',
    priority: 1,
    changeFrequency: 'weekly',
    i18n: {
      hi: {
        title: 'SwiftLoan.ai — 18+ RBI-रजिस्टर्ड लेंडर्स में AI लोन मैचिंग',
        description:
          'AI से मैच किए गए पर्सनल और बिज़नेस लोन ऑफर्स कम्पेयर करें। सॉफ्ट क्रेडिट चेक, 3 मिनट का आवेदन, 100% पेपरलेस। RBI-रजिस्टर्ड लेंडिंग पार्टनर्स से ₹50K–₹75L।',
      },
      te: {
        title: 'SwiftLoan.ai — 18+ RBI-రిజిస్టర్డ్ లెండర్స్‌తో AI లోన్ మ్యాచింగ్',
        description:
          'AI మ్యాచ్ చేసిన పర్సనల్, బిజినెస్ లోన్ ఆఫర్స్ కంపేర్ చేయండి. సాఫ్ట్ క్రెడిట్ చెక్, 3 నిమిషాల దరఖాస్తు, 100% పేపర్‌లెస్. RBI-రిజిస్టర్డ్ లెండర్స్ నుండి ₹50K–₹75L.',
      },
    },
  },
  {
    path: '/personal-loan',
    title: 'Personal loan online — compare offers from RBI-registered lenders | SwiftLoan.ai',
    description:
      'Collateral-free personal loans from ₹50,000 to ₹25 lakh. Soft credit check, 100% paperless, compare matched offers in about 3 minutes.',
    priority: 0.9,
    changeFrequency: 'monthly',
    i18n: {
      hi: {
        title: 'पर्सनल लोन ऑनलाइन — RBI-रजिस्टर्ड लेंडर्स के ऑफर्स कम्पेयर करें | SwiftLoan.ai',
        description:
          '₹50,000 से ₹25 लाख तक बिना गारंटी का पर्सनल लोन। सॉफ्ट क्रेडिट चेक, 100% पेपरलेस, करीब 3 मिनट में मैच किए गए ऑफर्स कम्पेयर करें।',
      },
      te: {
        title: 'పర్సనల్ లోన్ ఆన్‌లైన్ — RBI-రిజిస్టర్డ్ లెండర్స్ ఆఫర్స్ కంపేర్ చేయండి | SwiftLoan.ai',
        description:
          '₹50,000 నుండి ₹25 లక్షల వరకు ఎలాంటి హామీ లేని పర్సనల్ లోన్. సాఫ్ట్ క్రెడిట్ చెక్, 100% పేపర్‌లెస్, సుమారు 3 నిమిషాల్లో మ్యాచ్ అయిన ఆఫర్స్ కంపేర్ చేయండి.',
      },
    },
  },
  {
    path: '/business-loan',
    title: 'Business loan for MSMEs & the self-employed — compare offers | SwiftLoan.ai',
    description:
      'Working capital and growth funding from ₹1 lakh to ₹75 lakh for MSMEs, startups and self-employed professionals. Soft credit check, matched offers.',
    priority: 0.9,
    changeFrequency: 'monthly',
    i18n: {
      hi: {
        title: 'MSME और सेल्फ-एम्प्लॉयड के लिए बिज़नेस लोन — ऑफर्स कम्पेयर करें | SwiftLoan.ai',
        description:
          'MSME, स्टार्टअप और सेल्फ-एम्प्लॉयड प्रोफेशनल्स के लिए ₹1 लाख से ₹75 लाख तक वर्किंग कैपिटल और ग्रोथ फंडिंग। सॉफ्ट क्रेडिट चेक, मैच किए गए ऑफर्स।',
      },
      te: {
        title: 'MSME లు, సెల్ఫ్-ఎంప్లాయ్డ్ కోసం బిజినెస్ లోన్ — ఆఫర్స్ కంపేర్ చేయండి | SwiftLoan.ai',
        description:
          'MSME లు, స్టార్టప్స్, సెల్ఫ్-ఎంప్లాయ్డ్ ప్రొఫెషనల్స్ కోసం ₹1 లక్ష నుండి ₹75 లక్షల వరకు వర్కింగ్ క్యాపిటల్, గ్రోత్ ఫండింగ్. సాఫ్ట్ క్రెడిట్ చెక్, మ్యాచ్ అయిన ఆఫర్స్.',
      },
    },
  },
  {
    path: '/emi-calculator',
    title: 'EMI Calculator — personal & business loan EMI, interest and total cost | SwiftLoan.ai',
    description:
      'Free EMI calculator: your monthly EMI, total interest and repayment for any loan amount, rate and tenure, with the formula, an example and tips to lower it.',
    priority: 0.9,
    changeFrequency: 'monthly',
    i18n: {
      hi: {
        title: 'EMI कैलकुलेटर — पर्सनल और बिज़नेस लोन की EMI, ब्याज और कुल खर्च | SwiftLoan.ai',
        description:
          'मुफ़्त EMI कैलकुलेटर: किसी भी लोन अमाउंट, ब्याज दर और अवधि के लिए मासिक EMI, कुल ब्याज और कुल भुगतान, साथ में फ़ॉर्मूला, उदाहरण और EMI कम करने के तरीके।',
      },
      te: {
        title: 'EMI కాలిక్యులేటర్ — పర్సనల్, బిజినెస్ లోన్ EMI, వడ్డీ, మొత్తం ఖర్చు | SwiftLoan.ai',
        description:
          'ఉచిత EMI కాలిక్యులేటర్: ఏ లోన్ మొత్తం, వడ్డీ రేటు, కాలవ్యవధికైనా మీ నెలవారీ EMI, మొత్తం వడ్డీ, మొత్తం చెల్లింపు; ఫార్ములా, ఉదాహరణ, EMI తగ్గించే చిట్కాలతో.',
      },
    },
  },
  {
    path: '/faqs',
    title: 'Personal & business loan FAQs — eligibility, charges, credit score | SwiftLoan.ai',
    description:
      'Answers on loan eligibility, credit-score impact, documents, charges, approval time and data safety when you compare loan offers on SwiftLoan.ai.',
    priority: 0.8,
    changeFrequency: 'monthly',
    i18n: {
      hi: {
        title: 'पर्सनल और बिज़नेस लोन के सवाल-जवाब — पात्रता, शुल्क, क्रेडिट स्कोर | SwiftLoan.ai',
        description:
          'SwiftLoan.ai पर लोन ऑफर्स कम्पेयर करते समय पात्रता, क्रेडिट स्कोर पर असर, दस्तावेज़, शुल्क, मंज़ूरी में लगने वाला समय और डेटा सुरक्षा से जुड़े सवालों के जवाब।',
      },
      te: {
        title: 'పర్సనల్, బిజినెస్ లోన్ ప్రశ్నలు — అర్హత, రుసుములు, క్రెడిట్ స్కోర్ | SwiftLoan.ai',
        description:
          'SwiftLoan.aiలో లోన్ ఆఫర్స్ కంపేర్ చేసేటప్పుడు అర్హత, క్రెడిట్ స్కోర్‌పై ప్రభావం, డాక్యుమెంట్లు, రుసుములు, ఆమోదానికి పట్టే సమయం, డేటా భద్రతపై ప్రశ్నలకు సమాధానాలు.',
      },
    },
  },
  {
    path: '/support',
    title: 'Support — SwiftLoan.ai',
    description:
      'Get help with SwiftLoan: your account, application, offers, repayments or privacy, and how to raise a grievance.',
    priority: 0.5,
    changeFrequency: 'monthly',
  },
  {
    path: '/compliance',
    title: 'Compliance & Regulatory — SwiftLoan.ai',
    description:
      'How SwiftLoan.ai follows the RBI Digital Lending Directions: our role as a Lending Service Provider, Key Fact Statement, fees, cooling-off period and data protection.',
    priority: 0.4,
    changeFrequency: 'yearly',
  },
  {
    path: '/privacy-policy',
    title: 'Privacy Policy — SwiftLoan.ai',
    description:
      'How Purpletalk India Private Limited ("SwiftLoan") collects, uses, stores, shares and protects your personal information, and how you stay in control of it.',
    priority: 0.3,
    changeFrequency: 'yearly',
  },
];

/** Every page Google should index: feeds sitemap.xml and pageMetadata(). */
export const PUBLIC_PAGES: PublicPage[] = [...CORE_PAGES, ...DOCS_PAGES, ...PURPOSE_PAGES];

/**
 * Paths Google must not index: the signed-in account, the application steps (personal data,
 * no value as a search result), partner hand-backs and internal tools.
 */
export const PRIVATE_PATHS = ['/account', '/apply', '/partner', '/dev', '/brand', '/logo', '/applink'];

export const NOINDEX: Metadata['robots'] = { index: false, follow: false };

export const SHARE_IMAGE = { url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: 'SwiftLoan.ai — loans matched to the right lender' };

/** A page's full address in one language: ('/faqs', 'hi') → https://swiftloan.ai/hi/faqs; the home page has no trailing slash. */
export function pageUrl(path: string, lang: Lang = DEFAULT_LANG): string {
  const p = withLang(path, lang);
  return `${SITE_URL}${p === '/' ? '' : p}`;
}

/**
 * The hreflang set of a page that has language versions: en-IN, hi-IN, te-IN and x-default (English).
 * The same set goes on every version, so each one points at the others and at itself.
 */
export function languageAlternates(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of ALL_LANGS) out[LOCALE_TAGS[l].hreflang] = pageUrl(path, l);
  out['x-default'] = pageUrl(path, DEFAULT_LANG);
  return out;
}

/**
 * Title, description, canonical, hreflang and share tags for one public page, in one language.
 * English is the default; 'hi' / 'te' need the page's `i18n` entry (an English-only page throws).
 */
export function pageMetadata(path: string, lang: Lang = DEFAULT_LANG): Metadata {
  const page = PUBLIC_PAGES.find((p) => p.path === path);
  if (!page) throw new Error(`seo: ${path} is not in PUBLIC_PAGES`);
  const text = lang === 'en' ? page : page.i18n?.[lang];
  if (!text) throw new Error(`seo: ${path} has no ${lang} version (no i18n on its PUBLIC_PAGES entry)`);
  const url = pageUrl(path, lang);
  return {
    title: text.title,
    description: text.description,
    // Each version is its own canonical; hreflang ties the versions together.
    alternates: { canonical: url, ...(page.i18n ? { languages: languageAlternates(path) } : {}) },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: LOCALE_TAGS[lang].ogLocale,
      ...(page.i18n ? { alternateLocale: ALL_LANGS.filter((l) => l !== lang).map((l) => LOCALE_TAGS[l].ogLocale) } : {}),
      url,
      title: text.title,
      description: text.description,
      images: [SHARE_IMAGE],
    },
    twitter: { card: 'summary_large_image', title: text.title, description: text.description, images: [SHARE_IMAGE.url] },
  };
}

/* ───────────── structured data (schema.org JSON-LD) ───────────── */

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    legalName: LEGAL_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.png`,
    description:
      'SwiftLoan.ai is a Lending Service Provider: a loan aggregator that matches borrowers with RBI-registered lending partners. It does not lend directly.',
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: ['en-IN', 'hi-IN', 'te-IN'],
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

/** Pass the page's language so the questions are labelled with it (`inLanguage`). */
export function faqPageJsonLd(faqs: ReadonlyArray<{ q: string; a: string }>, lang?: Lang) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    ...(lang ? { inLanguage: LOCALE_TAGS[lang].hreflang } : {}),
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export function breadcrumbJsonLd(items: ReadonlyArray<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  };
}

/** The EMI calculator as a free web tool. `name` is the page's own name in its language. */
export function emiCalculatorAppJsonLd(lang: Lang = DEFAULT_LANG, name = 'SwiftLoan.ai EMI Calculator') {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name,
    url: pageUrl('/emi-calculator', lang),
    inLanguage: LOCALE_TAGS[lang].hreflang,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

/** A loan type we match people with. Amounts only: the rate is the lender's to set. */
export function loanProductJsonLd(args: { name: string; path: string; description: string; minAmount: number; maxAmount: number; lang?: Lang }) {
  const lang = args.lang ?? DEFAULT_LANG;
  return {
    '@context': 'https://schema.org',
    '@type': 'LoanOrCredit',
    name: args.name,
    url: pageUrl(args.path, lang),
    inLanguage: LOCALE_TAGS[lang].hreflang,
    description: args.description,
    currency: 'INR',
    amount: { '@type': 'MonetaryAmount', currency: 'INR', minValue: args.minAmount, maxValue: args.maxAmount },
    provider: { '@id': `${SITE_URL}/#organization` },
    areaServed: { '@type': 'Country', name: 'India' },
  };
}

/** JSON for a <script type="application/ld+json">, safe against `</script>` inside text. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
