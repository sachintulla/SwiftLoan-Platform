// Wraps the native VoiceAudioModule (iOS: Voice/VoiceAudioModule.swift, Android:
// com/swiftloan/voice/VoiceAudioModule.kt) in the MicCapture/PcmPlayer contracts
// the ported ElloAgent expects, replacing the browser SDK's audio/capture.ts and
// audio/playback.ts (Web Audio API — no RN equivalent).
import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import type { MicCapture, PcmPlayer } from '../types';
import { vlog } from '../log';

const { VoiceAudioModule } = NativeModules as { VoiceAudioModule?: any };
const emitter = VoiceAudioModule ? new NativeEventEmitter(VoiceAudioModule) : null;

async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
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
