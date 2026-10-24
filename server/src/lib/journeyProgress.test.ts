import { describe, it, expect } from 'vitest';
import { journeyProgress } from './journey.js';

describe('journeyProgress — defined journey + position, for call context', () => {
  it('places a mid-funnel stage with done + next', () => {
    const p = journeyProgress('offers_viewed');
    expect(p.index).toBe(6); // lead_captured(1)…offers_viewed(6)
    expect(p.total).toBe(12);
    expect(p.current).toBe('Offers viewed');
    expect(p.next).toBe('Offer selected');
    expect(p.done).toContain('OTP verified');
    expect(p.line).toContain('Stage 6 of 12');
    expect(p.line).toContain('Next step: Offer selected');
  });

  it('marks the final step with no next', () => {
    const p = journeyProgress('disbursed');
    expect(p.index).toBe(12);
    expect(p.next).toBeNull();
    expect(p.line).toContain('final step');
  });

  it('describes an off-path stage plainly, with no position', () => {
    const p = journeyProgress('rejected');
    expect(p.index).toBe(0);
    expect(p.next).toBeNull();
    expect(p.line).toBe('Status: Rejected.');
  });
});
