// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fetchAltOffersEnabled: vi.fn(),
  requestAltOffer: vi.fn(),
  markAltOfferApplied: vi.fn(),
}));
vi.mock('@/lib/altOffers', () => api);

import { AltOfferCard } from './AltOfferCard';
import { PENDING_KEY, MIN_AWAY_MS } from '@/lib/altOfferLogic';

function fakeWindow() {
  return {
    opener: 'x' as unknown,
    location: { href: '' },
    close: vi.fn(),
    document: { title: '', body: { style: { cssText: '' }, textContent: '' } },
  };
}

beforeEach(() => {
  sessionStorage.clear();
  api.fetchAltOffersEnabled.mockResolvedValue(true);
  api.requestAltOffer.mockResolvedValue({ available: true, provider: 'ympl', status: 'token_issued', redirectUrl: 'https://partner.test/journey?t=1' });
  api.markAltOfferApplied.mockResolvedValue({ applied: true, appliedAt: 'now', lender: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.values(api).forEach((m) => m.mockReset());
});

const tile = () => screen.findByTestId('alt-offer-card');

describe('AltOfferCard visibility (mirrors the app: needs flag + application)', () => {
  it('renders when the server flag is on and there is an application', async () => {
    render(<AltOfferCard applicationId="app-1" />);
    expect(await tile()).toBeTruthy();
    expect(screen.getByText('More offers')).toBeTruthy();
  });
  it('uses the "Other offers" wording in the empty (no matches) variant', async () => {
    render(<AltOfferCard applicationId="app-1" variant="empty" />);
    await tile();
    expect(screen.getByText('Other offers')).toBeTruthy();
  });
  it('renders nothing when the flag is off', async () => {
    api.fetchAltOffersEnabled.mockResolvedValue(false);
    render(<AltOfferCard applicationId="app-1" />);
    await act(async () => {});
    expect(screen.queryByTestId('alt-offer-card')).toBeNull();
  });
  it('renders nothing without an application', async () => {
    render(<AltOfferCard applicationId={null} />);
    await act(async () => {});
    expect(screen.queryByTestId('alt-offer-card')).toBeNull();
  });
  it('is marked as a gated voice action', async () => {
    render(<AltOfferCard applicationId="app-1" />);
    const btn = (await tile()).querySelector('button')!;
    expect(btn.getAttribute('data-voice-gate')).toBe('explore-lenders');
  });
});

describe('opening the partner journey', () => {
  it('opens the tab inside the click, then sends it to the minted URL and remembers it for the return question', async () => {
    const win = fakeWindow();
    const open = vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    render(<AltOfferCard applicationId="app-1" />);
    fireEvent.click((await tile()).querySelector('button')!);
    // the tab was opened synchronously (before the API call resolved) so popup blockers allow it
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(win.opener).toBeNull();
    await waitFor(() => expect(win.location.href).toBe('https://partner.test/journey?t=1'));
    expect(api.requestAltOffer).toHaveBeenCalledWith('app-1');
    expect(JSON.parse(sessionStorage.getItem(PENDING_KEY)!).applicationId).toBe('app-1');
  });

  it('continues in the same tab when the popup is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const assign = vi.fn();
    const realLocation = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, assign } });
    try {
      render(<AltOfferCard applicationId="app-1" />);
      fireEvent.click((await tile()).querySelector('button')!);
      await waitFor(() => expect(assign).toHaveBeenCalledWith('https://partner.test/journey?t=1'));
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
    }
  });

  it('closes the blank tab and shows an error when the partner is unavailable', async () => {
    const win = fakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    api.requestAltOffer.mockResolvedValue({ available: false, provider: 'ympl', status: 'disabled', redirectUrl: null });
    render(<AltOfferCard applicationId="app-1" />);
    fireEvent.click((await tile()).querySelector('button')!);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't open partner offers/);
    expect(win.close).toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('closes the blank tab and shows an error when the request throws', async () => {
    const win = fakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    api.requestAltOffer.mockRejectedValue(new Error('401'));
    render(<AltOfferCard applicationId="app-1" />);
    fireEvent.click((await tile()).querySelector('button')!);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(win.close).toHaveBeenCalled();
  });

  it('ignores a second click while one is in flight', async () => {
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow() as unknown as Window);
    let release!: (v: unknown) => void;
    api.requestAltOffer.mockReturnValue(new Promise((r) => (release = r)));
    render(<AltOfferCard applicationId="app-1" />);
    const btn = (await tile()).querySelector('button')!;
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(api.requestAltOffer).toHaveBeenCalledTimes(1);
    release({ available: false, redirectUrl: null });
    await screen.findByRole('alert');
  });
});

describe('"Did you proceed?" when the visitor comes back', () => {
  const setPending = (ago: number, applicationId = 'app-1') =>
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ applicationId, openedAt: Date.now() - ago }));

  it('asks after a real absence, and "Yes" records the application', async () => {
    setPending(MIN_AWAY_MS + 5_000);
    render(<AltOfferCard applicationId="app-1" />);
    fireEvent.click(await screen.findByTestId('alt-confirm-yes'));
    await waitFor(() => expect(api.markAltOfferApplied).toHaveBeenCalledWith('app-1'));
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
    expect((await screen.findByRole('status')).textContent).toMatch(/Added to My Applications/);
  });

  it('"Not yet" clears the question without recording anything', async () => {
    setPending(MIN_AWAY_MS + 5_000);
    render(<AltOfferCard applicationId="app-1" />);
    fireEvent.click(await screen.findByTestId('alt-confirm-no'));
    await waitFor(() => expect(screen.queryByTestId('alt-confirm-no')).toBeNull());
    expect(api.markAltOfferApplied).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('does not ask after a quick tab flick', async () => {
    setPending(1_000);
    render(<AltOfferCard applicationId="app-1" />);
    await tile();
    expect(screen.queryByTestId('alt-confirm-yes')).toBeNull();
  });

  it('does not ask for a different application', async () => {
    setPending(MIN_AWAY_MS + 5_000, 'other-app');
    render(<AltOfferCard applicationId="app-1" />);
    await tile();
    expect(screen.queryByTestId('alt-confirm-yes')).toBeNull();
  });

  it('asks when the tab becomes visible again (new-tab flow)', async () => {
    render(<AltOfferCard applicationId="app-1" />);
    await tile();
    expect(screen.queryByTestId('alt-confirm-yes')).toBeNull();
    setPending(MIN_AWAY_MS + 5_000);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await screen.findByTestId('alt-confirm-yes')).toBeTruthy();
  });

  it('Escape counts as "Not yet"', async () => {
    setPending(MIN_AWAY_MS + 5_000);
    render(<AltOfferCard applicationId="app-1" />);
    await screen.findByTestId('alt-confirm-yes');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('alt-confirm-yes')).toBeNull());
    expect(api.markAltOfferApplied).not.toHaveBeenCalled();
  });
});
