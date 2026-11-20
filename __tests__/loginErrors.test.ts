import { loginErrorText } from '../src/utils/loginErrors';
import { ApiError } from '../src/api/client';
import { STR } from '../src/i18n/strings';

// The server answers in English only. The login screen used to show its sentence as it came,
// so "Invalid or expired OTP" appeared in English even with the app in Telugu or Hindi.
describe('login error messages follow the app language', () => {
  const wrongOtp = new ApiError(400, 'Invalid or expired OTP');
  const smsFailed = new ApiError(502, 'Could not send the verification code. Please try again in a moment.');
  const tooMany = new ApiError(429, 'Too many attempts, try again shortly');

  it('English reads exactly as the server words it (nothing changes for English users)', () => {
    expect(loginErrorText(wrongOtp, 'verify', STR.en, 'en')).toBe(wrongOtp.message);
    expect(loginErrorText(smsFailed, 'send', STR.en, 'en')).toBe(smsFailed.message);
    expect(loginErrorText(tooMany, 'send', STR.en, 'en')).toBe(tooMany.message);
    expect(loginErrorText(tooMany, 'verify', STR.en, 'en')).toBe(tooMany.message);
  });

  it.each(['te', 'hi'])('a wrong or expired OTP is shown in %s', (lang) => {
    const text = loginErrorText(wrongOtp, 'verify', STR[lang], lang);
    expect(text).toBe(STR[lang].loginErrOtpInvalid);
    expect(text).not.toBe(wrongOtp.message);
    expect(text).toContain('OTP');
  });

  it.each(['te', 'hi'])('"could not send the code" and "too many attempts" are shown in %s', (lang) => {
    expect(loginErrorText(smsFailed, 'send', STR[lang], lang)).toBe(STR[lang].loginErrSendFailed);
    expect(loginErrorText(tooMany, 'send', STR[lang], lang)).toBe(STR[lang].loginErrTooMany);
    expect(loginErrorText(tooMany, 'verify', STR[lang], lang)).toBe(STR[lang].loginErrTooMany);
    for (const k of ['loginErrOtpInvalid', 'loginErrSendFailed', 'loginErrTooMany']) expect(STR[lang][k]).not.toBe(STR.en[k]);
  });

  it('an error the app does not recognise: the server sentence in English, the app\'s own message otherwise', () => {
    const odd = new ApiError(500, 'Something broke on our side');
    expect(loginErrorText(odd, 'verify', STR.en, 'en')).toBe('Something broke on our side');
    expect(loginErrorText(odd, 'verify', STR.te, 'te')).toBe(STR.te.mobileErrVerify);
    expect(loginErrorText(odd, 'send', STR.hi, 'hi')).toBe(STR.hi.mobileErrSend);
  });

  it('no connection (the request never reached the server): the app\'s own message, as before', () => {
    const offline = new TypeError('Network request failed');
    expect(loginErrorText(offline, 'send', STR.en, 'en')).toBe(STR.en.mobileErrSend);
    expect(loginErrorText(offline, 'verify', STR.te, 'te')).toBe(STR.te.mobileErrVerify);
  });
});
