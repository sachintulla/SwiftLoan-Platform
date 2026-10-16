import { describe, it, expect } from 'vitest';
import { encryptPan, decryptPan } from './pii.js';
import { panFromHolder, userPanData, applicationPanData, isPanFormat } from './storedPan.js';

const PAN = 'ABCPA1234A';

describe('stored PAN is encrypted only', () => {
  it('what we write to the database contains no plaintext PAN', () => {
    for (const data of [userPanData(PAN), applicationPanData(PAN)]) {
      const text = JSON.stringify(data);
      expect(text).not.toContain(PAN);
      expect(data.panEnc).toMatch(/^v1\./);
      expect(data).not.toHaveProperty('panNumber');
    }
    expect(userPanData(PAN).panOnFile).toBe(true);
  });

  it('is randomised (same PAN, different ciphertext) and round-trips with the env key', () => {
    expect(encryptPan(PAN)).not.toBe(encryptPan(PAN));
    expect(decryptPan(encryptPan(' abcpa1234a '))).toBe(PAN);
    expect(panFromHolder({ panEnc: encryptPan(PAN), panNumber: null })).toBe(PAN);
  });

  it('rejects tampered or foreign ciphertext instead of returning garbage', () => {
    const good = encryptPan(PAN);
    const tampered = good.slice(0, -2) + (good.endsWith('A') ? 'B' : 'A');
    expect(panFromHolder({ panEnc: tampered, panNumber: null })).toBe('');
    expect(panFromHolder({ panEnc: 'not-a-blob', panNumber: null })).toBe('');
  });

  it('falls back to a legacy plaintext column only until it is migrated, and prefers the encrypted one', () => {
    expect(panFromHolder({ panEnc: null, panNumber: 'abcpa1234a' })).toBe(PAN);
    expect(panFromHolder({ panEnc: encryptPan('XYZPA9999Z'), panNumber: PAN })).toBe('XYZPA9999Z');
    expect(panFromHolder(null)).toBe('');
    expect(panFromHolder({ panEnc: null, panNumber: null })).toBe('');
  });

  it('format check', () => {
    expect(isPanFormat(PAN)).toBe(true);
    expect(isPanFormat('12345')).toBe(false);
  });
});
