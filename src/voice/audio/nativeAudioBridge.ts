// Wraps the native VoiceAudioModule (iOS: Voice/VoiceAudioModule.swift, Android:
// com/swiftloan/voice/VoiceAudioModule.kt) in the MicCapture/PcmPlayer contracts
// the ported ElloAgent expects, replacing the browser SDK's audio/capture.ts and
// audio/playback.ts (Web Audio API — no RN equivalent).
import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import type { MicCapture, PcmPlayer } from '../types';
import { vlog } from '../log';

const { VoiceAudioModule } = NativeModules as { VoiceAudioModule?: any };
const emitter = VoiceAudioModule ? new NativeEventEmitter(VoiceAudioModule) : null;

/**
 * Subscribe to the agent's live playback loudness (0…1), emitted per PCM chunk
 * while Ruby is speaking. Drives the on-device "talking" animation of the
 * Support avatar — no external lip-sync service. Returns an unsubscribe fn.
 */
export function onAudioLevel(cb: (level: number) => void): () => void {
  if (!emitter) return () => undefined;
  const sub = emitter.addListener('onAudioLevel', (e: { level?: number }) => cb(e?.level ?? 0));
  return () => sub.remove();
}

async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    // BLUETOOTH_CONNECT (Android 12+) gates whether a connected headset shows
    // up in the native module's device list at all — without it granted,
    // VoiceAudioModule's Bluetooth-preferred routing silently falls back to
    // the speaker even with a real headset connected. Requested alongside
    // the mic in one prompt rather than a separate ask; declining it is
    // non-fatal, the call still works over the speaker either way, so only
    // RECORD_AUDIO's result gates whether the call can start at all.
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
  }
  if (VoiceAudioModule?.requestMicPermission) {
    try {
      return await VoiceAudioModule.requestMicPermission();
    } catch {
      return false;
    }
  }
  return false;
}

let chunkSubscription: { remove(): void } | null = null;

export const micCapture: MicCapture = {
  async start(onChunk: (base64: string) => void): Promise<void> {
    vlog('mic.start(): nativeModulePresent=', !!VoiceAudioModule);
    if (!VoiceAudioModule || !emitter) {
      throw new Error('VoiceAudioModule native module not available (rebuild the app after adding it)');
    }
    const granted = await ensureMicPermission();
    vlog('mic permission granted=', granted);
    if (!granted) throw new Error('microphone permission denied');

    chunkSubscription?.remove();
    chunkSubscription = emitter.addListener('onAudioChunk', (e: { base64: string }) => onChunk(e.base64));
    await VoiceAudioModule.startCapture();
  },
  stop(): void {
    chunkSubscription?.remove();
    chunkSubscription = null;
    VoiceAudioModule?.stopCapture();
  },
};

export const pcmPlayer: PcmPlayer = {
  playChunk(base64: string): void {
    VoiceAudioModule?.playChunk(base64);
  },
  purge(): void {
    VoiceAudioModule?.purgePlayback();
  },
};
