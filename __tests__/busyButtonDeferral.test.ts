// A context update that lands while the screen's main button is mid-action ("Sending…", "Verifying…", "Starting…")
// is a one-second transient state: every send is a turn for the agent, so it waits for the real result.
// Also: a screen with two states under one id (mobile: number entry / OTP) can name its own title and purpose.
import { agent } from '../src/voice';
import { publishScreenGraph, registerTarget, setCurrentScreen, setScreenHint, buildPageContext } from '../src/voice/actionRegistry';

describe('page_context while the main button is busy', () => {
  const sent: any[] = [];
  let busy = true;
  const ctx = () => ({ page: 'busytest', available_actions: [{ kind: 'button', label: busy ? 'Sending…' : 'Verify' }] });
  let unregister: () => void;

  beforeAll(() => {
    if (!(globalThis as any).WebSocket) (globalThis as any).WebSocket = { OPEN: 1, CLOSED: 3 };
  });
  beforeEach(() => {
    jest.useFakeTimers();
    sent.length = 0;
    busy = true;
    (agent as any).socket = { readyState: 1, send: (m: any) => sent.push(m), close: jest.fn() };
    (agent as any).status = 'listening';
    (agent as any).lastSentPerScreen = new Map();
    (agent as any).lastSentNormPerScreen = new Map();
    (agent as any).lastSentIdentity = null;
    (agent as any).lastSentPage = null;
    (agent as any).busyDeferrals = 0;
    (agent as any).pageContextFn = ctx;
    setCurrentScreen('busytest');
    unregister = registerTarget('busytest', 'primary', {
      kind: 'button', label: 'Sending…', disabled: true, onTap: () => undefined,
    });
  });
  afterEach(() => {
    unregister();
    jest.clearAllTimers();
    jest.useRealTimers();
    (agent as any).socket = null;
    (agent as any).pageContextFn = null;
  });
  const flush = (urgent = false) => (agent as any).flushPageContext(urgent);

  it('holds the send while the button reads "Sending…", then sends the real state', () => {
    flush();
    expect(sent).toHaveLength(0); // deferred, not dropped

    unregister();
    busy = false;
    unregister = registerTarget('busytest', 'primary', { kind: 'button', label: 'Verify', onTap: () => undefined });
    jest.advanceTimersByTime(500);
    expect(sent).toHaveLength(1);
    expect(sent[0].page_context.available_actions[0].label).toBe('Verify');
  });

  it('never holds it forever: after a few tries it sends anyway', () => {
    flush();
    for (let i = 0; i < 6; i++) jest.advanceTimersByTime(450);
    expect(sent).toHaveLength(1);
  });

  it('an urgent update (login, a toast) is never held', () => {
    flush(true);
    expect(sent).toHaveLength(1);
  });

  it('a disabled button that is simply not ready yet (no ellipsis) does not hold anything', () => {
    unregister();
    unregister = registerTarget('busytest', 'primary', { kind: 'button', label: 'Continue', disabled: true, onTap: () => undefined });
    flush();
    expect(sent).toHaveLength(1);
  });
});

describe('a screen with two states can set its own title and purpose', () => {
  it('uses the hint when present and falls back to the screen info otherwise', () => {
    publishScreenGraph('mobile', [], []);
    expect((buildPageContext('mobile') as any).screen_title).toBe('Enter Mobile Number');
    setScreenHint('mobile', { screen_title: 'Verify OTP', screen_purpose: 'The user enters the OTP sent by SMS.' });
    const otp = buildPageContext('mobile') as any;
    expect(otp.screen_title).toBe('Verify OTP');
    expect(otp.screen_purpose).toBe('The user enters the OTP sent by SMS.');
    setScreenHint('mobile', null);
    expect((buildPageContext('mobile') as any).screen_title).toBe('Enter Mobile Number');
  });
});
