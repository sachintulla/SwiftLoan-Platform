// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ requestAltOffer: vi.fn() }));
vi.mock('@/lib/altOffers', () => api);

import { ExploreLenders, OffersTabs } from './ExploreLenders';

const mkAlt = (asking = false) => ({ open: vi.fn(), opening: false, error: null as string | null, markOpened: vi.fn(), askNow: vi.fn(), asking });
const result = (over: Record<string, unknown> = {}) => ({
  available: true,
  provider: 'ympl',
  status: 'token_issued',
  redirectUrl: 'https://partner.test/journey?t=1',
  embeddable: true,
  ...over,
});

beforeEach(() => api.requestAltOffer.mockResolvedValue(result()));
afterEach(() => {
  cleanup();
  api.requestAltOffer.mockReset();
});

describe('OffersTabs (same two tabs as the app)', () => {
  it('shows Instant offers | Explore lenders and marks the active one', () => {
    render(<OffersTabs tab="instant" onChange={() => {}} />);
    const [instant, explore] = screen.getAllByRole('tab');
    expect(instant.textContent).toBe('Instant offers');
    expect(explore.textContent).toBe('Explore lenders');
    expect(instant.getAttribute('aria-selected')).toBe('true');
    expect(explore.getAttribute('aria-selected')).toBe('false');
  });
  it('switches on click without navigating', () => {
    const onChange = vi.fn();
    render(<OffersTabs tab="instant" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: /Explore lenders/ }));
    expect(onChange).toHaveBeenCalledWith('explore');
  });
});

describe('ExploreLenders — the journey shown in place', () => {
  it('embeds the partner journey in an iframe on the same page when the partner allows it', async () => {
    const alt = mkAlt();
    render(<ExploreLenders applicationId="app-1" alt={alt} />);
    const frame = (await screen.findByTestId('explore-frame')) as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toBe('https://partner.test/journey?t=1');
    expect(frame.title).toBe('Partner lender offers');
    expect(api.requestAltOffer).toHaveBeenCalledWith('app-1');
    expect(alt.markOpened).toHaveBeenCalled(); // so leaving the tab can ask "did you proceed?"
    expect(screen.queryByTestId('explore-newtab')).toBeNull();
  });

  it('does not render a doomed iframe when the partner forbids framing — offers a new tab instead', async () => {
    api.requestAltOffer.mockResolvedValue(result({ embeddable: false }));
    const alt = mkAlt();
    render(<ExploreLenders applicationId="app-1" alt={alt} />);
    expect(await screen.findByTestId('explore-newtab')).toBeTruthy();
    expect(screen.queryByTestId('explore-frame')).toBeNull();
    expect(alt.markOpened).not.toHaveBeenCalled();
    const btn = screen.getByRole('button', { name: /Open partner offers/ });
    expect(btn.getAttribute('data-voice-gate')).toBe('explore-lenders');
    fireEvent.click(btn);
    expect(alt.open).toHaveBeenCalled();
  });

  it('shows a loader while the journey URL is minted', async () => {
    let release!: (v: unknown) => void;
    api.requestAltOffer.mockReturnValue(new Promise((r) => (release = r)));
    render(<ExploreLenders applicationId="app-1" alt={mkAlt()} />);
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    await act(async () => release(result()));
    expect(await screen.findByTestId('explore-frame')).toBeTruthy();
  });

  it.each([
    ['partner unavailable', () => api.requestAltOffer.mockResolvedValue(result({ available: false, redirectUrl: null }))],
    ['request failure', () => api.requestAltOffer.mockRejectedValue(new Error('401'))],
  ])('shows a retry on %s, and Retry loads it again', async (_n, arrange) => {
    arrange();
    render(<ExploreLenders applicationId="app-1" alt={mkAlt()} />);
    const retry = await screen.findByRole('button', { name: /Retry/ });
    api.requestAltOffer.mockResolvedValue(result());
    fireEvent.click(retry);
    expect(await screen.findByTestId('explore-frame')).toBeTruthy();
    expect(api.requestAltOffer).toHaveBeenCalledTimes(2);
  });

  it('asks "did you proceed?" when the embedded return page reports the visitor is back', async () => {
    const alt = mkAlt();
    render(<ExploreLenders applicationId="app-1" alt={alt} />);
    await screen.findByTestId('explore-frame');
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'sl-alt-return' }, origin: window.location.origin }));
    });
    expect(alt.askNow).toHaveBeenCalledTimes(1);
  });

  it('starts the journey afresh once the visitor has answered the question', async () => {
    const alt = mkAlt(false); // handlers are stable in the real hook, so share them across rerenders
    const { rerender } = render(<ExploreLenders applicationId="app-1" alt={alt} />);
    await screen.findByTestId('explore-frame');
    expect(api.requestAltOffer).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'sl-alt-return' }, origin: window.location.origin }));
    });
    rerender(<ExploreLenders applicationId="app-1" alt={{ ...alt, asking: true }} />); // question showing
    expect(api.requestAltOffer).toHaveBeenCalledTimes(1);
    rerender(<ExploreLenders applicationId="app-1" alt={{ ...alt, asking: false }} />); // answered
    await waitFor(() => expect(api.requestAltOffer).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('explore-frame')).toBeTruthy();
  });

  it('ignores return messages from other origins or with other payloads', async () => {
    const alt = mkAlt();
    render(<ExploreLenders applicationId="app-1" alt={alt} />);
    await screen.findByTestId('explore-frame');
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'sl-alt-return' }, origin: 'https://evil.example' }));
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'something-else' }, origin: window.location.origin }));
      window.dispatchEvent(new MessageEvent('message', { data: null, origin: window.location.origin }));
    });
    expect(alt.askNow).not.toHaveBeenCalled();
  });

  it('ignores a slow response that lands after the tab was left', async () => {
    let release!: (v: unknown) => void;
    api.requestAltOffer.mockReturnValue(new Promise((r) => (release = r)));
    const alt = mkAlt();
    const { unmount } = render(<ExploreLenders applicationId="app-1" alt={alt} />);
    unmount();
    await act(async () => release(result()));
    expect(alt.markOpened).not.toHaveBeenCalled();
  });
});
