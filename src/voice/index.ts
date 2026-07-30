import { ELLO_CONFIGURED } from './config';
import { registerCoreTools } from './tools';
// TEMPORARY — live device test of the swappable WebRTC transport (see
// transports/webrtc/README.md). Revert to the two lines below once tested:
//   import { ElloAgent } from './agent';
//   import { ELLO_API_BASE, ELLO_API_KEY, ELLO_ASSISTANT_ID, ELLO_WS_URL } from './config';
//   import { micCapture, pcmPlayer } from './audio/nativeAudioBridge';
//   import { requestConfirmation } from './ui/confirmationBridge';
//   export const agent = new ElloAgent({...}, micCapture, pcmPlayer, requestConfirmation);
import { webrtcAgent as agent } from './transports/webrtc';
export { agent };

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
