import { STR, strings } from '../src/i18n/strings';

describe('UC-I1 English strings', () => {
  it('has expected copy', () => {
    expect(strings('en').getStarted).toBe('Get Started');
    expect(strings('en').navHome).toBe('Home');
  });
});

describe('UC-I2 Hindi strings differ from English', () => {
  it('greeting is translated', () => {
    expect(strings('hi').greeting).not.toBe(strings('en').greeting);
    expect(strings('hi').greeting).toBe('नमस्ते');
  });
});

describe('UC-I3 unknown language falls back to English', () => {
  it('te/hinglish resolve to en table', () => {
    expect(strings('te')).toBe(STR.en);
    expect(strings('anything')).toBe(STR.en);
  });
});

describe('UC-I4 key parity between en and hi', () => {
  it('every English key exists in Hindi', () => {
    const missing = Object.keys(STR.en).filter(k => !(k in STR.hi));
    expect(missing).toEqual([]);
  });
});
