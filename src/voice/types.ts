// Ported from @ello/agent-sdk's types.ts — the DOM-free half of the SDK's public
// surface. Kept structurally identical to the wire protocol documented in
// ello-agent-sdk/VOICE_PROTOCOL_REFERENCE.md so this client speaks the same protocol.

export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  enum?: string[];
  description?: string;
  items?: JSONSchema;
  [key: string]: unknown;
}

export interface ToolContext {
  toolCallId: string;
  signal: AbortSignal;
}

export interface ClientToolOptions<TArgs = Record<string, unknown>> {
  name: string;
  description: string;
  schema?: JSONSchema;
  handler: (args: TArgs, ctx: ToolContext) => Promise<unknown> | unknown;
  sensitive?: boolean;
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
  timeoutMs?: number;
  availableWhen?: () => boolean;
}

export interface WireToolDef {
  name: string;
  description: string;
  parameters?: JSONSchema;
  sensitive?: boolean;
  requires_confirmation?: boolean;
  timeout_ms?: number;
  available?: boolean;
}

export type AgentStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'executingTool' | 'ended';

export interface ToolCallEvent {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResultStatus {
  toolCallId: string;
  status: 'ok' | 'denied' | 'error';
  result?: unknown;
  error?: { code: string; message: string };
}

export type ToolResultEvent = ToolResultStatus;

export interface TranscriptEvent {
  role: 'user' | 'agent';
  text: string;
  final: boolean;
}

export interface ToolsAck {
  accepted: string[];
  rejected: string[];
}

export interface AgentEventMap {
  statusChange: AgentStatus;
  transcript: TranscriptEvent;
  toolCall: ToolCallEvent;
  toolResult: ToolResultEvent;
  toolsAck: ToolsAck;
  error: Error;
  sessionEnd: undefined;
}

export type PageContextProvider = () => Record<string, unknown>;

export interface ElloAgentOptions {
  apiKey: string;
  assistantId: string;
  apiBaseUrl?: string;
  wsUrl?: string;
  debug?: boolean;
}

// Narrow contracts the ported agent depends on — implemented for RN by
// src/voice/audio/nativeAudioBridge.ts (mic/playback) and
// src/voice/ui/confirmationBridge.ts (confirm), replacing the browser SDK's
// DOM-based MicCapture/PcmPlayer/tools/confirmation.ts.
export interface MicCapture {
  start(onChunk: (base64: string) => void): Promise<void>;
  stop(): void;
}

export interface PcmPlayer {
  playChunk(base64: string): void;
  purge(): void;
}

export type ConfirmFn = (message: string) => Promise<boolean>;
