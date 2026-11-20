// The bottom menu stayed in English whatever the app language. Its drawn text now follows the
// language, while the tab NAMES the voice agent uses stay in English so its controls are not renamed.
import React from 'react';
import { act, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import { STR } from '../src/i18n/strings';
import { useStore } from '../src/state/store';
import { BottomNav } from '../src/components/Frame';
import { NAV_TABS, tabLabelForScreen } from '../src/components/navTabs';
import { listTargets } from '../src/voice/actionRegistry';

let store: ReturnType<typeof useStore> | null = null;
function Probe() { store = useStore(); return null; }

describe('bottom menu language', () => {
  beforeEach(() => { jest.useFakeTimers(); store = null; });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it('every tab has text in English, Hindi and Telugu, and the English text is the tab name', () => {
    for (const tab of NAV_TABS) {
      expect(STR.en[tab.textKey]).toBe(tab.label);
      expect(STR.hi[tab.textKey]).toBeTruthy();
      expect(STR.te[tab.textKey]).toBeTruthy();
      expect(STR.hi[tab.textKey]).not.toBe(tab.label);
      expect(STR.te[tab.textKey]).not.toBe(tab.label);
    }
  });

  it.each(['hi', 'te'])('%s: the menu is drawn in that language, and the agent still sees the English tab names', async (lang) => {
    const r = renderWithProviders(<><Probe /><BottomNav /></>);
    await waitFor(() => expect(store).not.toBeNull());
    await act(async () => { store!.set({ screen: 'home', lang }); });

    for (const tab of NAV_TABS) {
      await waitFor(() => expect(r.getByText(STR[lang][tab.textKey])).toBeTruthy());
      expect(r.queryByText(tab.label)).toBeNull();
    }
    // what the voice agent is offered: unchanged English names
    expect(tabLabelForScreen('fare')).toBe('My Offers');
    const labels = listTargets('home').filter(t => t.id.startsWith('nav:')).map(t => t.label);
    expect(labels.sort()).toEqual(['Home', 'My Loans', 'My Offers', 'Profile']);
    r.unmount();
  });
});
