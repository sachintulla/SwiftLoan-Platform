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

function expectFullContext(ctx: any, screen: string, title: string) {
  expect(ctx).toBeTruthy();
  // Which page, in internal id and in plain words, and what it is for.
  expect(ctx.page).toBe(screen);
  expect(ctx.screen_title).toBe(title);
  expect(typeof ctx.screen_purpose).toBe('string');
  // What is on it and what can be done.
  expect(typeof ctx.screen_overview).toBe('string');
  expect(Array.isArray(ctx.available_actions)).toBe(true);
  // Standing facts about the user/session, on every update.
  expect(ctx).toHaveProperty('agent_language');
  expect(ctx).toHaveProperty('preferred_language');
  expect(ctx).toHaveProperty('user_name');
  expect(ctx).toHaveProperty('heard_intro_pitch');
}

describe('page_context sent to the agent during a live call', () => {
  it('sign-in screens: pushed on every change and describes the CURRENT screen fully', async () => {
    fullApp();
    for (const [screen, title] of [
      ['language', 'Choose Language'],
      ['intro', 'Get Started'],
      ['mobile', 'Enter Mobile Number'],
    ] as Array<[ScreenName, string]>) {
      await goAndSettle(screen);
      expectFullContext(lastContext(), screen, title);
    }
  });

  it('signed-in screens: same, including the app tabs', async () => {
    setTokens('fake-access-token');
    fullApp();
    for (const [screen, title] of [
      ['fare', 'My Offers'],
      ['profile', 'Profile'],
      ['loans', 'My Loans'],
      ['help', 'Help & Support'],
    ] as Array<[ScreenName, string]>) {
      await goAndSettle(screen);
      expectFullContext(lastContext(), screen, title);
    }
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
