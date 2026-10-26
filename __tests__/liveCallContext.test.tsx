// What the voice agent is actually sent during a live call: render the real app
// (Router + store), put a fake open socket on the agent, navigate, and capture every
// `client-tools-update` message.
import React, { useEffect } from 'react';
import { act } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import Router from '../src/Router';
import { useStore, Screen as ScreenName } from '../src/state/store';
import { agent } from '../src/voice';
import { setTokens } from '../src/api/client';

let store: ReturnType<typeof useStore>;
function Probe() {
  store = useStore();
  useEffect(() => {}, []);
  return null;
}

const sent: any[] = [];
// The agent compares against the global WebSocket.OPEN; the test env has none.
beforeAll(() => {
  if (!(globalThis as any).WebSocket) (globalThis as any).WebSocket = { OPEN: 1, CLOSED: 3 };
});
beforeEach(() => {
  jest.useFakeTimers();
  sent.length = 0;
  setTokens(null);
  // A "live call": open socket, agent listening (not speaking).
  (agent as any).socket = { readyState: 1, send: (m: any) => sent.push(m), close: jest.fn() };
  (agent as any).status = 'listening';
  (agent as any).lastSentPerScreen = new Map();
  (agent as any).lastSentNormPerScreen = new Map();
  (agent as any).lastSentIdentity = null;
  (agent as any).lastSentPage = null;
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  setTokens(null);
  (agent as any).socket = null;
});

const lastContext = () => sent.filter(m => m.type === 'client-tools-update').pop()?.page_context;

async function goAndSettle(name: ScreenName) {
  // Apply the navigation first, THEN let the debounce window pass — doing both in one
  // act() would advance the clock before React has committed the new screen.
  await act(async () => {
    store.go(name);
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(5000); // past the 900ms settle window (late-registering controls extend it)
  });
}

const fullApp = () =>
  renderWithProviders(
    <>
      <Probe />
      <Router />
    </>,
  );

// The facts about the person/call (language, name, phone, account summary…) go out with the FIRST update of a call
// and again only when they change — later screens must not repeat them.
function expectIdentityOnlyOnFirstUpdate() {
  const updates = sent.filter(m => m.type === 'client-tools-update').map(m => m.page_context);
  expect(updates.length).toBeGreaterThan(1);
  for (const k of ['agent_language', 'preferred_language', 'user_name', 'heard_intro_pitch']) expect(updates[0]).toHaveProperty(k);
  expect(updates.slice(1).filter(u => 'agent_language' in u || 'authenticated_phone' in u)).toHaveLength(0);
}

function expectFullContext(ctx: any, screen: string, title: string) {
  expect(ctx).toBeTruthy();
  // Which page, in internal id and in plain words, and what it is for.
  expect(ctx.page).toBe(screen);
  expect(ctx.screen_title).toBe(title);
  expect(typeof ctx.screen_purpose).toBe('string');
  // What is on it and what can be done. The page text is left out when it only repeated the controls/title.
  if ('screen_overview' in ctx) expect(typeof ctx.screen_overview).toBe('string');
  expect(Array.isArray(ctx.available_actions)).toBe(true);
  // The tab bar is the same on every main screen and is not sent as controls.
  const labels = ctx.available_actions.map((a: any) => a.label);
  for (const tab of ['Home', 'My Offers', 'My Loans', 'Profile']) expect(labels).not.toContain(tab);
}

describe('page_context sent to the agent during a live call', () => {
  it('sign-in screens: pushed on every change and describes the CURRENT screen fully', async () => {
    fullApp();
    const list: Array<[ScreenName, string]> = [
      ['language', 'Choose Language'],
      ['intro', 'Get Started'],
      ['mobile', 'Enter Mobile Number'],
    ];
    for (const [screen, title] of list) {
      await goAndSettle(screen);
      expectFullContext(lastContext(), screen, title);
    }
    expectIdentityOnlyOnFirstUpdate();
  });

  it('signed-in screens: same, including the app tabs', async () => {
    setTokens('fake-access-token');
    fullApp();
    const list: Array<[ScreenName, string]> = [
      ['fare', 'My Offers'],
      ['profile', 'Profile'],
      ['loans', 'My Loans'],
      ['help', 'Help & Support'],
    ];
    for (const [screen, title] of list) {
      await goAndSettle(screen);
      expectFullContext(lastContext(), screen, title);
    }
    expectIdentityOnlyOnFirstUpdate();
  });

  it('a screen change is never silently dropped: each new page produces a new message, in order', async () => {
    fullApp();
    await goAndSettle('language');
    await goAndSettle('intro');
    await goAndSettle('mobile');
    const pages = sent.filter(m => m.type === 'client-tools-update').map(m => m.page_context.page);
    expect(pages).toEqual(expect.arrayContaining(['language', 'intro', 'mobile']));
    expect(pages.indexOf('language')).toBeLessThan(pages.indexOf('intro'));
    expect(pages.indexOf('intro')).toBeLessThan(pages.indexOf('mobile'));
  });
});
