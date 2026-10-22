import { describe, it, expect } from 'vitest';
import { tidyName } from './installReminder.js';

describe('tidyName (greeting name from a PAN record)', () => {
  it('turns capitals into a readable name', () => {
    expect(tidyName('PRIYA')).toBe('Priya');
    expect(tidyName('  rAvI   kUmAr ')).toBe('Ravi Kumar');
    expect(tidyName("O'NEIL")).toBe("O'Neil");
    expect(tidyName('ANNA-MARIA')).toBe('Anna-Maria');
    expect(tidyName('శ్రీ')).toBe('శ్రీ'); // non-Latin scripts are left alone
  });
  it('returns null for blank or missing', () => {
    expect(tidyName('   ')).toBeNull();
    expect(tidyName(null)).toBeNull();
    expect(tidyName(undefined)).toBeNull();
  });
  it('caps the length', () => {
    expect(tidyName('x'.repeat(200))!.length).toBe(60);
  });
});
