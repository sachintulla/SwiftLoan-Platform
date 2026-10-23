import React from 'react';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { waitFor } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import { claimInstall } from '../src/api/client';
import { loadPendingReferral, loadInstallClaimed } from '../src/state/session';

jest.mock('../src/api/client', () => ({
  ...jest.requireActual('../src/api/client'),
  claimInstall: jest.fn(),
}));

// The store attributes the install once per process, on its first mount — so this
// file mounts it exactly once.
describe('first-launch install attribution', () => {
  it('claims the install, flags it done, and keeps the friend\'s code for sign-in', async () => {
    await AsyncStorage.clear();
    (claimInstall as jest.Mock).mockResolvedValue({
      matched: true, method: 'clipboard', download_id: 'd1', source: 'referral',
      referral: { code: 'PRIYA7K2', referrer_name: 'Priya S.' },
    });

    renderWithProviders(<Text>boot</Text>);

    await waitFor(async () => expect(await loadInstallClaimed()).toBe(true));
    expect(claimInstall).toHaveBeenCalledTimes(1);
    expect(await loadPendingReferral()).toEqual({ code: 'PRIYA7K2', downloadId: 'd1', method: 'clipboard' });
  });
});
