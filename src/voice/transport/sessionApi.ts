// Ported from @ello/agent-sdk's transport/session-api.ts (createVoiceSession) —
// uses only the global fetch, which React Native provides natively.
//
// Endpoint shape (POST /api/agents/{assistantId}/calls) is taken from a real
// captured request against api-stage.getello.ai rather than the SDK's own
// documented /api/agents/publish — the live service has apparently moved on
// from what's in the local ello-agent-sdk repo's docs/demo. Auth stays on
// x-api-key (matches the SDK's own code) rather than the Bearer JWT also seen
// in that capture, since that JWT is a short-lived dashboard-login session
// token, not a stable credential meant for embedding in an app.
import type { ElloAgentOptions } from '../types';

// Unlike src/api/client.ts's request(), this had no timeout at all — on a dead
// network (no signal, DNS blackhole) the underlying fetch can hang far longer
// than a user will wait for the agent to respond, with no error ever surfacing
// to tell them why. Matches REQUEST_TIMEOUT_MS's budget in client.ts.
const SESSION_START_TIMEOUT_MS = 12000;

function generateMemoryId(): string {
  // RFC4122-ish v4 UUID, no crypto.randomUUID() dependency.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function createVoiceSession(options: ElloAgentOptions): Promise<{ conversationId: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SESSION_START_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${options.apiBaseUrl}/api/agents/${options.assistantId}/calls`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': options.apiKey,
      },
      body: JSON.stringify({
        assistant_id: options.assistantId,
        agent_type: 'webcall',
        call_type: 'outbound',
        name: '',
        message: 'Hi! I can help you navigate SwiftLoan by voice — what would you like to do?',
        memory_id: generateMemoryId(),
      }),
      signal: controller.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error(`ello: call request timed out after ${SESSION_START_TIMEOUT_MS}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`ello: failed to start call (${res.status})`);
  const json = await res.json().catch(() => ({}));
  const conversationId =
    json?.data?.call_id ?? json?.call_id ?? json?.data?.conversation_id ?? json?.conversation_id ?? json?.id;
  if (!conversationId) throw new Error('ello: missing call/conversation id in response');
  return { conversationId };
}
