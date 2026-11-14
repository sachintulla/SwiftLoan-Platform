// PAN-card photo → PAN number, via on-device OCR.
//
// The image is read by a native OCR module (iOS Vision / Android ML Kit) so the
// card never leaves the device; here we pick the photo and pull the 10-char PAN
// out of the recognized text. Fire the animation from the caller.
import { NativeModules, Platform } from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  type ImagePickerResponse,
} from 'react-native-image-picker';
import { ensureCameraPermission } from './cameraPermission';

const PanOcrModule: { recognize?: (path: string) => Promise<string> } =
  NativeModules?.PanOcrModule ?? {};

/** True PAN shape: 5 letters, 4 digits, 1 letter (e.g. AAAPL1234C). */
const PAN_RE = /[A-Z]{5}[0-9]{4}[A-Z]/;

/**
 * Extract the PAN number from raw OCR text. Tries the text as-is first, then a
 * whitespace-stripped pass (OCR often splits the PAN as "ABCDE 1234 F"). Returns
 * null when nothing PAN-shaped is present.
 */
export function extractPan(text: string): string | null {
  if (!text) return null;
  const up = text.toUpperCase();
  const direct = up.match(PAN_RE);
  if (direct) return direct[0];
  const squished = up.replace(/[^A-Z0-9]/g, '');
  const m = squished.match(PAN_RE);
  return m ? m[0] : null;
}

export type PanScanResult =
  | { pan: string; text: string }
  | { pan: null; reason: 'cancelled' | 'no_image' | 'unavailable' | 'not_found' | 'error'; text?: string }
  /** The camera could not be opened: permission refused (`blocked` = only Settings can turn it on), or no camera. */
  | { pan: null; reason: 'camera_permission'; blocked: boolean }
  | { pan: null; reason: 'camera_unavailable' };

/** Whether the native OCR module is present in this build. */
export function panOcrAvailable(): boolean {
  return typeof PanOcrModule.recognize === 'function';
}

async function readAsset(res: ImagePickerResponse): Promise<PanScanResult> {
  if (res.didCancel) return { pan: null, reason: 'cancelled' };
  // The picker's own refusals used to fall through as "no image" and vanish silently.
  if (res.errorCode === 'permission') return { pan: null, reason: 'camera_permission', blocked: true };
  if (res.errorCode === 'camera_unavailable') return { pan: null, reason: 'camera_unavailable' };
  const uri = res.assets?.[0]?.uri;
  if (!uri) return { pan: null, reason: 'no_image' };
  if (!panOcrAvailable()) return { pan: null, reason: 'unavailable' };
  try {
    // Android needs a filesystem path; iOS Vision accepts file:// too.
    const path = Platform.OS === 'android' ? uri : uri.replace('file://', '');
    const text = await PanOcrModule.recognize!(path);
    const pan = extractPan(text);
    return pan ? { pan, text } : { pan: null, reason: 'not_found', text };
  } catch {
    return { pan: null, reason: 'error' };
  }
}

/** Take a photo of the PAN card and read the number from it. */
export async function scanPanFromCamera(): Promise<PanScanResult> {
  // Ask first: without the runtime permission the picker opens nothing at all on Android.
  const perm = await ensureCameraPermission();
  if (perm !== 'granted') return { pan: null, reason: 'camera_permission', blocked: perm === 'blocked' };
  const res = await launchCamera({ mediaType: 'photo', quality: 1, saveToPhotos: false });
  return readAsset(res);
}

/** Pick an existing PAN-card photo and read the number from it. */
export async function scanPanFromLibrary(): Promise<PanScanResult> {
  const res = await launchImageLibrary({ mediaType: 'photo', quality: 1, selectionLimit: 1 });
  return readAsset(res);
}
