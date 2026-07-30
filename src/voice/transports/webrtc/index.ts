// Barrel + drop-in singleton for the swappable WebRTC transport. See
// ./README.md before wiring this in — the tool-calling protocol over this
// transport is unverified.
import { WebRTCAgent } from './WebRTCAgent';
import { ELLO_API_KEY, ELLO_ASSISTANT_ID, ELLO_API_BASE, ELLO_WEBRTC_WS_URL } from './config';
import { requestConfirmation } from '../../ui/confirmationBridge';

export { WebRTCAgent } from './WebRTCAgent';
export { ELLO_WEBRTC_WS_URL } from './config';

/**
 * Same shape as ../../index.ts's `agent` singleton, for easy swap-testing:
 *
 *   // in src/voice/index.ts
 *   import { webrtcAgent as agent } from './transports/webrtc';
 *
 * ensureToolsRegistered/VoiceWidget/screen registration all keep working
 * unchanged, since both transports satisfy AgentLike (../../types.ts).
 */
export const webrtcAgent = new WebRTCAgent(
  {
    apiKey: ELLO_API_KEY || '',
    assistantId: ELLO_ASSISTANT_ID || '',
    apiBaseUrl: ELLO_API_BASE,
    wsUrl: ELLO_WEBRTC_WS_URL,
  },
  requestConfirmation,
);
