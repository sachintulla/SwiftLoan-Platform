// The agent learns every mandatory field still empty on the application details screen up front,
// instead of one at a time from Continue's error toast; and it can scroll to a field before asking.
import React, { useEffect } from 'react';
import { act, cleanup } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import Basic from '../src/screens/basic';
import { useStore } from '../src/state/store';
import { agent } from '../src/voice';
import { getScreenHint, setCurrentScreen, buildPageContext } from '../src/voice/actionRegistry';
import { missingBasicRequired } from '../src/utils/basicRequired';
import { configureFx, emitFx, subscribeFx } from '../src/feedback/agentFx';
import { setTokens } from '../src/api/client';
import { MONTHLY_INCOME_MIN, PINCODE_RE } from '../src/utils/inputLimits';

const OPTS = { pincodeRe: PINCODE_RE, incomeMin: MONTHLY_INCOME_MIN };
const EMPTY = {
  first: '', last: '', dobSet: false, gender: null, email: '', loanPurpose: null, qualification: null,
  residence: null, employment: null, salaryMode: null, addr1: '', city: '', state: '', pin: '', income: '',
};
const FULL = {
  first: 'Sri', last: 'Bhavya', dobSet: true, gender: 'female', email: 'a@b.co', loanPurpose: 'personal',
  qualification: 'grad', residence: 'own', employment: 'salaried', salaryMode: 'bank', addr1: 'Dno 1',
  city: 'Kakinada', state: 'Andhra Pradesh', pin: '533001', income: '25000',
};

describe('missingBasicRequired', () => {
  it('lists every mandatory field when nothing is filled, in the order the screen asks', () => {
    expect(missingBasicRequired(EMPTY, OPTS)).toEqual([
      'first name', 'last name', 'date of birth', 'gender', 'email', 'loan purpose', 'qualification',
      'residence type', 'employment type', 'salary mode', 'address line 1', 'city', 'state', 'pincode', 'monthly income',
    ]);
  });

  it('is empty when everything is filled — Continue will go through', () => {
    expect(missingBasicRequired(FULL, OPTS)).toEqual([]);
  });

  it('flags only what is wrong: a bad email, a short pincode, an income under the minimum', () => {
    expect(missingBasicRequired({ ...FULL, email: 'nope' }, OPTS)).toEqual(['email']);
    expect(missingBasicRequired({ ...FULL, pin: '5330' }, OPTS)).toEqual(['pincode']);
    expect(missingBasicRequired({ ...FULL, income: '100' }, OPTS)).toEqual(['monthly income']);
  });

  it('PAN-prefilled details (name, DOB, address…) drop off the list; the rest stay', () => {
    const prefilled = { ...EMPTY, first: 'Sri', last: 'Bhavya', dobSet: true, gender: 'female', addr1: 'x', city: 'y', state: 'z', pin: '533001' };
    expect(missingBasicRequired(prefilled, OPTS)).toEqual(['email', 'loan purpose', 'qualification', 'residence type', 'employment type', 'salary mode', 'monthly income']);
  });
});

describe('the application screen publishes the list to the agent', () => {
  function AtBasic() {
    const { state, go } = useStore();
    useEffect(() => {
      if (state.screen !== 'basic') go('basic');
    }, [state.screen, go]);
    return state.screen === 'basic' ? <Basic /> : null;
  }
  const call = (name: string, args: Record<string, unknown>) => (agent as any).registry.get(name).handler(args) as Promise<any>;

  beforeEach(() => {
    jest.useFakeTimers();
    setTokens('fake-access-token');
    configureFx({ instant: true });
  });
  afterEach(async () => {
    // Unmount while the fake clock is still in charge, so nothing is left waiting on a real timer.
    await act(async () => {
      cleanup();
    });
    jest.clearAllTimers();
    jest.useRealTimers();
    setTokens(null);
  });

  it('sends the full list in page_context and read_screen, so the agent can ask for everything before Continue', async () => {
    renderWithProviders(<AtBasic />);
    setCurrentScreen('basic');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1500);
    });
    const hint = getScreenHint('basic') as { missing_required_fields?: string[] };
    expect(hint.missing_required_fields).toEqual(expect.arrayContaining(['gender', 'loan purpose', 'qualification', 'employment type', 'salary mode', 'monthly income']));
    expect((buildPageContext('basic') as any).missing_required_fields).toEqual(hint.missing_required_fields);
    let res: any;
    await act(async () => {
      res = await call('read_screen', {});
    });
    expect(res.missing_required_fields).toEqual(hint.missing_required_fields);
  });

  it('show_field scrolls to and highlights a field — or a whole option group — without changing anything', async () => {
    renderWithProviders(<AtBasic />);
    setCurrentScreen('basic');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1500);
    });
    const seen: string[] = [];
    const off = subscribeFx(e => seen.push(e.kind));
    let pa: Promise<any>;
    let pb: Promise<any>;
    await act(async () => {
      pa = call('show_field', { label: 'Employment' }); // an option GROUP, not a control label
      pb = call('show_field', { label: 'No such field' });
    });
    // measuring a control waits on a (fake) timer when the test renderer has no layout
    await act(async () => {
      await jest.advanceTimersByTimeAsync(3000);
    });
    const a = await pa!;
    const b = await pb!;
    off();
    expect(a.ok).toBe(true);
    expect(a.shown).toMatch(/employ/i);
    expect(b.ok).toBe(false);
    expect(b.reason).toBe('not_found');
    expect(seen).toContain('focus'); // the ring lit up
    emitFx('done', 'x'); // (keeps the import used / nothing left animating)
  });
});
