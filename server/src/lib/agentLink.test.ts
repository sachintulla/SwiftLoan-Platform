import { describe, it, expect } from 'vitest';
import { CALL_LINK_STEP, planCallLink } from './agentLink.js';

const base = 'https://api.swiftloan.ai';

describe('planCallLink: the three values the "send me the link" SMS and WhatsApp carry', () => {
  it('a known person: their own name, "Starting a Loan Application", and a link with their reference', () => {
    expect(planCallLink({ userName: 'priya SHARMA', token: 'AB12CD34', publicBase: base })).toEqual({
      name: 'Priya Sharma', step: 'Starting a Loan Application', link: 'https://api.swiftloan.ai/dl?ref=AB12CD34', known: true,
    });
  });

  it('falls back to the name from the website visit, then the customer record', () => {
    expect(planCallLink({ userName: null, reminderName: 'Ravi', token: 'T1', publicBase: base }).name).toBe('Ravi');
    expect(planCallLink({ userName: '  ', customerName: 'meena k', publicBase: base }).name).toBe('Meena K');
  });

  it('an unknown number: "Customer" and the plain app link', () => {
    expect(planCallLink({ publicBase: `${base}/` })).toEqual({
      name: 'Customer', step: CALL_LINK_STEP, link: 'https://api.swiftloan.ai/dl?campaign=voice_agent', known: false,
    });
  });

  it('a saved status text replaces the default; a blank one does not', () => {
    expect(planCallLink({ publicBase: base, step: 'Loan application' }).step).toBe('Loan application');
    expect(planCallLink({ publicBase: base, step: ' ' }).step).toBe(CALL_LINK_STEP);
  });
});
