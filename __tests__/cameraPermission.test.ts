// The PAN photo / profile photo camera asks for the Android camera permission right before opening
// (the picker opens nothing without it, and the one-time permissions screen is often never shown).
import { PermissionsAndroid, Platform } from 'react-native';
import { ensureCameraPermission } from '../src/utils/cameraPermission';

const setOS = (os: string) => Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });

describe('ensureCameraPermission', () => {
  afterEach(() => { jest.restoreAllMocks(); setOS('ios'); });

  it('iOS: nothing to ask (the system prompts on first use)', async () => {
    setOS('ios');
    expect(await ensureCameraPermission()).toBe('granted');
  });

  it('Android: already granted → no prompt', async () => {
    setOS('android');
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
    const ask = jest.spyOn(PermissionsAndroid, 'request');
    expect(await ensureCameraPermission()).toBe('granted');
    expect(ask).not.toHaveBeenCalled();
  });

  it('Android: not granted → asks, and reports the answer', async () => {
    setOS('android');
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    const ask = jest.spyOn(PermissionsAndroid, 'request');
    ask.mockResolvedValueOnce(PermissionsAndroid.RESULTS.GRANTED);
    expect(await ensureCameraPermission()).toBe('granted');
    ask.mockResolvedValueOnce(PermissionsAndroid.RESULTS.DENIED);
    expect(await ensureCameraPermission()).toBe('denied');
    ask.mockResolvedValueOnce(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
    expect(await ensureCameraPermission()).toBe('blocked');
  });

  it('Android: a failing permission call is treated as denied, never a crash', async () => {
    setOS('android');
    jest.spyOn(PermissionsAndroid, 'check').mockRejectedValue(new Error('boom'));
    expect(await ensureCameraPermission()).toBe('denied');
  });
});
