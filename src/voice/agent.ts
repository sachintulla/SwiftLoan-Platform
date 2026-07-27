// Ported from @ello/agent-sdk's agent.ts (ElloAgent). The state machine, message
// handling, and tool-dispatch/validation/timeout/abort logic are unchanged from
// the browser SDK — only the three DOM-bound collaborators (mic capture, PCM
// playback, confirmation UI) are swapped for RN-native implementations, passed
// in via the constructor instead of owned internally.
import { Emitter } from './events';
import { ToolRegistry } from './registry';
import { ElloSocket } from './transport/ws';
import { createVoiceSession } from './transport/sessionApi';
import { vlog } from './log';
import type {
  AgentEventMap,
  AgentStatus,
  ClientToolOptions,
  ConfirmFn,
  ElloAgentOptions,
  MicCapture,
  PageContextProvider,
  PcmPlayer,
} from './types';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;

export class ElloAgent {
  conversationId: string | null = null;

  private registry = new ToolRegistry();
  private emitter = new Emitter<AgentEventMap>();
  private socket: ElloSocket | null = null;
  private status: AgentStatus = 'idle';
  private muted = false;
  // Concurrent tool calls, keyed by tool_call_id — the backend model (Gemini
  // Live) can fire several client-tool-call messages per turn; there is no
  // client-side batching, each is executed and answered independently.
  private inflight = new Map<string, AbortController>();
  private pageContextFn: PageContextProvider | null = null;
  private pageContextFlushScheduled = false;
  private audioOutCount = 0;
  // Generation counter for start(). start() awaits a REST call and a WebSocket
  // handshake, during which this.socket is still null — so a stop() in that window
  // used to cancel nothing, and the in-flight start would then bring the session up
  // *after* the user hung up. Every start captures a token; if stop() (or another
  // start) bumps it, the stale start unwinds instead of installing itself.
  private startToken = 0;

  constructor(
    private options: ElloAgentOptions,
    private mic: MicCapture,
    private player: PcmPlayer,
    private confirm: ConfirmFn,
  ) {}

  registerTool<TArgs>(def: ClientToolOptions<TArgs>): void {
    this.registry.register(def as ClientToolOptions);
  }

  unregisterTool(name: string): void {
    this.registry.unregister(name);
  }

  registerPageContext(fn: PageContextProvider): void {
    this.pageContextFn = fn;
  }

  // All tools must already be registered before the first voice-session-start —
  // Gemini Live cannot add function declarations mid-session. Calling this after
  // that point only refreshes the (advisory) `available` flag + page_context.
  //
  // Coalesced via a microtask: every navigation fires TWO callers in the same
  // commit — store.ts's screen-change effect and Frame.tsx's control-discovery
  // effect — each calling this independently. Without batching that sent two
  // near-identical client-tools-update messages back to back, which cost the
  // backend an extra full turn to process (observed server-side as a doubled
  // "provider can't update tools live" log line and real added latency before
  // the agent spoke). Queuing the actual send lets both synchronous calls
  // collapse into one message using the freshest tools/page_context by the
  // time the microtask runs.
  updatePageContext(): void {
    if (this.pageContextFlushScheduled) return;
    this.pageContextFlushScheduled = true;
    Promise.resolve().then(() => {
      this.pageContextFlushScheduled = false;
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      // Field name is "tools" here (native_orchestrator.py's on_client_tools_update
      // reads msg.get("tools")) — note this differs from voice-session-start's
      // own "client_tools" field below; that asymmetry is real, not a typo.
      this.socket!.send({
        type: 'client-tools-update',
        tools: this.registry.toWire(),
        page_context: this.pageContextFn?.() ?? {},
      });
    });
  }

