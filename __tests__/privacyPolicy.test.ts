import AsyncStorage from '@react-native-async-storage/async-storage';
import { PRIVACY_POLICY_VERSION, PRIVACY_SECTIONS } from '../src/content/privacyPolicy';
import { savePrivacyAccepted, loadPrivacyAccepted } from '../src/state/session';

const section = (n: number) => PRIVACY_SECTIONS.find(s => s.title.startsWith(`${n}.`))!.body;

describe('privacy policy discloses Upshot', () => {
  it('is a new version (so consent is asked again)', () => {
    expect(PRIVACY_POLICY_VERSION).not.toBe('1.0');
  });

  it('names Upshot as a provider and says what it receives, in the sharing section', () => {
    const s6 = section(6);
    expect(s6).toMatch(/Upshot/);
    expect(s6).toMatch(/mobile number, name, email/);
    expect(s6).toMatch(/acts on our instructions/);
  });

  it('states that PAN, DOB, address, Aadhaar and credit score are NOT shared with Upshot', () => {
    const s6 = section(6);
    expect(s6).toMatch(/do NOT share your PAN, date of birth, address, Aadhaar details or credit score/i);
  });

  it('describes the activity and push identifier collected, and how to stop messages', () => {
    expect(section(2)).toMatch(/push-notification identifier/);
    expect(section(3)).toMatch(/push notifications appear only if you allow notifications/);
    expect(section(9)).toMatch(/phone’s settings/);
    expect(section(9)).toMatch(/grievance@swiftloan\.ai/);
  });

  it('never promises something the app does not do (no claim the Profile promo switch controls Upshot)', () => {
    const all = PRIVACY_SECTIONS.map(s => s.body).join(' ');
    expect(all).not.toMatch(/Profile .{0,40}(notification|promotion)/i);
  });
});

describe('versioned privacy acceptance', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('a new install has not accepted', async () => {
    expect(await loadPrivacyAccepted('1.1')).toBe(false);
  });

  it('accepting the current version is remembered', async () => {
    await savePrivacyAccepted('1.1');
    expect(await loadPrivacyAccepted('1.1')).toBe(true);
  });

  it('someone who accepted the old policy (stored as the bare flag "1") is asked again', async () => {
    await AsyncStorage.setItem('swiftloan.session.privacyAccepted', '1');
    expect(await loadPrivacyAccepted('1.1')).toBe(false);
  });

  it('a later policy version asks again', async () => {
    await savePrivacyAccepted('1.1');
    expect(await loadPrivacyAccepted('1.2')).toBe(false);
  });
});
