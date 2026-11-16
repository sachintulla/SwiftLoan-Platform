import { parseFocusQuery, matchLender, type MetricKey } from '../src/voice/focusTargets';

const LENDERS = ['HDFC Bank', 'Axis Finance', 'Bajaj Finserv', 'Tata Capital'];

describe('matchLender', () => {
  it('matches a lender named anywhere in the phrase, case-insensitively', () => {
    expect(matchLender('show the hdfc offer', LENDERS)).toBe('HDFC Bank');
    expect(matchLender('what about BAJAJ', LENDERS)).toBe('Bajaj Finserv');
  });
  it('prefers the longest match', () => {
    expect(matchLender('hdfc bank please', LENDERS)).toBe('HDFC Bank');
  });
  it('returns undefined when no lender is named', () => {
    expect(matchLender('the lowest emi', LENDERS)).toBeUndefined();
    expect(matchLender('', LENDERS)).toBeUndefined();
  });
});

describe('parseFocusQuery — metrics', () => {
  const cases: Array<[string, MetricKey]> = [
    ['the lowest EMI', 'emi'],
    ['monthly installment', 'emi'],
    ['the best interest rate', 'rate'],
    ['lowest rate of interest', 'rate'],
    ['total interest paid', 'interest'],
    ['least interest', 'interest'],
    ['the processing fee', 'fee'],
    ['any upfront charges', 'fee'],
    ['total you repay', 'repay'],
    ['cheapest overall', 'repay'],
    ['eligible amount', 'amount'],
    ['the tenure', 'tenure'],
  ];
  it.each(cases)('maps %j to metric %s', (q, metric) => {
    expect(parseFocusQuery(q, LENDERS).metric).toBe(metric);
  });

  it('"interest" alone means the interest amount, not the rate', () => {
    expect(parseFocusQuery('how much interest', LENDERS).metric).toBe('interest');
  });
  it('"interest rate" is the rate, not the interest amount', () => {
    expect(parseFocusQuery('their interest rate', LENDERS).metric).toBe('rate');
  });
  it('returns no metric for a plain lender mention', () => {
    expect(parseFocusQuery('the Axis offer', LENDERS).metric).toBeUndefined();
  });
});

describe('parseFocusQuery — combined', () => {
  it('returns both a lender and a metric when both are named', () => {
    const r = parseFocusQuery("HDFC's processing fee", LENDERS);
    expect(r.lender).toBe('HDFC Bank');
    expect(r.metric).toBe('fee');
  });
  it('returns empty object when nothing matches', () => {
    expect(parseFocusQuery('tell me more', LENDERS)).toEqual({ lender: undefined, metric: undefined });
  });
});
