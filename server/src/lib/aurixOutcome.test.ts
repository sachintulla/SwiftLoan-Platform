import { describe, it, expect } from 'vitest';
import { classifyAurixOutcome } from './aurixOutcome.js';

const reply = (Meta: Record<string, unknown>, wrapped = false) => ({
  httpStatus: 200,
  response: wrapped ? { Result: { Data: null, Meta } } : { Data: null, Meta },
});

describe('classifyAurixOutcome', () => {
  it('treats 409 "already registered" as a duplicate, not a failure', () => {
    const out = classifyAurixOutcome(reply({ Success: false, StatusCode: '409', Message: 'This mobile number is already registered.' }));
    expect(out).toMatchObject({ kind: 'duplicate', reason: 'duplicate' });
  });

  it('detects the duplicate by message even when the code differs, and in the wrapped shape', () => {
    expect(classifyAurixOutcome(reply({ Success: false, StatusCode: '400', Message: 'Mobile already registered' }, true)).kind).toBe('duplicate');
  });

  it('treats a successful eligibility decline as not_eligible and remembers it', () => {
    const out = classifyAurixOutcome(reply({ Success: true, StatusCode: '200', Message: 'Does not meet the eligibility criteria.' }));
    expect(out).toMatchObject({ kind: 'decision', reason: 'not_eligible', remember: true });
  });

  it('treats a decline with no message the same way', () => {
    expect(classifyAurixOutcome(reply({ Success: true }))).toMatchObject({ kind: 'decision', reason: 'not_eligible', remember: true });
  });

  it('treats other Aurix refusals as not_eligible but does not remember them', () => {
    const out = classifyAurixOutcome(reply({ Success: false, StatusCode: '422', Message: 'PAN verification failed' }));
    expect(out).toMatchObject({ kind: 'decision', reason: 'not_eligible', remember: false });
  });

  it('treats a 5xx Meta code, a missing reason or a missing Meta as technical', () => {
    expect(classifyAurixOutcome(reply({ Success: false, StatusCode: '500', Message: 'boom' })).reason).toBe('technical');
    expect(classifyAurixOutcome(reply({ Success: false, StatusCode: '422' })).reason).toBe('technical');
    expect(classifyAurixOutcome(null).reason).toBe('technical');
    expect(classifyAurixOutcome({ httpStatus: 0, response: null }).reason).toBe('technical');
  });

  it('never puts lender wording in the reason shown to the applicant', () => {
    const out = classifyAurixOutcome(reply({ Success: false, StatusCode: '422', Message: 'Bureau verification failed at Experian' }));
    expect(out.reason).toBe('not_eligible');
    expect(out.lenderMessage).toContain('Bureau'); // log only
  });
});
