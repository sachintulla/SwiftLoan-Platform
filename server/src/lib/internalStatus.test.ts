import { describe, it, expect } from 'vitest';
import { internalStatusFor } from '../modules/aurixWebhook.routes.js';

describe('internalStatusFor — app-side badge follows the lender status', () => {
  it('stays just_applied (null) before the lender confirms submission', () => {
    for (const s of ['draft', 'prequalifying', 'offers_ready', 'handoff']) expect(internalStatusFor(s)).toBeNull();
  });
  it('is success once the lender has the application, including a later decision', () => {
    for (const s of ['under_review', 'approved', 'disbursed', 'rejected', 'closed']) expect(internalStatusFor(s)).toBe('success');
  });
  it('is failed for a technical failure', () => {
    expect(internalStatusFor('failed')).toBe('failed');
  });
  it('ignores missing input', () => {
    expect(internalStatusFor(null)).toBeNull();
    expect(internalStatusFor(undefined)).toBeNull();
  });
});
