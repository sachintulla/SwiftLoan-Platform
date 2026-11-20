import type { Screen as ScreenName } from '../state/store';

// Bottom tab bar: Home · Offers · Support (centre, raised Ruby avatar) · My Loans · Profile.
// Kept in its own file so the voice tools can name a tab without importing Frame.tsx (which
// imports the voice layer — that would be a cycle).
// `label` is the tab's fixed English NAME: what the voice agent and its tools call the tab, in every
// app language. `textKey` is the entry in i18n/strings.ts for the text DRAWN under the icon, which
// follows the app language. Keep the two apart: translating `label` would rename the agent's controls.
export type TabDef = { key: ScreenName | 'support'; icon: string; label: string; textKey: string };

export const NAV_TABS: TabDef[] = [
  { key: 'home', icon: 'home', label: 'Home', textKey: 'navHome' },
  { key: 'fare', icon: 'local_offer', label: 'My Offers', textKey: 'myOffersTitle' },
  { key: 'support', icon: 'support_agent', label: 'Support', textKey: 'navSupport' },
  { key: 'loans', icon: 'description', label: 'My Loans', textKey: 'loansTitle' },
  { key: 'profile', icon: 'person', label: 'Profile', textKey: 'navProfile' },
];

/** The tab label for a screen that has one (Home, My Offers, My Loans, Profile). */
export function tabLabelForScreen(screen: string): string | undefined {
  return NAV_TABS.find(t => t.key === screen && t.key !== 'support')?.label;
}
