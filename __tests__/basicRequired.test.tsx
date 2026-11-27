// The agent learns every mandatory field still empty on the application details screen up front,
// instead of one at a time from Continue's error toast; and it can scroll to a field before asking.
import React, { useEffect } from 'react';
import { act, cleanup } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import Basic from '../src/screens/basic';
import { useStore } from '../src/state/store';
import { agent } from '../src/voice';
import { getScreenHint, setCurrentScreen, buildPageContext } from '../src/voice/actionRegistry';
import { missingBasicRequired, companyNeeded } from '../src/utils/basicRequired';
import { configureFx, emitFx, subscribeFx } from '../src/feedback/agentFx';
import { setTokens } from '../src/api/client';
import { MONTHLY_INCOME_MIN, PINCODE_RE, LOAN_AMOUNT_MIN, LOAN_AMOUNT_MAX, clampLoanAmount } from '../src/utils/inputLimits';

const OPTS = { pincodeRe: PINCODE_RE, incomeMin: MONTHLY_INCOME_MIN };
const EMPTY = {
  first: '', last: '', dobSet: false, gender: null, email: '', loanPurpose: null, qualification: null,
  residence: null, employment: null, salaryMode: null, company: '', addr1: '', city: '', state: '', pin: '', income: '',
};
const FULL = {
  first: 'Sri', last: 'Bhavya', dobSet: true, gender: 'female', email: 'a@b.co', loanPurpose: 'personal',
  qualification: 'grad', residence: 'own', employment: 'salaried', salaryMode: 'bank', company: 'Infosys Ltd', addr1: 'Dno 1',
  city: 'Kakinada', state: 'Andhra Pradesh', pin: '533001', income: '25000',
};

describe('loan amount is mandatory (no default: 0 = not chosen)', () => {
  it('is asked for first when the amount is still 0', () => {
    expect(missingBasicRequired({ ...FULL, amount: 0 }, OPTS)).toEqual(['loan amount']);
    expect(missingBasicRequired({ ...EMPTY, amount: 0 }, OPTS)[0]).toBe('loan amount');
  });
  it('is satisfied once an amount is picked', () => {
    expect(missingBasicRequired({ ...FULL, amount: 25000 }, OPTS)).toEqual([]);
    expect(missingBasicRequired({ ...FULL, amount: 1500000 }, OPTS)).toEqual([]);
  });
  it('an amount outside 25,000 to 15,00,000 is flagged (the server would refuse it)', () => {
    expect(missingBasicRequired({ ...FULL, amount: 10000000 }, OPTS)).toEqual(['loan amount']);
    expect(missingBasicRequired({ ...FULL, amount: 1500001 }, OPTS)).toEqual(['loan amount']);
    expect(missingBasicRequired({ ...FULL, amount: 24999 }, OPTS)).toEqual(['loan amount']);
  });
  it('clampLoanAmount brings a seeded amount into range; 0 / missing stays "not chosen"', () => {
    expect(clampLoanAmount(10000000)).toBe(LOAN_AMOUNT_MAX); // the ₹1 crore featured offer
    expect(clampLoanAmount(10000)).toBe(LOAN_AMOUNT_MIN);
    expect(clampLoanAmount(450000.4)).toBe(450000);
    expect(clampLoanAmount(0)).toBe(0);
    expect(clampLoanAmount(null)).toBe(0);
    expect(clampLoanAmount(undefined)).toBe(0);
    expect(clampLoanAmount(NaN)).toBe(0);
  });
  it('starts at 0 in a fresh app state', () => {
    let amount = -1;
    const Probe = () => { amount = useStore().state.appAmount; return null; };
    renderWithProviders(<Probe />);
    expect(amount).toBe(0);
    cleanup();
  });
});

