import { Hero } from '@/components/home/Hero';
import { StatsBar } from '@/components/home/StatsBar';
import { Offers } from '@/components/home/Offers';
import { Journey } from '@/components/home/Journey';
import { EmiCalculator } from '@/components/home/EmiCalculator';
import { LspRole } from '@/components/home/LspRole';
import { Testimonials } from '@/components/home/Testimonials';
import { LeadForm } from '@/components/home/LeadForm';
import { ClosingCta } from '@/components/home/ClosingCta';
import { defineCopy } from '@/lib/copy';
import type { Lang } from '@/lib/locale';

/** The page's one (screen-reader / search-engine) heading. Hindi and Telugu follow the hero's own headline. */
const headingCopy = defineCopy({
  en: 'SwiftLoan.ai — smarter borrowing, matched to the right lender',
  hi: 'SwiftLoan.ai — समझदारी से लोन लें, सही लेंडर के साथ मैच करके',
  te: 'SwiftLoan.ai — తెలివైన రుణం, సరైన లెండర్‌తో మ్యాచ్ అయ్యింది',
});

/**
 * The home page, for / (English) and /hi, /te.
 *
 * Section order is the design package's, unchanged — LeadForm deliberately sits
 * before the calculator so the conversion point comes early on mobile. Hero
 * additionally carries its own compact inline form so the conversion point is
 * also reachable without scrolling at all.
 */
export function HomePageContent({ lang }: { lang: Lang }) {
  return (
    <main>
      <h1 className="sr-only">{headingCopy[lang]}</h1>
      <Hero />
      <StatsBar />
      <Offers />
      <Journey />
      <LeadForm />
      <EmiCalculator />
      <LspRole />
      <Testimonials />
      <ClosingCta />
    </main>
  );
}
