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
  // `te` used to fall back to English and this asserted exactly that. A full Telugu
  // (Tenglish) table has since been added, so `strings('te')` correctly returns it —
  // the test was describing an app that no longer exists.
  it('te resolves to the Telugu table, not English', () => {
    expect(STR.te).toBeDefined();
    expect(strings('te')).toBe(STR.te);
    expect(strings('te')).not.toBe(STR.en);
  });

  it('a genuinely unknown language still falls back to English', () => {
    expect(strings('anything')).toBe(STR.en);
    expect(strings('')).toBe(STR.en);
  });
});

describe('UC-I4 key parity across every translated language', () => {
  // Iterated rather than hard-coded to `hi`: `te` was added without this test noticing,
  // so a fourth language would have gone unchecked too.
  const translated = Object.keys(STR).filter((l) => l !== 'en');

  it('has more than just English', () => {
    expect(translated.length).toBeGreaterThan(0);
  });

  it.each(translated)('every English key exists in %s', (lang) => {
    const missing = Object.keys(STR.en).filter((k) => !(k in STR[lang]));
    expect(missing).toEqual([]);
  });
});