describe('company / employer name is mandatory (the lender needs an EmployerName)', () => {
  it('is asked for, last, when a salaried applicant leaves it empty', () => {
    expect(missingBasicRequired({ ...FULL, company: '' }, OPTS)).toEqual(['company name']);
    expect(missingBasicRequired({ ...FULL, company: '   ' }, OPTS)).toEqual(['company name']);
  });
  it('goes away once it is filled in', () => {
    expect(missingBasicRequired(FULL, OPTS)).toEqual([]);
  });
  it('applies to every employment type except student and retired', () => {
    for (const e of ['Salaried', 'Self-employed', 'Business owner', 'Gig worker', 'Other', 'self_employed']) {
      expect(missingBasicRequired({ ...FULL, employment: e, company: '' }, OPTS)).toEqual(['company name']);
    }
    for (const e of ['Student', 'Retired', 'student', 'retired']) {
      expect(missingBasicRequired({ ...FULL, employment: e, company: '' }, OPTS)).toEqual([]);
    }
  });
  it('is not listed while no employment type is chosen (that is flagged on its own)', () => {
    expect(missingBasicRequired({ ...FULL, employment: null, company: '' }, OPTS)).toEqual(['employment type']);
  });
  it('companyNeeded matches labels and slugs alike', () => {
    expect(companyNeeded('Business owner')).toBe(true);
    expect(companyNeeded('Student')).toBe(false);
    expect(companyNeeded(null)).toBe(false);
  });
});

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

// ── The amount step (2026-11-27): 46% of applications were exactly 25,000, the slider's minimum, because the smallest
// touch on the slider chose it. The amount is now typed (or picked), and the slider cannot choose the minimum by itself.
import { LOAN_AMOUNT_STEP, LOAN_AMOUNT_QUICK_PICKS, parseAmountInput, sliderAmountChoice } from '../src/utils/inputLimits';

describe('amount step: a real amount, not the slider minimum', () => {
  it('reads a typed amount: digits only, commas and spaces ignored, at most 7 digits', () => {
    expect(parseAmountInput('80,000')).toBe(80000);
    expect(parseAmountInput('₹ 1,20,000')).toBe(120000);
    expect(parseAmountInput('')).toBe(0);
    expect(parseAmountInput('abc')).toBe(0);
    expect(parseAmountInput('150000099')).toBe(1500000);
  });

  it('a typed amount outside the range still blocks Continue', () => {
    expect(missingBasicRequired({ ...FULL, amount: parseAmountInput('8000') }, OPTS)).toEqual(['loan amount']);
    expect(missingBasicRequired({ ...FULL, amount: parseAmountInput('80000') }, OPTS)).toEqual([]);
    // 25,000 itself is allowed when the applicant types it.
    expect(missingBasicRequired({ ...FULL, amount: parseAmountInput('25,000') }, OPTS)).toEqual([]);
  });

  it('with nothing chosen yet, the slider cannot choose the minimum', () => {
    expect(sliderAmountChoice(0, 25000)).toBeNull();
    expect(sliderAmountChoice(0, 30000)).toBe(30000);
    expect(sliderAmountChoice(0, 150000)).toBe(150000);
    // A half-typed amount below the range is still "not chosen".
    expect(sliderAmountChoice(8, 25000)).toBeNull();
  });

  it('once an amount is chosen the slider moves freely, down to the minimum too', () => {
    expect(sliderAmountChoice(150000, 25000)).toBe(25000);
    expect(sliderAmountChoice(25000, 30000)).toBe(30000);
  });

  it('the slider step is finer than the minimum, and no quick pick is the minimum', () => {
    expect(LOAN_AMOUNT_STEP).toBe(5000);
    expect(LOAN_AMOUNT_STEP).toBeLessThan(25000);
    expect(LOAN_AMOUNT_QUICK_PICKS).toEqual([50000, 100000, 200000, 500000]);
    for (const v of LOAN_AMOUNT_QUICK_PICKS) {
      expect(v).toBeGreaterThan(25000);
      expect(missingBasicRequired({ ...FULL, amount: v }, OPTS)).toEqual([]);
    }
  });
});
