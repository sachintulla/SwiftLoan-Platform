import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import UpshotWeb from '@/components/UpshotWeb';
import MetaPixel from '@/components/MetaPixel';
import VoiceWidget from '@/components/VoiceWidget';
import { LanguageProvider } from '@/lib/i18n';
import { Backdrop } from '@/components/site/Backdrop';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { Toaster } from '@/components/ui/sonner';
import { QuickCheckModal } from '@/components/home/QuickCheckModal';
import { HideOnAppRoutes } from '@/components/site/HideOnAppRoutes';
import { layerCssVars } from '@/lib/layers';
import { SITE_NAME, SITE_URL, SHARE_IMAGE, jsonLdString, organizationJsonLd, websiteJsonLd } from '@/lib/seo';
import './globals.css';
import './design.css';

// Self-hosted (not next/font/google) so builds don't depend on reaching
// fonts.googleapis.com — that fetch fails behind some corporate proxies/MITM certs.
// Design System 1.0: Inter for body and UI, Manrope for headlines, JetBrains Mono for
// figures. Inter is the copy from the design bundle (repo assets/fonts). Manrope is NOT in
// the repo yet: until its files are added here, headings use Inter (see --font-display).
const inter = localFont({
  src: [
    { path: './fonts/Inter-400.ttf', weight: '400', style: 'normal' },
    { path: './fonts/Inter-500.ttf', weight: '500', style: 'normal' },
    { path: './fonts/Inter-600.ttf', weight: '600', style: 'normal' },
    { path: './fonts/Inter-700.ttf', weight: '700', style: 'normal' },
    { path: './fonts/Inter-800.ttf', weight: '800', style: 'normal' },
  ],
  variable: '--font-inter',
  display: 'swap',
});
const jetbrainsMono = localFont({
  src: [
    { path: './fonts/JetBrainsMono-400.ttf', weight: '400', style: 'normal' },
    { path: './fonts/JetBrainsMono-500.ttf', weight: '500', style: 'normal' },
  ],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://swiftloan.ai'),
  title: 'SwiftLoan.ai — Fast · Fair · Secure loans, matched to the right lender',
  description:
    "SwiftLoan.ai uses intelligent qualification and AI lender matching to help you access personal and business loans faster — with transparent terms, bank-grade security, and full consent control.",
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%230CB6A6'/%3E%3Cstop offset='1' stop-color='%232FB183'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='120' height='120' rx='30' fill='url(%23g)'/%3E%3Cg stroke='white' stroke-linecap='round'%3E%3Cline x1='16' y1='43' x2='40' y2='43' stroke-width='6' opacity='.32'/%3E%3Cline x1='12' y1='60' x2='38' y2='60' stroke-width='6' opacity='.55'/%3E%3Cline x1='18' y1='77' x2='42' y2='77' stroke-width='6' opacity='.82'/%3E%3C/g%3E%3Cg transform='skewX(-7)'%3E%3Ctext x='82' y='87' text-anchor='middle' fill='white' font-family='Arial,sans-serif' font-size='84' font-weight='800'%3E%E2%82%B9%3C/text%3E%3C/g%3E%3C/svg%3E",
      },
    ],
    apple: '/icon.png',
  },
  applicationName: SITE_NAME,
  // Defaults for every page; public pages override title/description/canonical (lib/seo.ts pageMetadata).
  openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_IN', url: SITE_URL, images: [SHARE_IMAGE] },
  twitter: { card: 'summary_large_image' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0A3F41',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // lang stays "en" in the server's HTML for every page, the /hi and /te ones included: a root layout
    // cannot see the page's route params, and the ways around that (reading headers, or splitting the app
    // into two root layouts) would make pages dynamic or move every route. Those pages declare their
    // language on their own wrapper, header and footer instead, and LanguageProvider corrects this
    // attribute in the browser right after load. Google takes the language from hreflang + the text.
    // The font variables sit on <html> because the design tokens that use them (--font-sans,
    // --font-display in design.css) are defined on :root and resolve there.
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..0&display=swap"
          rel="stylesheet"
        />
        {/* The one stacking order for floating things (--z-ruby < --z-banner < --z-menu < --z-modal < …): lib/layers.ts. */}
        <style dangerouslySetInnerHTML={{ __html: layerCssVars() }} />
        {/* Who we are, for search engines (schema.org). Only confirmed facts: lib/seo.ts. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString([organizationJsonLd(), websiteJsonLd()]) }} />
      </head>
      <body>
        {/* Chrome from the new design package. LanguageProvider must wrap the
            page because every section reads its copy through useCopy(). */}
        <LanguageProvider>
          <HideOnAppRoutes>
            <Backdrop />
          </HideOnAppRoutes>
          <HideOnAppRoutes>
            <SiteHeader />
          </HideOnAppRoutes>
          {children}
          <HideOnAppRoutes>
            <SiteFooter />
          </HideOnAppRoutes>
          <Toaster />
          <HideOnAppRoutes>
            <QuickCheckModal />
          </HideOnAppRoutes>
        </LanguageProvider>
        {/* Platform integrations — deliberately outside the redesign: the voice
            widget and Upshot SDK are unchanged by it. Both stay mounted
            everywhere, including /apply and /account — VoiceWidget shifts its
            own floating button to the bottom-LEFT on the few pages that have
            a right-aligned sticky bottom CTA bar (Steps 1-3), so Ruby never
            sits on top of / eats clicks on that button. See its own
            `launcherSide()` for which routes those are. */}
        <UpshotWeb />
        <MetaPixel />
        <VoiceWidget />
      </body>
    </html>
  );
}