  on<K extends keyof AgentEventMap>(event: K, fn: (payload: AgentEventMap[K]) => void): () => void {
    return this.emitter.on(event, fn);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  async start(): Promise<void> {
    vlog('start() called; apiKeySet=', !!this.options.apiKey, 'assistantId=', this.options.assistantId);
    if (!this.options.apiKey || !this.options.assistantId) {
      vlog('ABORT: apiKey/assistantId not configured');
      throw new Error('ElloAgent: apiKey/assistantId not configured');
    }
    if (this.socket) {
      vlog('start() ignored — socket already exists');
      return;
    }

    const token = ++this.startToken;
    const cancelled = () => token !== this.startToken;

    this.setStatus('connecting');
    try {
      vlog('POST call ->', this.options.apiBaseUrl);
      const { conversationId } = await createVoiceSession(this.options);
      if (cancelled()) {
        vlog('start aborted after REST — stop() was pressed');
        return;
      }
      this.conversationId = conversationId;
      vlog('REST ok conv=', conversationId);

      const socket = new ElloSocket(this.options.wsUrl!);
      socket.onMessage(msg => this.handleMessage(msg));
      socket.onClose(() => {
        vlog('WS CLOSED');
        this.teardown();
      });
      vlog('WS connecting ->', this.options.wsUrl);
      await socket.connect();
      if (cancelled()) {
        // The user hung up mid-handshake: close the socket we just opened rather
        // than leaving an orphaned session streaming in the background.
        vlog('start aborted after WS open — closing orphan socket');
        try {
          socket.send({ type: 'voice-session-end' });
          socket.close();
        } catch {
          /* already gone */
        }
        this.teardown();
        return;
      }
      this.socket = socket;
      vlog('WS OPEN');

      const tools = this.registry.toWire();
      socket.send({
        type: 'voice-session-start',
        conversation_id: conversationId,
        client_tools: tools,
        page_context: this.pageContextFn?.() ?? {},
      });
      vlog('sent voice-session-start; tools=', tools.map(t => t.name));

      let sentChunks = 0;
      await this.mic.start(base64 => {
        // A stale capture callback must not keep feeding a session the user ended.
        if (cancelled() || this.muted) return;
        // Field name is "data" (confirmed from ello-app's own
        // ello_websocket_manager.py: `data.get("data")`) — NOT "audio".
        this.socket?.send({ type: 'voice-audio-input', data: base64, sample_rate: 16000, channels: 1 });
        if (++sentChunks % 50 === 0) vlog('audio-input sent chunks=', sentChunks);
      });
      if (cancelled()) {
        vlog('start aborted after mic open — tearing down');
        this.mic.stop();
        this.socket = null;
        try {
          socket.send({ type: 'voice-session-end' });
          socket.close();
        } catch {
          /* already gone */
        }
        this.teardown();
        return;
      }
      vlog('mic.start() resolved — streaming audio');
      this.setStatus('listening');
    } catch (e: any) {
      vlog('START FAILED:', e?.message || String(e));
      this.emitter.emit('error', e instanceof Error ? e : new Error(String(e)));
      this.teardown();
      throw e;
    }
  }

  async stop(): Promise<void> {
    // Invalidate any start() still in flight so it unwinds instead of connecting
    // after the user hung up.
    this.startToken++;
    vlog('stop() called; hadSocket=', !!this.socket);
    this.mic.stop();
    this.player.purge();
    for (const controller of this.inflight.values()) controller.abort();
    this.inflight.clear();
    this.socket?.send({ type: 'voice-session-end' });
    this.socket?.close();
    this.teardown();
  }

  private teardown(): void {
    this.socket = null;
    this.conversationId = null;
    this.setStatus('idle');
  }

  private setStatus(status: AgentStatus): void {
    this.status = status;
    this.emitter.emit('statusChange', status);
  }


  private handleMessage(msg: any): void {
    // Log every inbound frame type except the high-rate audio stream (counted
    // separately below) so a stalled pipeline shows exactly where it stopped.
    if (msg?.type !== 'voice-audio-output') {
      vlog('RECV', msg?.type, JSON.stringify(msg ?? {}).slice(0, 300));
    }
    switch (msg?.type) {
      case 'session-established':
        this.setStatus('listening');
        break;
      case 'voice-audio-output':
        this.audioOutCount++;
        if (this.audioOutCount <= 2 || this.audioOutCount % 50 === 0) {
          vlog('RECV voice-audio-output #', this.audioOutCount, 'fmt=', msg.format);
        }
        this.player.playChunk(msg.audio);
        this.setStatus('speaking');
        break;
      case 'voice-audio-stream-end':
        if (this.inflight.size === 0) this.setStatus('listening');
        break;
      case 'voice-audio-purge':
        // Server-side barge-in: the user talked over the agent, so drop queued
        // audio immediately. The mic deliberately stays live throughout — echo is
        // handled by the platform AEC in VoiceAudioModule, not by muting, so the
        // user can always interrupt.
        vlog('RECV voice-audio-purge — barge-in, clearing playback');
        this.player.purge();
        this.setStatus('listening');
        break;
      case 'conversation-text':
        // Server wraps payloads under "data"; is_interim is inverted from "final".
        this.emitter.emit('transcript', {
          role: msg.data?.source === 'agent' ? 'agent' : 'user',
          text: msg.data?.text ?? '',
          final: !msg.data?.is_interim,
        });
        break;
      case 'client-tool-call':
        this.executeToolCall(msg.tool_call_id, msg.name, msg.args || {});
        break;
      case 'client-tool-cancel':
        this.inflight.get(msg.tool_call_id)?.abort();
        break;
      case 'client-tools-ack':
        this.emitter.emit('toolsAck', { accepted: msg.accepted ?? [], rejected: msg.rejected ?? [] });
        break;
      case 'session-ended':
        this.teardown();
        this.emitter.emit('sessionEnd', undefined);
        break;
      case 'error-occurred':
        this.emitter.emit('error', new Error(msg.error?.message || 'ello agent error'));
        break;
      default:
        break;
    }
  }

  private async executeToolCall(toolCallId: string, name: string, args: Record<string, unknown>): Promise<void> {
    vlog('TOOL CALL', name, JSON.stringify(args));
    this.emitter.emit('toolCall', { toolCallId, name, args });
    const tool = this.registry.get(name);
    const controller = new AbortController();
    this.inflight.set(toolCallId, controller);
    this.setStatus('executingTool');

    // status/error shape matches native_orchestrator.py's
    // _client_tool_result_for_model exactly: 'ok' -> result payload, 'denied' ->
    // special-cased "user declined" messaging, anything else -> reply.error.{code,message}.
    const respond = (status: 'ok' | 'denied' | 'error', result?: unknown, error?: { code: string; message: string }) => {
      this.inflight.delete(toolCallId);
      vlog('TOOL RESULT', status, JSON.stringify(result ?? error ?? {}));
      this.socket?.send({ type: 'client-tool-result', tool_call_id: toolCallId, status, result, error });
      this.emitter.emit('toolResult', { toolCallId, status, result, error });
      if (this.inflight.size === 0) this.setStatus('listening');
    };
    const fail = (code: string, message: string) => respond('error', undefined, { code, message });

    if (!tool) {
      fail('unknown_tool', `unknown tool: ${name}`);
      return;
    }
    // availableWhen is a soft gate only — the server's last-known `available`
    // flag can be stale, so it is always re-checked here before running.
    if (tool.availableWhen && !tool.availableWhen()) {
      fail('tool_unavailable', 'tool unavailable on current screen');
      return;
    }

    const validation = this.registry.validateArgs(tool, args);
    if (!validation.ok) {
      fail('invalid_args', validation.error);
      return;
    }

    if (tool.requiresConfirmation) {
      const allowed = await this.confirm(tool.confirmationMessage || `Allow "${tool.name}"?`);
      if (!allowed) {
        respond('denied');
        return;
      }
    }

    const timeoutMs = Math.min(tool.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    try {
      const result = await this.runWithTimeout(
        Promise.resolve(tool.handler(args, { toolCallId, signal: controller.signal })),
        timeoutMs,
        controller.signal,
      );
      respond('ok', result);
    } catch (e: any) {
      fail('tool_handler_failed', e?.message || 'tool handler failed');
    }
  }

  private runWithTimeout<T>(promise: Promise<T>, timeoutMs: number, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('tool call timed out')), timeoutMs);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error('tool call aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        v => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          resolve(v);
        },
        e => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          reject(e);
        },
      );
    });
  }
}
