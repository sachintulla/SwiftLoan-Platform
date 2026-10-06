// How the API client tells "no internet" apart from "connected, but SwiftLoan can't be
// reached/trusted from this network" (office Wi-Fi that blocks or re-signs HTTPS).

type Issue = 'offline' | 'unreachable';

function load() {
  jest.resetModules();
  const client = require('../src/api/client');
  const NetInfo = require('@react-native-community/netinfo');
  const bridge = require('../src/state/offlineBridge');
  const seen: Issue[] = [];
  bridge.subscribeOfflineAttempts((k: Issue) => seen.push(k));
  const net = (state: Record<string, unknown>) => {
    (NetInfo.default?.fetch ?? NetInfo.fetch).mockResolvedValue({ type: 'wifi', ...state });
  };
  return { api: client.api, net, seen };
}

const ok = (body: unknown) => ({ ok: true, status: 200, statusText: 'OK', json: async () => body });

describe('network issue reporting', () => {
  afterEach(() => jest.useRealTimers());

  it('connected, request fails AND the server is still unreachable on re-check -> "unreachable", not "offline"', async () => {
    const { api, net, seen } = load();
    net({ isConnected: true, isInternetReachable: false });
    (globalThis as any).fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    jest.useFakeTimers();
    await expect(api.health()).rejects.toBeTruthy(); // the caller still gets the error immediately
    expect(seen).toEqual([]); // nothing flashed yet
    await jest.advanceTimersByTimeAsync(2000);
    expect(seen).toEqual(['unreachable']);
  });

  it('a one-off failed request while the server is fine stays silent (no scary banner)', async () => {
    const { api, net, seen } = load();
    net({ isConnected: true, isInternetReachable: true });
    (globalThis as any).fetch = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('Network request failed')) // the blip
      .mockResolvedValue({ ok: true, status: 200 }); // the follow-up health probe
    jest.useFakeTimers();
    await expect(api.health()).rejects.toBeTruthy();
    await jest.advanceTimersByTimeAsync(3000);
    expect(seen).toEqual([]);
  });

  it('a false "not reachable" reading no longer blocks a request that would succeed', async () => {
    const { api, net, seen } = load();
    net({ isConnected: true, isInternetReachable: false });
    (globalThis as any).fetch = jest.fn().mockResolvedValue(ok({ status: 'ok' }));
    await expect(api.health()).resolves.toEqual({ status: 'ok' });
    expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([]);
  });

  it('no connection at all is refused up front and reported as "offline"', async () => {
    const { api, net, seen } = load();
    net({ isConnected: false, isInternetReachable: false });
    (globalThis as any).fetch = jest.fn();
    jest.useFakeTimers();
    const p = api.health().catch((e: Error) => e);
    await jest.advanceTimersByTimeAsync(2000);
    const err = await p;
    expect(String(err.message)).toMatch(/offline/);
    expect((globalThis as any).fetch).not.toHaveBeenCalled();
    expect(seen).toEqual(['offline']);
  });
});
