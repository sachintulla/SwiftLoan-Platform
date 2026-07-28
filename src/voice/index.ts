import { ElloAgent } from './agent';
import { ELLO_API_BASE, ELLO_API_KEY, ELLO_ASSISTANT_ID, ELLO_CONFIGURED, ELLO_WS_URL } from './config';
import { micCapture, pcmPlayer } from './audio/nativeAudioBridge';
import { requestConfirmation } from './ui/confirmationBridge';
import { registerCoreTools } from './tools';

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
