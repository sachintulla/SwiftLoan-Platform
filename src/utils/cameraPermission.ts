import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Ask for the camera right before opening it.
 *
 * Android: the manifest declares CAMERA, and react-native-image-picker then REFUSES to open the camera unless the
 * runtime permission is already granted (it answers errorCode 'permission' and nothing appears). The only place that
 * asked was the one-time `permissions` screen, which many sign-ins never show (returning users, resumed website
 * visitors), so the PAN photo and profile photo buttons silently did nothing. iOS asks by itself on first use.
 *
 *   granted — go ahead
 *   denied  — refused this time (we may ask again next tap)
 *   blocked — "Don't ask again": only the phone's Settings can turn it on
 */
export type CameraPermission = 'granted' | 'denied' | 'blocked';

export async function ensureCameraPermission(): Promise<CameraPermission> {
  if (Platform.OS !== 'android') return 'granted';
  try {
    const perm = PermissionsAndroid.PERMISSIONS.CAMERA;
    if (await PermissionsAndroid.check(perm)) return 'granted';
    const res = await PermissionsAndroid.request(perm);
    if (res === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
    return res === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
  } catch {
    return 'denied';
  }
}
