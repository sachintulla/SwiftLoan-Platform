import { serverErrorText, serverErrorReason } from '../src/utils/serverErrors';
import { ApiError } from '../src/api/client';
import { STR } from '../src/i18n/strings';

// Profile, About you, Basic details and More details used to show the server's English
// sentence as it came, whatever the app language.
describe('save errors follow the app language', () => {
  const emailTaken = new ApiError(409, 'This email is already in use by another account.');
  const phoneTaken = new ApiError(409, 'This phone is already in use by another account.');
  const badValue = new ApiError(400, 'MonthlyIncome: Number must be greater than or equal to 5000');
  const tooMany = new ApiError(429, 'Too many requests');
  const broken = new ApiError(500, 'Internal server error');

  it('English shows the server sentence exactly as before', () => {
    for (const e of [emailTaken, phoneTaken, badValue, tooMany, broken]) {
      expect(serverErrorText(e, STR.en.couldNotSaveRetry, STR.en, 'en')).toBe(e.message);
    }
  });

  it.each(['te', 'hi'])('%s: each known error has its own translated message', (lang) => {
    const t = STR[lang];
    expect(serverErrorText(emailTaken, t.couldNotSaveRetry, t, lang)).toBe(t.errEmailInUse);
    expect(serverErrorText(phoneTaken, t.couldNotSaveRetry, t, lang)).toBe(t.errDetailInUse);
    expect(serverErrorText(badValue, t.couldNotSaveRetry, t, lang)).toBe(t.errCheckDetails);
    expect(serverErrorText(tooMany, t.couldNotSaveRetry, t, lang)).toBe(t.loginErrTooMany);
    for (const k of ['errEmailInUse', 'errDetailInUse', 'errCheckDetails']) expect(t[k]).not.toBe(STR.en[k]);
  });

  it.each(['te', 'hi'])('%s: an unrecognised error becomes the screen\'s own translated message, never English', (lang) => {
    const t = STR[lang];
    expect(serverErrorText(broken, t.mdErrSave, t, lang)).toBe(t.mdErrSave);
    expect(serverErrorText(broken, t.basicErrStart, t, lang)).toBe(t.basicErrStart);
    expect(serverErrorText(broken, t.couldNotDeleteAccount, t, lang)).toBe(t.couldNotDeleteAccount);
  });

  it('no connection: the screen\'s own message in every language', () => {
    const offline = new TypeError('Network request failed');
    expect(serverErrorText(offline, STR.en.aboutYouSaveErr, STR.en, 'en')).toBe(STR.en.aboutYouSaveErr);
    expect(serverErrorText(offline, STR.te.aboutYouSaveErr, STR.te, 'te')).toBe(STR.te.aboutYouSaveErr);
  });

  it('the voice agent still gets the server\'s real reason, in any app language', () => {
    expect(serverErrorReason(emailTaken, STR.te.couldNotSaveRetry)).toBe(emailTaken.message);
    expect(serverErrorReason(new TypeError('x'), STR.te.couldNotSaveRetry)).toBe(STR.te.couldNotSaveRetry);
  });
});
