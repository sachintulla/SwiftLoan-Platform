import React from 'react';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { waitFor } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import { claimInstall } from '../src/api/client';
import { loadInstallClaimed } from '../src/state/session';

jest.mock('../src/api/client', () => ({
  ...jest.requireActual('../src/api/client'),
  claimInstall: jest.fn(),
}));

// The store attributes the install once per process, on its first mount — so this
// file mounts it exactly once.
describe('first-launch install attribution', () => {
  it('claims the install once and flags it done', async () => {
    await AsyncStorage.clear();
    (claimInstall as jest.Mock).mockResolvedValue({
      matched: true, method: 'clipboard', download_id: 'd1', source: 'campaign',
    });

    renderWithProviders(<Text>boot</Text>);

    await waitFor(async () => expect(await loadInstallClaimed()).toBe(true));
    expect(claimInstall).toHaveBeenCalledTimes(1);
  });
});
