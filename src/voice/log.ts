import { NativeModules } from 'react-native';

/**
 * Voice-pipeline diagnostics — DEV BUILDS ONLY.
 *
 * Under the New Architecture (bridgeless) `console.log` does not stream to
 * logcat, so VoiceAudioModule.nativeLog() bridges it back:
 *
 *   adb logcat -s VoiceJS:D
 *
 * Compiled out of release builds, which matters beyond noise: these lines carry
 * WebSocket payloads including conversation transcripts, so emitting them from a
 * shipped build would leak what the user said into the device log.
 */
const ENABLED = typeof __DEV__ !== 'undefined' && __DEV__;

const mod = (NativeModules as any).VoiceAudioModule;

export function vlog(...parts: unknown[]): void {
  if (!ENABLED) return;
  const msg = parts
    .map(p => {
      if (typeof p === 'string') return p;
      try {
        return JSON.stringify(p);
      } catch {
        return String(p);
      }
    })
    .join(' ');
  try {
    mod?.nativeLog?.(msg);
  } catch {
    // never let diagnostics break the pipeline
  }
}
