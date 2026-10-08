import type { Screen as ScreenName } from '../state/store';

// Bottom tab bar: Home · Offers · Support (centre, raised Ruby avatar) · My Loans · Profile.
// Kept in its own file so the voice tools can name a tab without importing Frame.tsx (which
// imports the voice layer — that would be a cycle).
export type TabDef = { key: ScreenName | 'support'; icon: string; label: string };

export const NAV_TABS: TabDef[] = [
  { key: 'home', icon: 'home', label: 'Home' },
  { key: 'fare', icon: 'local_offer', label: 'My Offers' },
  { key: 'support', icon: 'support_agent', label: 'Support' },
  { key: 'loans', icon: 'description', label: 'My Loans' },
  { key: 'profile', icon: 'person', label: 'Profile' },
];

/** The tab label for a screen that has one (Home, My Offers, My Loans, Profile). */
export function tabLabelForScreen(screen: string): string | undefined {
  return NAV_TABS.find(t => t.key === screen && t.key !== 'support')?.label;
}
