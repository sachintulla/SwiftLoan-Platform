import type { MetadataRoute } from 'next';
import { PRIVATE_PATHS, SITE_URL } from '@/lib/seo';

/** /robots.txt — public pages open to every crawler; private and internal paths closed. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: PRIVATE_PATHS }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
