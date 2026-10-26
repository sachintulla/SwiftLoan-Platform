// A tool result carries the screen's live state itself. Arriving on a screen it lists every control; acting again on the
// same screen it lists only what changed, plus the mandatory fields still empty on forms — and the app sends no separate
// page update for the agent's own change (it was a second copy of the same news, and restarted the agent's turn).
import React, { useEffect } from 'react';
import { act, cleanup } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import Mobile from '../src/screens/mobile';
import { useStore } from '../src/state/store';
import { agent } from '../src/voice';
import { setCurrentScreen } from '../src/voice/actionRegistry';
import { configureFx } from '../src/feedback/agentFx';

let store: ReturnType<typeof useStore>;
const sent: any[] = [];

function AtMobile() {
  const s = useStore();
  store = s;
  useEffect(() => {
    if (s.state.screen !== 'mobile') s.go('mobile');
  }, [s.state.screen]); // eslint-disable-line react-hooks/exhaustive-deps
  return s.state.screen === 'mobile' ? <Mobile /> : null;
}
const raw = (name: string, args: Record<string, unknown>) =>
  (agent as any).registry.get(name).handler(args) as Promise<any>;
async function call(name: string, args: Record<string, unknown>): Promise<any> {
  let p!: Promise<any>;
  await act(async () => {
    p = raw(name, args);
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(3000);
  });
  return p;
}
const updates = () => sent.filter(m => m.type === 'client-tools-update').map(m => m.page_context);

beforeAll(() => {
  if (!(globalThis as any).WebSocket) (globalThis as any).WebSocket = { OPEN: 1, CLOSED: 3 };
});
beforeEach(() => {
  jest.useFakeTimers();
  configureFx({ instant: true });
  sent.length = 0;
  (agent as any).socket = { readyState: 1, send: (m: any) => sent.push(m), close: jest.fn() };
  (agent as any).status = 'listening';
  (agent as any).lastSentPerScreen = new Map();
  (agent as any).lastSentNormPerScreen = new Map();
  (agent as any).lastSentIdentity = null;
  (agent as any).lastSentPage = null;
});
afterEach(async () => {
  await act(async () => {
    cleanup();
  });
  jest.clearAllTimers();
  jest.useRealTimers();
  (agent as any).socket = null;
});

describe('tool results report changes, not the whole screen again', () => {
  it('the first result on a screen lists the controls; the next one lists only what changed, with no extra page update', async () => {
    renderWithProviders(<AtMobile />);
    setCurrentScreen('mobile');
    await act(async () => {
      store.set({ mobileVal: '9876543210' });
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000); // the screen's own first update goes out
    });
    expect(updates().length).toBeGreaterThan(0);

    const first = await call('set_checkbox', { label: 'Accept terms and privacy policy', checked: true });
    expect(first.controls_now).toBeDefined();

    sent.length = 0;
    const second = await call('set_checkbox', { label: 'Accept terms and privacy policy', checked: false });
    expect(second.controls_now).toBeUndefined();
    expect(second.controls_changed.length).toBeGreaterThan(0);
    expect(second.controls_changed.join(' ')).toMatch(/Accept terms and privacy policy \(unchecked\)/);
    // Unchanged controls (the phone field, the page scroll) are not repeated.
    expect(second.controls_changed.join(' ')).not.toMatch(/Mobile Number/);
    // …and nothing was sent as a separate page update for the agent's own change.
    expect(updates()).toHaveLength(0);
  });

  it('a change the result did not report (new data on the page) is still sent', async () => {
    renderWithProviders(<AtMobile />);
    setCurrentScreen('mobile');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    await call('set_checkbox', { label: 'Accept terms and privacy policy', checked: true });
    await call('set_checkbox', { label: 'Accept terms and privacy policy', checked: false });
    sent.length = 0;
    await act(async () => {
      store.set({ apiContext: { lastToast: { message: 'Something else happened', at: Date.now() } } } as never);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    expect(JSON.stringify(updates())).toMatch(/Something else happened/);
  });
});
