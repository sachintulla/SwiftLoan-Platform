import type { Metadata } from 'next';
import { Hero } from '@/components/home/Hero';
import { StatsBar } from '@/components/home/StatsBar';
import { Offers } from '@/components/home/Offers';
import { Journey } from '@/components/home/Journey';
import { EmiCalculator } from '@/components/home/EmiCalculator';
import { LspRole } from '@/components/home/LspRole';
import { Testimonials } from '@/components/home/Testimonials';
import { LeadForm } from '@/components/home/LeadForm';
import { ClosingCta } from '@/components/home/ClosingCta';

const title = 'SwiftLoan.ai — AI loan matching across 18+ RBI-registered lenders';
const description =
  'Compare personal & business loan offers matched by AI. Soft credit check, 3-minute application, 100% paperless. ₹50K–₹75L from RBI-registered lending partners.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description },
};

/**
 * Section order is the design package's, unchanged — LeadForm deliberately sits
 * before the calculator so the conversion point comes early on mobile. Hero
 * additionally carries its own compact inline form so the conversion point is
 * also reachable without scrolling at all.
 */
export default function HomePage() {
  return (
    <main>
      <h1 className="sr-only">SwiftLoan.ai — smarter borrowing, matched to the right lender</h1>
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
