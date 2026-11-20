/** One public, indexable page. Lives apart from seo.ts so page-list files can import the type without a cycle. */
export interface PublicPage {
  path: string;
  title: string;
  description: string;
  /** sitemap hint, 0–1 */
  priority: number;
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  /**
   * Hindi and Telugu title + description, for pages that also exist at /hi/<path> and /te/<path>.
   * Leave out for pages that stay English only (legal text).
   */
  i18n?: { hi: { title: string; description: string }; te: { title: string; description: string } };
}
