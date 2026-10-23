import React from 'react';
import { Share, NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import Referral from '../src/screens/referral';
import { SCREENS } from '../src/screens';
import { SCREEN_NAMES, PREV_MAP } from '../src/state/store';
import { api } from '../src/api/client';
import { readInstallSignals } from '../src/utils/installSignals';
import { loadPendingReferral, savePendingReferral, clearPendingReferral } from '../src/state/session';

const SUMMARY = {
  data: {
    code: 'PRIYA7K2',
    shareUrl: 'https://api.example.com/dl?ref=PRIYA7K2',
    stats: { invited: 2, applied: 1, disbursed: 0 },
    referrals: [
      { id: '1', name: 'Rahul S.', status: 'applied', createdAt: '2026-10-09T00:00:00Z' },
      { id: '2', name: '•••• 0012', status: 'signed_up', createdAt: '2026-10-09T00:00:00Z' },
    ],
  },
};

describe('Refer a friend screen', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is registered as a screen with a back target', () => {
    expect(SCREEN_NAMES).toContain('referral');
    expect(SCREENS.referral).toBeDefined();
    expect(PREV_MAP.referral).toBe('profile');
  });

  it('shows the code, stats and friends, and shares the link', async () => {
    jest.spyOn(api, 'referralMe').mockResolvedValue(SUMMARY as any);
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any);
    const { findByText, getByText } = renderWithProviders(<Referral />);

    expect(await findByText('PRIYA7K2')).toBeTruthy();
    expect(getByText('Rahul S.')).toBeTruthy();
    expect(getByText('•••• 0012')).toBeTruthy();

    fireEvent.press(getByText('Share invite'));
    expect(share).toHaveBeenCalledTimes(1);
    expect((share.mock.calls[0][0] as any).message).toContain('https://api.example.com/dl?ref=PRIYA7K2');
  });

  it('shows an empty state when nobody has joined yet', async () => {
    jest.spyOn(api, 'referralMe').mockResolvedValue({ data: { ...SUMMARY.data, stats: { invited: 0, applied: 0, disbursed: 0 }, referrals: [] } } as any);
    const { findByText } = renderWithProviders(<Referral />);
    expect(await findByText(/No friends yet/)).toBeTruthy();
  });

  it('offers a retry when the request fails', async () => {
    const spy = jest.spyOn(api, 'referralMe').mockRejectedValue(new Error('offline'));
    const { findByText } = renderWithProviders(<Referral />);
    expect(await findByText('Could not load your referral details.')).toBeTruthy();
    expect(spy).toHaveBeenCalled();
  });
});

describe('install signals', () => {
  const original = Platform.OS;
  afterEach(() => { (Platform as any).OS = original; delete (NativeModules as any).InstallReferrer; delete (NativeModules as any).Attribution; });

  it('reads the Play Install Referrer on Android', async () => {
    (Platform as any).OS = 'android';
    (NativeModules as any).InstallReferrer = { getInstallReferrer: jest.fn().mockResolvedValue('click_id=ABCD2345XYZ9&ref=PRIYA7K2') };
    expect((await readInstallSignals()).installReferrer).toBe('click_id=ABCD2345XYZ9&ref=PRIYA7K2');
  });

  it('reads the clipboard token on iOS', async () => {
    (Platform as any).OS = 'ios';
    (NativeModules as any).Attribution = { readClipboardToken: jest.fn().mockResolvedValue('swiftloan-ref:ABCD2345XYZ9') };
    expect((await readInstallSignals()).clipboard).toBe('swiftloan-ref:ABCD2345XYZ9');
  });

  it('survives a missing or throwing native module', async () => {
    (Platform as any).OS = 'android';
    expect((await readInstallSignals()).installReferrer).toBeNull();
    (NativeModules as any).InstallReferrer = { getInstallReferrer: jest.fn().mockRejectedValue(new Error('boom')) };
    expect((await readInstallSignals()).installReferrer).toBeNull();
  });
});

describe('pending referral storage', () => {
  beforeEach(() => AsyncStorage.clear());

  it('round-trips and clears', async () => {
    expect(await loadPendingReferral()).toBeNull();
    await savePendingReferral({ code: 'PRIYA7K2', downloadId: 'd1', method: 'clipboard' });
    expect(await loadPendingReferral()).toEqual({ code: 'PRIYA7K2', downloadId: 'd1', method: 'clipboard' });
    await clearPendingReferral();
    expect(await loadPendingReferral()).toBeNull();
  });
});
