// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { loadPanHandoff, maskPan, savePanHandoff } from './panPrefill';

const KEY = 'swiftloan.panPrefill';
afterEach(() => sessionStorage.clear());

describe('PAN hand-off keeps no PAN in the browser', () => {
  it('masks to the last four characters only', () => {
    expect(maskPan('ABCPA1234A')).toBe('XXXXXX234A');
    expect(maskPan(' abcpa1234a ')).toBe('XXXXXX234A');
  });

  it('what is written to storage never contains the PAN', () => {
    savePanHandoff({ panMasked: maskPan('ABCPA1234A'), prefill: { fullName: 'R K' }, aadhaarLinked: true });
    const raw = sessionStorage.getItem(KEY)!;
    expect(raw).not.toContain('ABCPA1234A');
    expect(loadPanHandoff()).toMatchObject({ panMasked: 'XXXXXX234A', prefill: { fullName: 'R K' } });
  });

  it('scrubs a PAN left by an older build the next time it is read', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ pan: 'ABCPA1234A', prefill: {}, aadhaarLinked: null }));
    const h = loadPanHandoff()!;
    expect(h.panMasked).toBe('XXXXXX234A');
    expect(JSON.stringify(h)).not.toContain('ABCPA1234A');
    expect(sessionStorage.getItem(KEY)).not.toContain('ABCPA1234A');
  });
});
