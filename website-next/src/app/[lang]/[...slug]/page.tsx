import type { Metadata } from 'next';
import { LocalizedPage, localizedMetadata, localizedStaticParams } from '../localizedRoute';

/** /hi/<page> and /te/<page> — every page that has language versions. How it works: ../localizedPages.tsx. */
export const dynamicParams = false; // unknown language or a page with no language version → 404

export function generateStaticParams() {
  return localizedStaticParams().filter((p) => p.slug.length > 0);
}

export function generateMetadata({ params }: { params: { lang: string; slug: string[] } }): Metadata {
  return localizedMetadata(params);
}

export default function Page({ params }: { params: { lang: string; slug: string[] } }) {
  return <LocalizedPage params={params} />;
}
