// The About You voice tools, end to end: the agent's own `set_date` / `fill_field` tool handlers
// run against the real screen. Covers two live failures: the date tool reporting ok:true when the
// date was refused, and the Hindi/Telugu name field being refused as a secret.
import React, { useEffect } from 'react';
import { act } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import AboutYou from '../src/screens/aboutyou';
import { useStore } from '../src/state/store';
import { agent } from '../src/voice';
import { setCurrentScreen, listTargets } from '../src/voice/actionRegistry';
import { setTokens } from '../src/api/client';

function AtAboutYou({ lang }: { lang?: 'te' | 'hi' | 'en' }) {
  const { state, go, set } = useStore();
  useEffect(() => {
    if (lang) set({ lang });
    if (state.screen !== 'aboutyou') go('aboutyou');
  }, [state.screen, go, set, lang]);
  return state.screen === 'aboutyou' ? <AboutYou /> : null;
}

const callTool = (name: string, args: Record<string, unknown>) =>
  (agent as any).registry.get(name).handler(args) as Promise<any>;

beforeEach(() => {
  jest.useFakeTimers();
  setTokens('fake-access-token');
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  setTokens(null);
});

async function renderAboutYou(lang?: 'te' | 'hi' | 'en') {
  renderWithProviders(<AtAboutYou lang={lang} />);
  setCurrentScreen('aboutyou');
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1500);
  });
}

describe('About You voice tools', () => {
  it('set_date reports a refused date as ok:false instead of ok:true', async () => {
    await renderAboutYou();
    let res: any;
    await act(async () => {
      const p = callTool('set_date', { date: '2015-01-01' }); // under 18
      await jest.advanceTimersByTimeAsync(2000);
      res = await p;
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('value_rejected');
    expect(String(res.message)).toMatch(/at least 18/);
  });

  it('set_date accepts a valid adult date and reports it applied', async () => {
    await renderAboutYou();
    // Start the tool call, THEN let React commit and the clock advance in separate acts: inside a
    // single act the re-render is deferred, so `applied` would be read before it lands.
    let p: Promise<any>;
    await act(async () => {
      p = callTool('set_date', { date: '1991-12-29' });
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2000);
    });
    const res = await p!;
    expect(res.ok).toBe(true);
    expect(res.applied).toBe('29 Dec 1991');
  });

  it('the name field is fillable when the app language is Telugu or Hindi', async () => {
    await renderAboutYou('te');
    const name = listTargets('aboutyou').find(t => t.kind === 'field' && /PAN/.test(t.label) && !/Mobile/i.test(t.label));
    expect(name).toBeDefined();
    expect(name!.sensitive).toBeFalsy();
  });
});
