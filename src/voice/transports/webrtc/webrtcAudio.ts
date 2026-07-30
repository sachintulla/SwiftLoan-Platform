// Mic capture + speaker routing for the WebRTC transport. Mirrors
// ellomobilesdk's WebRTCService.getUserMedia() constraints — the ones that get
// the platform's real WebRTC engine to run full echo cancellation, noise
// suppression, and gain control, backed by a genuine two-way call. See
// ./README.md for why this differs from the default transport's approach.
import { mediaDevices } from 'react-native-webrtc';
import type { MediaStream } from 'react-native-webrtc';

// Optional peer dependency — defensively required so this file (and the whole
// transport) still loads if it's absent; speaker routing then falls back to
// whatever the OS defaults an active call to.
let InCallManager: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('react-native-incall-manager');
  InCallManager = mod?.default ?? mod;
} catch {
  // absent — see comment above.
}

// Matches ellomobilesdk's OPTIMIZED_ICE_SERVERS (src/config/index.ts) exactly —
// its own comment names the reason: "Many mobile networks (Jio, Airtel, vivo
// OEM ROMs)... use strict NAT that blocks inbound UDP... TURN relay on
// TCP/443 bypasses this — it's the only reliable fix." Our test devices are
// on Airtel — this is not a hypothetical for us. Plain STUN alone (what this
// file used to configure) cannot establish media on networks like that.
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  {
    urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443'],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

/**
 * Waits (briefly) for ICE candidate gathering so the SDP we send has real
 * candidates embedded in it, matching ellomobilesdk's own approach — its
 * ElloAiSdk.ts explicitly waits and sends `pc.localDescription.sdp` (which
 * accumulates candidates as they're found) rather than the bare offer
 * `createOffer()` returns. Sending a candidate-less offer is a plausible
 * reason a signaling gateway would reject it outright and immediately,
 * which matches what we observed (rejection within ~500ms of sending it).
 */
export function waitForIceGathering(pc: any, timeoutMs = 1200): Promise<void> {
  return new Promise(resolve => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') {
        if (timer) clearTimeout(timer);
        pc.removeEventListener?.('icegatheringstatechange', onChange);
        resolve();
      }
    };
    pc.addEventListener?.('icegatheringstatechange', onChange);
    timer = setTimeout(() => {
      pc.removeEventListener?.('icegatheringstatechange', onChange);
      resolve();
    }, timeoutMs);
  });
}

export async function getLocalAudioStream(): Promise<MediaStream> {
  // react-native-webrtc's MediaTrackConstraints type doesn't model these
  // fields (sampleRate/{ideal:...} shapes) even though the native layer
  // accepts them — same constraint object ellomobilesdk's WebRTCService uses.
  const constraints = {
    audio: {
      sampleRate: 48000,
      channelCount: 1,
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: true },
    },
    video: false,
  } as any;
  return mediaDevices.getUserMedia(constraints) as unknown as Promise<MediaStream>;
}

// Delays (ms) at which speakerphone is re-asserted after the remote track
// arrives. WebRTC's own native audio engine can silently reset the output
// route back to the earpiece shortly after attaching a remote track — Ello's
// own SDK docs describe this exact race on iOS ("WebRTC re-activates the
// audio session and silently resets the output route to the quiet earpiece...
// re-assert the route with delayed retries to win against WebRTC's late
// activation"). Our first, single, synchronous call had no such retry, so a
// later reset by WebRTC would win silently — observed as audio playing from
// the earpiece instead of the loudspeaker on some calls.
const SPEAKER_REASSERT_DELAYS_MS = [0, 300, 800, 1500];

function forceSpeakerphoneOnce(): void {
  try {
    InCallManager?.start?.({ media: 'audio' });
    InCallManager?.setForceSpeakerphoneOn?.(true);
    InCallManager?.setSpeakerphoneOn?.(true);
  } catch {
    // optional dependency absent or platform call failed — OS default applies.
  }
}

/** Route the call to the loudspeaker (this is a hands-free in-app assistant, not a phone call held to the ear). */
export function startSpeakerRouting(): void {
  for (const delay of SPEAKER_REASSERT_DELAYS_MS) {
    if (delay === 0) forceSpeakerphoneOnce();
    else setTimeout(forceSpeakerphoneOnce, delay);
  }
}

export function stopSpeakerRouting(): void {
  try {
    InCallManager?.stop?.();
  } catch {
    // ignore — nothing to clean up if it was never started.
  }
}
