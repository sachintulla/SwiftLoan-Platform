import { Platform } from 'react-native';

/**
 * Config for the Ello voice backend — a separate external service (ello-app's
 * assistant-service/api-gateway), NOT SwiftLoan's own server/. Mirrors the
 * globalThis-override-with-dev-default convention already used for
 * SWIFTLOAN_API_BASE in src/api/client.ts, kept as its own set of variables so
 * the two hosts are never conflated.
 *
 * No baked-in fallback credential is shipped here on purpose — set these before
 * app start (e.g. in index.js for local dev):
 *   globalThis.SWIFTLOAN_ELLO_API_KEY = '...';
 *   globalThis.SWIFTLOAN_ELLO_ASSISTANT_ID = '...';
 *   globalThis.SWIFTLOAN_ELLO_API_BASE = 'http://<host>:5008';   // if not on localhost
 *   globalThis.SWIFTLOAN_ELLO_WS_URL = 'ws://<host>:8080/ws-ello';
 */
export const ELLO_API_KEY: string | null = (globalThis as any).SWIFTLOAN_ELLO_API_KEY || null;
export const ELLO_ASSISTANT_ID: string | null = (globalThis as any).SWIFTLOAN_ELLO_ASSISTANT_ID || null;

export const ELLO_API_BASE: string =
  (globalThis as any).SWIFTLOAN_ELLO_API_BASE ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:5008' : 'http://localhost:5008');

// /ws-ello (NOT /ws — that path routes to an unrelated generic chat/WebRTC
// signaling manager on the real server, confirmed by reading ello-app's own
// application_server.py route table) is ElloWebSocketManager's endpoint, the
// one that actually implements voice-session-start/voice-audio-input/etc.
export const ELLO_WS_URL: string =
  (globalThis as any).SWIFTLOAN_ELLO_WS_URL ||
  (Platform.OS === 'android' ? 'ws://10.0.2.2:8080/ws-ello' : 'ws://localhost:8080/ws-ello');

export const ELLO_CONFIGURED: boolean = !!(ELLO_API_KEY && ELLO_ASSISTANT_ID);

const isTestEnv = typeof jest !== 'undefined';

if (!ELLO_CONFIGURED && !isTestEnv && typeof __DEV__ !== 'undefined' && __DEV__) {
  console.warn(
    '[voice] SWIFTLOAN_ELLO_API_KEY / SWIFTLOAN_ELLO_ASSISTANT_ID not set — voice agent disabled. ' +
      'Set both globals (and _API_BASE/_WS_URL if the backend is not on localhost) before app start.',
  );
}
