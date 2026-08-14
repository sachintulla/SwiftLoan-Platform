import { ELLO_CONFIGURED } from './config';
import { registerCoreTools } from './tools';
// Stable transport: the WebSocket ElloAgent talking to the getello ws-ello
// backend (config.ts), with the native audio bridge for mic/playback. The
// swappable WebRTC transport under transports/webrtc/ remains available for
// experiments but its tool-calling protocol is unverified — do not wire it in.
import { ElloAgent } from './agent';
import { ELLO_API_BASE, ELLO_API_KEY, ELLO_ASSISTANT_ID, ELLO_WS_URL } from './config';
import { micCapture, pcmPlayer } from './audio/nativeAudioBridge';
import { requestConfirmation } from './ui/confirmationBridge';

export const agent = new ElloAgent(
  {
    apiKey: ELLO_API_KEY || '',
    assistantId: ELLO_ASSISTANT_ID || '',
    apiBaseUrl: ELLO_API_BASE,
    wsUrl: ELLO_WS_URL,
  },
  micCapture,
  pcmPlayer,
  requestConfirmation,
);

let toolsRegistered = false;

/** Registers the generic UI-action tools exactly once, before first start(). */
export function ensureToolsRegistered(navigateToScreen: (screen: string) => boolean): void {
  if (toolsRegistered) return;
  registerCoreTools(agent, navigateToScreen);
  toolsRegistered = true;
}

export { ELLO_CONFIGURED };
export * from './types';
export * from './actionRegistry';
