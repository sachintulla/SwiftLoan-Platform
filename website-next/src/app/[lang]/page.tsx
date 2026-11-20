import type { Metadata } from 'next';
import { LocalizedPage, localizedMetadata, localizedStaticParams } from './localizedRoute';

/** /hi and /te — the home page in Hindi and Telugu. How language versions work: ./localizedPages.tsx. */
export const dynamicParams = false; // anything else at /<one segment> that is not a real page is a 404

export function generateStaticParams() {
  return localizedStaticParams().filter((p) => p.slug.length === 0).map((p) => ({ lang: p.lang }));
}

export function generateMetadata({ params }: { params: { lang: string } }): Metadata {
  return localizedMetadata(params);
}

export default function Page({ params }: { params: { lang: string } }) {
  return <LocalizedPage params={params} />;
}
