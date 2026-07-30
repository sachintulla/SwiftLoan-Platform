import { Platform } from 'react-native';

// Re-exported so this folder is self-contained — everything the WebRTC
// transport needs is importable from here, without reaching into ../../config
// elsewhere. See ./README.md for why this folder exists and what's unverified.
export { ELLO_API_KEY, ELLO_ASSISTANT_ID, ELLO_API_BASE, ELLO_CONFIGURED } from '../../config';

/**
 * Real-WebRTC signaling endpoint — a DIFFERENT service path from the default
 * transport's ELLO_WS_URL (/ws-ello, the custom chunk-streaming protocol).
 *
 * Best-guess default: same host, "/ws" instead of "/ws-ello" — per
 * ../../config.ts's own comment ("/ws routes to an unrelated generic
 * chat/WebRTC signaling manager") and the Ello dashboard's own browser
 * capture, which connects to a ".../ws" path. NOT CONFIRMED against the real
 * stage environment — verify with a real signaling test first (see README.md).
 */
export const ELLO_WEBRTC_WS_URL: string =
  (globalThis as any).SWIFTLOAN_ELLO_WEBRTC_WS_URL ||
  (Platform.OS === 'android' ? 'ws://10.0.2.2:8080/ws' : 'ws://localhost:8080/ws');
