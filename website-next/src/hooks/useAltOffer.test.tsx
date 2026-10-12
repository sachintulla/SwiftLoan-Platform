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
      <button onClick={alt.open}>open</button>
      <button onClick={alt.markOpened}>mark</button>
      <button onClick={alt.askNow}>ask-now</button>
      <button onClick={alt.check}>check</button>
      {alt.error && <p role="alert">{alt.error}</p>}
      {alt.added && <p role="status">added</p>}
      <AltOfferConfirm open={alt.asking} onAnswer={alt.answer} />
    </div>
  );
}

function fakeWindow() {
  return { opener: 'x' as unknown, location: { href: '' }, close: vi.fn(), document: { title: '', body: { style: { cssText: '' }, textContent: '' } } };
}
const setPending = (ago: number, applicationId = 'app-1') =>
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ applicationId, openedAt: Date.now() - ago }));

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

describe('open in a new tab (used when the partner forbids framing)', () => {
  it('opens the tab inside the click, then points it at the minted URL and remembers it', async () => {
    const win = fakeWindow();
    const open = vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    render(<Harness applicationId="app-1" />);
    fireEvent.click(screen.getByText('open'));
    expect(open).toHaveBeenCalledWith('', '_blank'); // synchronous → popup blockers allow it
    expect(win.opener).toBeNull();
    await waitFor(() => expect(win.location.href).toBe('https://partner.test/j?t=1'));
    expect(JSON.parse(sessionStorage.getItem(PENDING_KEY)!).applicationId).toBe('app-1');
  });

  it('continues in the same tab when the popup is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const assign = vi.fn();
    const real = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...real, assign } });
    try {
      render(<Harness applicationId="app-1" />);
      fireEvent.click(screen.getByText('open'));
      await waitFor(() => expect(assign).toHaveBeenCalledWith('https://partner.test/j?t=1'));
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: real });
    }
  });

  it.each([
    ['partner unavailable', () => api.requestAltOffer.mockResolvedValue({ available: false, redirectUrl: null })],
    ['request error', () => api.requestAltOffer.mockRejectedValue(new Error('401'))],
  ])('closes the blank tab and reports %s', async (_n, arrange) => {
    arrange();
    const win = fakeWindow();
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    render(<Harness applicationId="app-1" />);
    fireEvent.click(screen.getByText('open'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't open partner offers/);
    expect(win.close).toHaveBeenCalled();
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('ignores a second click while one is in flight', async () => {
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow() as unknown as Window);
    let release!: (v: unknown) => void;
    api.requestAltOffer.mockReturnValue(new Promise((r) => (release = r)));
    render(<Harness applicationId="app-1" />);
    fireEvent.click(screen.getByText('open'));
    fireEvent.click(screen.getByText('open'));
    expect(api.requestAltOffer).toHaveBeenCalledTimes(1);
    release({ available: false, redirectUrl: null });
    await screen.findByRole('alert');
  });
});

describe('"Did you proceed?" after the visitor was on the partner journey', () => {
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

  it('check() — used when leaving the Explore tab — asks only after enough time on the journey', async () => {
    render(<Harness applicationId="app-1" />);
    await act(async () => {});
    fireEvent.click(screen.getByText('mark')); // journey embedded just now
    fireEvent.click(screen.getByText('check'));
    expect(screen.queryByTestId('alt-confirm-yes')).toBeNull(); // too soon
    setPending(MIN_AWAY_MS + 1);
    fireEvent.click(screen.getByText('check'));
    expect(await screen.findByTestId('alt-confirm-yes')).toBeTruthy();
  });

  it('askNow() — the embedded return page reported the visitor is back — asks immediately', async () => {
    render(<Harness applicationId="app-1" />);
    await act(async () => {});
    fireEvent.click(screen.getByText('ask-now')); // nothing pending → nothing to ask
    expect(screen.queryByTestId('alt-confirm-yes')).toBeNull();
    fireEvent.click(screen.getByText('mark'));
    fireEvent.click(screen.getByText('ask-now'));
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
