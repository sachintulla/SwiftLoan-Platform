// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fetchAltOffersEnabled: vi.fn(),
  requestAltOffer: vi.fn(),
  markAltOfferApplied: vi.fn(),
}));
vi.mock('@/lib/altOffers', () => api);

import { GetMoreOffers as Button } from './GetMoreOffers';
import { AltOfferConfirm } from './AltOfferConfirm';
import { useAltOffer } from '@/hooks/useAltOffer';
import { PENDING_KEY, MIN_AWAY_MS } from '@/lib/altOfferLogic';

/** Mirrors the offers page: ONE controller shared by every button, one confirmation dialog. */
function GetMoreOffers({ applicationId, variant, count = 1 }: { applicationId: string | null; variant?: 'default' | 'empty'; count?: number }) {
  const alt = useAltOffer(applicationId);
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Button key={i} alt={alt} variant={variant} />
      ))}
      <AltOfferConfirm open={alt.asking} onAnswer={alt.answer} />
    </>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  api.fetchAltOffersEnabled.mockResolvedValue(true);
  api.requestAltOffer.mockResolvedValue({ available: true, provider: 'ympl', status: 'token_issued', redirectUrl: 'https://partner.test/j?t=1' });
});
afterEach(() => {
  cleanup();
  Object.values(api).forEach((m) => m.mockReset());
});

const card = async () => (await screen.findAllByTestId('get-more-offers'))[0];

describe('Get more offers button', () => {
  it('shows a "Get more offers" button when the flag is on and there is an application', async () => {
    render(<GetMoreOffers applicationId="app-1" />);
    await card();
    expect(screen.getByRole('button', { name: /Get more offers/ })).toBeTruthy();
    expect(screen.getByText('Explore more lender offers picked for you')).toBeTruthy();
  });
  it('uses the "nothing matched" wording in the empty variant', async () => {
    render(<GetMoreOffers applicationId="app-1" variant="empty" />);
    await card();
    expect(screen.getByText(/No matches here right now/)).toBeTruthy();
  });
  it('renders nothing when the flag is off', async () => {
    api.fetchAltOffersEnabled.mockResolvedValue(false);
    render(<GetMoreOffers applicationId="app-1" />);
    await act(async () => {});
    expect(screen.queryByTestId('get-more-offers')).toBeNull();
  });
  it('renders nothing without an application', async () => {
    render(<GetMoreOffers applicationId={null} />);
    await act(async () => {});
    expect(screen.queryByTestId('get-more-offers')).toBeNull();
  });
  it('is a gated voice action', async () => {
    render(<GetMoreOffers applicationId="app-1" />);
    expect((await card()).querySelector('button')!.getAttribute('data-voice-gate')).toBe('explore-lenders');
  });

  it('click → redirects this tab to the partner journey and shows progress', async () => {
    const assign = vi.fn();
    const real = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...real, assign } });
    try {
      render(<GetMoreOffers applicationId="app-1" />);
      const btn = (await card()).querySelector('button')!;
      fireEvent.click(btn);
      await waitFor(() => expect(assign).toHaveBeenCalledWith('https://partner.test/j?t=1'));
      expect(btn.getAttribute('aria-busy')).toBe('true');
      expect(screen.getByText('Taking you to our partner…')).toBeTruthy();
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: real });
    }
  });

  it('shows an error and stays when the partner is unavailable', async () => {
    api.requestAltOffer.mockResolvedValue({ available: false, redirectUrl: null });
    render(<GetMoreOffers applicationId="app-1" />);
    fireEvent.click((await card()).querySelector('button')!);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't open partner offers/);
  });

  it('can appear at the top AND the bottom of the page: both work, and there is a single question', async () => {
    render(<GetMoreOffers applicationId="app-1" count={2} />);
    await screen.findAllByTestId('get-more-offers');
    expect(screen.getAllByRole('button', { name: /Get more offers/ })).toHaveLength(2);

    const assign = vi.fn();
    const real = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...real, assign } });
    try {
      fireEvent.click(screen.getAllByRole('button', { name: /Get more offers/ })[0]);
      await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
      // both buttons reflect that a visit is in progress
      screen.getAllByRole('button', { name: /Get more offers|Taking you/ }).forEach((b) => expect(b.getAttribute('aria-busy')).toBe('true'));
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: real });
    }
  });

  it('asks "did you proceed?" only once even with two buttons on the page', async () => {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ applicationId: 'app-1', openedAt: Date.now() - MIN_AWAY_MS - 5000 }));
    render(<GetMoreOffers applicationId="app-1" count={2} />);
    await screen.findAllByTestId('get-more-offers');
    expect(await screen.findAllByTestId('alt-confirm-yes')).toHaveLength(1);
  });
});
