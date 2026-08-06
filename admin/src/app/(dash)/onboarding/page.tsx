import { redirect } from 'next/navigation';

/**
 * Onboarding Journeys was folded into Customers 360.
 *
 * It answered "where do users drop off between install and the home screen",
 * which Customers 360 now answers better: across every channel rather than just
 * the app, and per person rather than per session. Its `stalledMinutes` filter
 * is the direct replacement for the old drop-off table.
 *
 * Kept as a redirect rather than deleted so bookmarks, the voice widget's page
 * map, and any link in the wild still land somewhere useful.
 */
export default function OnboardingPage() {
  redirect('/customers?stalledMinutes=60');
}
