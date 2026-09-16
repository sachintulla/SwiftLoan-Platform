import { ELLO_CONFIGURED } from './config';
import { registerCoreTools, type VoiceActions } from './tools';
// Stable transport: the WebSocket ElloAgent talking to the getello ws-ello
// backend (config.ts), with the native audio bridge for mic/playback. The
// swappable WebRTC transport under transports/webrtc/ remains available for
// experiments but its tool-calling protocol is unverified — do not wire it in.
import { ElloAgent } from './agent';
import { onTargetSetChanged } from './actionRegistry';
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

// A control appearing/disappearing anywhere (any screen, not just the current
// one — updatePageContext() itself always reads whatever's current) resets
// the debounced page_context send. See the long comment on updatePageContext
// in agent.ts for why: it's what lets a control fed by its own async fetch
// extend the wait instead of the debounce guessing a fixed duration upfront.
onTargetSetChanged(() => agent.updatePageContext());

let toolsRegistered = false;

/** Registers the generic UI-action tools exactly once, before first start(). */
export function ensureToolsRegistered(actions: VoiceActions): void {
  if (toolsRegistered) return;
  registerCoreTools(agent, actions);
  toolsRegistered = true;
}

export { ELLO_CONFIGURED };
export * from './types';
export * from './actionRegistry';
