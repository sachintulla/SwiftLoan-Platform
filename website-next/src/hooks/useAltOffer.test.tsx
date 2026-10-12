// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fetchAltOffersEnabled: vi.fn(),
  requestAltOffer: vi.fn(),
  markAltOfferApplied: vi.fn(),
}));
vi.mock('@/lib/altOffers', () => api);

import { useAltOffer } from './useAltOffer';
import { AltOfferConfirm } from '@/components/apply/AltOfferConfirm';
import { PENDING_KEY, MIN_AWAY_MS } from '@/lib/altOfferLogic';

function Harness({ applicationId }: { applicationId: string | null }) {
  const alt = useAltOffer(applicationId);
  return (
    <div>
      <span data-testid="available">{String(alt.available)}</span>
      <span data-testid="opening">{String(alt.opening)}</span>
      <button onClick={alt.open}>open</button>
      {alt.error && <p role="alert">{alt.error}</p>}
      {alt.added && <p role="status">added</p>}
      <AltOfferConfirm open={alt.asking} onAnswer={alt.answer} />
    </div>
  );
}

const setPending = (ago: number, applicationId = 'app-1') =>
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ applicationId, openedAt: Date.now() - ago }));

/** jsdom can't navigate; swap location for a recorder. */
function stubLocation() {
  const assign = vi.fn();
  const real = window.location;
  Object.defineProperty(window, 'location', { configurable: true, value: { ...real, assign } });
  return { assign, restore: () => Object.defineProperty(window, 'location', { configurable: true, value: real }) };
}

beforeEach(() => {
  sessionStorage.clear();
  api.fetchAltOffersEnabled.mockResolvedValue(true);
  api.requestAltOffer.mockResolvedValue({ available: true, provider: 'ympl', status: 'token_issued', redirectUrl: 'https://partner.test/j?t=1' });
  api.markAltOfferApplied.mockResolvedValue({ applied: true, appliedAt: 'now', lender: null });
});
afterEach(() => {
  cleanup();
  Object.values(api).forEach((m) => m.mockReset());
});

describe('availability (same rule as the app: server flag + an application)', () => {
  it('true with flag + application', async () => {
    render(<Harness applicationId="app-1" />);
    await waitFor(() => expect(screen.getByTestId('available').textContent).toBe('true'));
  });
  it('false when the flag is off', async () => {
    api.fetchAltOffersEnabled.mockResolvedValue(false);
    render(<Harness applicationId="app-1" />);
    await act(async () => {});
    expect(screen.getByTestId('available').textContent).toBe('false');
  });
  it('false without an application', async () => {
    render(<Harness applicationId={null} />);
    await act(async () => {});
    expect(screen.getByTestId('available').textContent).toBe('false');
  });
});

describe('Get more offers → the partner journey in this tab', () => {
  it('mints a fresh URL, remembers the visit, and navigates this tab (no popup, no iframe)', async () => {
    const open = vi.spyOn(window, 'open');
    const loc = stubLocation();
    try {
      render(<Harness applicationId="app-1" />);
      fireEvent.click(screen.getByText('open'));
      await waitFor(() => expect(loc.assign).toHaveBeenCalledWith('https://partner.test/j?t=1'));
      expect(api.requestAltOffer).toHaveBeenCalledWith('app-1');
      expect(open).not.toHaveBeenCalled();
      expect(JSON.parse(sessionStorage.getItem(PENDING_KEY)!).applicationId).toBe('app-1');
      // the page is being left — the button stays busy rather than flashing back to idle
      expect(screen.getByTestId('opening').textContent).toBe('true');
    } finally {
      loc.restore();
    }
  });

  it.each([
    ['partner unavailable', () => api.requestAltOffer.mockResolvedValue({ available: false, redirectUrl: null })],
    ['request error', () => api.requestAltOffer.mockRejectedValue(new Error('401'))],
  ])('stays on the page and reports %s', async (_n, arrange) => {
    arrange();
    const loc = stubLocation();
    try {
      render(<Harness applicationId="app-1" />);
      fireEvent.click(screen.getByText('open'));
      expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't open partner offers/);
      expect(loc.assign).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
      expect(screen.getByTestId('opening').textContent).toBe('false'); // can try again
    } finally {
      loc.restore();
    }
  });

  it('ignores a second click while one is in flight', async () => {
    let release!: (v: unknown) => void;
    api.requestAltOffer.mockReturnValue(new Promise((r) => (release = r)));
    render(<Harness applicationId="app-1" />);
    fireEvent.click(screen.getByText('open'));
    fireEvent.click(screen.getByText('open'));
    expect(api.requestAltOffer).toHaveBeenCalledTimes(1);
    release({ available: false, redirectUrl: null });
    await screen.findByRole('alert');
  });

  it('does nothing without an application', async () => {
    render(<Harness applicationId={null} />);
    fireEvent.click(screen.getByText('open'));
    expect(api.requestAltOffer).not.toHaveBeenCalled();
  });
});

describe('"Did you proceed?" when the visitor is back from the partner journey', () => {
  it('asks on arrival after a real absence; Yes records the application', async () => {
    setPending(MIN_AWAY_MS + 5_000);
    render(<Harness applicationId="app-1" />);
    fireEvent.click(await screen.findByTestId('alt-confirm-yes'));
    await waitFor(() => expect(api.markAltOfferApplied).toHaveBeenCalledWith('app-1'));
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
    expect(await screen.findByRole('status')).toBeTruthy();
  });

  it('"Not yet" clears it without recording', async () => {
    setPending(MIN_AWAY_MS + 5_000);
    render(<Harness applicationId="app-1" />);
    fireEvent.click(await screen.findByTestId('alt-confirm-no'));
    await waitFor(() => expect(screen.queryByTestId('alt-confirm-no')).toBeNull());
    expect(api.markAltOfferApplied).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('stays quiet after a quick flick or for another application', async () => {
    setPending(1_000);
    const { unmount } = render(<Harness applicationId="app-1" />);
    await act(async () => {});
    expect(screen.queryByTestId('alt-confirm-yes')).toBeNull();
    unmount();
    setPending(MIN_AWAY_MS + 5_000, 'other');
    render(<Harness applicationId="app-1" />);
    await act(async () => {});
    expect(screen.queryByTestId('alt-confirm-yes')).toBeNull();
  });

  it('asks when the tab becomes visible again', async () => {
    render(<Harness applicationId="app-1" />);
    await act(async () => {});
    setPending(MIN_AWAY_MS + 5_000);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await screen.findByTestId('alt-confirm-yes')).toBeTruthy();
  });

  it("asks when the browser's Back restores this page from its cache (pageshow)", async () => {
    render(<Harness applicationId="app-1" />);
    await act(async () => {});
    setPending(MIN_AWAY_MS + 5_000);
    await act(async () => {
      const e = new Event('pageshow') as Event & { persisted: boolean };
      e.persisted = true;
      window.dispatchEvent(e);
    });
    expect(await screen.findByTestId('alt-confirm-yes')).toBeTruthy();
  });

  it('Escape counts as "Not yet"', async () => {
    setPending(MIN_AWAY_MS + 5_000);
    render(<Harness applicationId="app-1" />);
    await screen.findByTestId('alt-confirm-yes');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('alt-confirm-yes')).toBeNull());
    expect(api.markAltOfferApplied).not.toHaveBeenCalled();
  });
});
