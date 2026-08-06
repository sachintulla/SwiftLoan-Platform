import { redirect } from 'next/navigation';

/**
 * Analytics was merged into Master Overview as its "Trends" section — two nav
 * entries answering the same question was one too many.
 *
 * Kept as a redirect rather than deleted so existing bookmarks, the voice
 * widget's page map, and anything else pointing at /analytics still land
 * somewhere useful instead of a 404.
 */
export default function AnalyticsPage() {
  redirect('/overview');
}
