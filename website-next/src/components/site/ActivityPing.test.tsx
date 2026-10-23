// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

const session = vi.hoisted(() => ({ token: 'tok' as string | null, listener: null as null | (() => void) }));
vi.mock('@/lib/session', () => ({
  getAccessToken: () => session.token,
  subscribeSession: (l: () => void) => { session.listener = l; return () => { session.listener = null; }; },
}));
const nav = vi.hoisted(() => ({ path: '/apply/step-1' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.path }));
vi.mock('@/lib/leads', () => ({ apiBase: () => 'http://api.test' }));


const pings = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter((c) => String(c[0]).endsWith('/api/website/activity'));

describe('<ActivityPing />', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.resetModules();
    session.token = 'tok'; nav.path = '/apply/step-1';
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  async function mount() {
    const { default: Ping } = await import('./ActivityPing');
    return render(<Ping />);
  }

  it('renders nothing visible', async () => {
    const { container } = await mount();
    expect(container.innerHTML).toBe('');
  });

  it('pings once on load, with the bearer token and keepalive', async () => {
    await mount();
    expect(pings(fetchMock)).toHaveLength(1);
    const [url, init] = pings(fetchMock)[0];
    expect(url).toBe('http://api.test/api/website/activity');
    expect(init.method).toBe('POST'); expect(init.keepalive).toBe(true);
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('throttles interaction pings to one a minute', async () => {
    await mount();
    for (const type of ['pointerdown', 'keydown', 'touchstart']) act(() => { window.dispatchEvent(new Event(type)); });
    expect(pings(fetchMock)).toHaveLength(1); // still just the load ping
  });

  it('pings when the tab is hidden (the last "they were here" moment), even inside the throttle window', async () => {
    await mount();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(pings(fetchMock)).toHaveLength(2);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('pings when the page is being closed', async () => {
    await mount();
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(pings(fetchMock)).toHaveLength(2);
  });

  it('pings once the session token arrives after load', async () => {
    session.token = null;
    await mount();
    expect(pings(fetchMock)).toHaveLength(0); // signed out: no ping, no request at all
    session.token = 'late';
    act(() => { session.listener?.(); });
    expect(pings(fetchMock)).toHaveLength(1);
    expect(pings(fetchMock)[0][1].headers.Authorization).toBe('Bearer late');
  });

  it('sends nothing while signed out', async () => {
    session.token = null;
    await mount();
    act(() => { window.dispatchEvent(new Event('pointerdown')); window.dispatchEvent(new Event('pagehide')); });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a failing ping never throws into the page', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await mount();
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(true).toBe(true); // no unhandled rejection
  });

  it('stops listening when unmounted', async () => {
    const { unmount } = await mount();
    unmount();
    fetchMock.mockClear();
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(pings(fetchMock)).toHaveLength(0);
  });
});
