// ── SWAPPABLE TRANSPORT — see ./README.md for why this exists, what's
// unverified, and why the tool-execution logic below is a deliberate copy of
// ../../agent.ts's rather than a shared import.
//
// Same public shape as ../../agent.ts's ElloAgent (both satisfy AgentLike in
// ../../types.ts), so ../../tools.ts's registerCoreTools() and the rest of the
// app work with either transport unchanged. What differs is only how bytes
// reach Ello: this one opens a real WebRTC call (real mic/speaker, real
// platform echo cancellation) instead of streaming base64 PCM chunks over a
// plain WebSocket.
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
} from 'react-native-webrtc';
import type { MediaStream, MediaStreamTrack } from 'react-native-webrtc';
import { Emitter } from '../../events';
import { ToolRegistry } from '../../registry';
import { ElloSocket } from '../../transport/ws';
import { createVoiceSession } from '../../transport/sessionApi';
import { vlog } from '../../log';
import { getLocalAudioStream, startSpeakerRouting, stopSpeakerRouting, ICE_SERVERS, waitForIceGathering } from './webrtcAudio';
import { ELLO_WEBRTC_WS_URL } from './config';
import type {
  AgentEventMap,
  AgentStatus,
  ClientToolOptions,
  ConfirmFn,
  ElloAgentOptions,
  PageContextProvider,
} from '../../types';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;

export class WebRTCAgent {
  conversationId: string | null = null;

  private registry = new ToolRegistry();
  private emitter = new Emitter<AgentEventMap>();
  private socket: ElloSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private status: AgentStatus = 'idle';
  private muted = false;
  private inflight = new Map<string, AbortController>();
  private pageContextFn: PageContextProvider | null = null;
  private pageContextFlushScheduled = false;
  // Same start()/stop() race-condition guard as ElloAgent — see its comment.
  private startToken = 0;

  constructor(
    private options: ElloAgentOptions,
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

  updatePageContext(): void {
    if (this.pageContextFlushScheduled) return;
    this.pageContextFlushScheduled = true;
    Promise.resolve().then(() => {
      this.pageContextFlushScheduled = false;
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
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
    // Real WebRTC mute: disable the outgoing track directly, rather than
    // dropping chunks client-side like the default transport does.
    this.localStream?.getAudioTracks().forEach((t: MediaStreamTrack) => {
      t.enabled = !muted;
    });
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  async start(): Promise<void> {
    vlog('[webrtc] start() called; apiKeySet=', !!this.options.apiKey, 'assistantId=', this.options.assistantId);
    if (!this.options.apiKey || !this.options.assistantId) {
      vlog('[webrtc] ABORT: apiKey/assistantId not configured');
      throw new Error('WebRTCAgent: apiKey/assistantId not configured');
    }
    if (this.socket) {
      vlog('[webrtc] start() ignored — socket already exists');
      return;
    }

    const token = ++this.startToken;
    const cancelled = () => token !== this.startToken;

    this.setStatus('connecting');
    try {
      vlog('[webrtc] POST call ->', this.options.apiBaseUrl);
      const { conversationId } = await createVoiceSession(this.options);
      if (cancelled()) {
        vlog('[webrtc] start aborted after REST — stop() was pressed');
        return;
      }
      this.conversationId = conversationId;
      vlog('[webrtc] REST ok conv=', conversationId);

      // Real mic capture with platform echo cancellation/noise suppression/gain
      // control requested — see webrtcAudio.ts.
      const localStream = await getLocalAudioStream();
      if (cancelled()) {
        localStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        return;
      }
      this.localStream = localStream;

      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
      } as any);
      this.pc = pc;
      localStream.getTracks().forEach((track: MediaStreamTrack) => pc.addTrack(track, localStream));

      (pc as any).ontrack = (event: any) => {
        // The agent's remote audio track — react-native-webrtc plays it
        // through the OS audio session automatically once attached; there is
        // no manual chunk-playback step like the default transport's
        // pcmPlayer.playChunk(). We only need to route it to the speaker.
        vlog('[webrtc] remote track received:', event?.track?.kind);
        startSpeakerRouting();
      };

      (pc as any).onconnectionstatechange = () => {
        vlog('[webrtc] pc connectionState=', pc.connectionState);
      };

      const socket = new ElloSocket(this.options.wsUrl || ELLO_WEBRTC_WS_URL);
      socket.onMessage(msg => this.handleMessage(msg));
      socket.onClose(() => {
        vlog('[webrtc] WS CLOSED');
        this.teardown();
      });
      vlog('[webrtc] WS connecting ->', this.options.wsUrl || ELLO_WEBRTC_WS_URL);
      await socket.connect();
      if (cancelled()) {
        vlog('[webrtc] start aborted after WS open — closing orphan socket');
        try {
          socket.send({ type: 'end-session', session_id: conversationId });
          socket.close();
        } catch {
          /* already gone */
        }
        this.teardown();
        return;
      }
      this.socket = socket;
      vlog('[webrtc] WS OPEN');

      // Candidates found before the offer is sent have no session to attach
      // to yet (the offer is what creates it server-side) — the server
      // replies "Session not found" for each one. They're harmless (the same
      // candidates end up embedded directly in the offer's SDP via
      // waitForIceGathering below anyway) but noisy, so hold any found before
      // offerSent flips true and only send candidates discovered afterward
      // (e.g. from later renegotiation).
      let offerSent = false;
      (pc as any).onicecandidate = (event: any) => {
        if (event.candidate && offerSent) {
          // Field is "session_id", NOT "conversation_id" — confirmed against
          // ellomobilesdk's own working ElloAiSdk.ts (its onIceCandidate
          // handler sends `session_id: conversationId`). Sending the wrong
          // name here previously got "Session ID and candidate are required"
          // back from the server for every candidate.
          this.socket?.send({
            type: 'ice-candidate',
            session_id: conversationId,
            candidate: event.candidate,
          });
        }
      };

      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false } as any);
      // react-native-webrtc still emits an m=video section here despite
      // offerToReceiveVideo: false. ellomobilesdk's own WebRTCService.ts strips
      // it for exactly this reason — an audio-only destination profile on the
      // FreeSWITCH side rejects a stray video m= line with SIP 488 Not
      // Acceptable Here (same failure mode as transfer_orchestrator.py's
      // _build_pstn_codec_vars() comment describes for the PSTN transfer leg).
      if (offer.sdp) {
        offer.sdp = this.stripSdp(offer.sdp);
      }
      await pc.setLocalDescription(offer as any);
      if (cancelled()) {
        this.teardown();
        return;
      }

      // Wait for ICE candidates to be gathered so the SDP we send has them
      // embedded — matching ellomobilesdk's own approach (see webrtcAudio.ts's
      // waitForIceGathering doc comment for why this matters).
      await waitForIceGathering(pc);
      if (cancelled()) {
        this.teardown();
        return;
      }
      const sdpToSend = pc.localDescription?.sdp || offer.sdp;
      vlog(
        '[webrtc] ICE gathering done; candidates in SDP=',
        (sdpToSend.match(/a=candidate:/g) || []).length,
      );

      const tools = this.registry.toWire();
      const fullContext = this.pageContextFn?.() ?? {};
      // Same "withhold raw screen data from the very first message" reasoning
      // as ElloAgent.start() — see its comment for why.
      this.socket.send({
        type: 'offer',
        conversation_id: conversationId,
        sdp: sdpToSend,
        client_tools: tools,
        page_context: { ...fullContext, screen_overview: '', available_actions: [] },
      });
      vlog('[webrtc] sent offer; tools=', tools.map(t => t.name));
      offerSent = true;

      this.setStatus('listening');
      setTimeout(() => this.updatePageContext(), 500);
    } catch (e: any) {
      vlog('[webrtc] START FAILED:', e?.message || String(e));
      this.emitter.emit('error', e instanceof Error ? e : new Error(String(e)));
      this.teardown();
      throw e;
    }
  }

  async stop(): Promise<void> {
    this.startToken++;
    vlog('[webrtc] stop() called; hadSocket=', !!this.socket);
    for (const controller of this.inflight.values()) controller.abort();
    this.inflight.clear();
    this.socket?.send({ type: 'end-session', session_id: this.conversationId });
    this.teardown();
  }

  private teardown(): void {
    stopSpeakerRouting();
    this.localStream?.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    this.localStream = null;
    this.pc?.close();
    this.pc = null;
    this.socket?.close();
    this.socket = null;
    this.conversationId = null;
    this.setStatus('idle');
  }

  private setStatus(status: AgentStatus): void {
    this.status = status;
    this.emitter.emit('statusChange', status);
  }

  private async handleMessage(msg: any): Promise<void> {
    vlog('[webrtc] RECV', msg?.type, JSON.stringify(msg ?? {}).slice(0, 300));
    switch (msg?.type) {
      // Field names guessed from ellomobilesdk's WebSocketEventTypes enum —
      // unconfirmed against the real backend, see ./README.md.
      case 'offer-response':
      case 'answer': {
        const sdp = msg.sdp ?? msg.data?.sdp;
        if (sdp && this.pc) {
          try {
            await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp } as any));
            vlog('[webrtc] remote description set');
          } catch (e) {
            vlog('[webrtc] setRemoteDescription failed:', String(e));
          }
        }
        break;
      }
      case 'ice-candidate':
      case 'ice-candidate-response': {
        const candidate = msg.candidate ?? msg.data?.candidate;
        if (candidate && this.pc) {
          try {
            await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            vlog('[webrtc] addIceCandidate failed:', String(e));
          }
        }
        break;
      }
      case 'conversation-text':
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
      case 'end-session':
        this.teardown();
        this.emitter.emit('sessionEnd', undefined);
        break;
      case 'error-occurred':
        this.emitter.emit('error', new Error(msg.error?.message || 'ello webrtc agent error'));
        break;
      default:
        break;
    }
  }

  // Byte-for-byte the same semantics as ElloAgent.executeToolCall — see
  // README.md "why duplicated, not imported".
  // Byte-for-byte the same logic as ellomobilesdk's WebRTCService.ts —
  // strips the video m= section (and any leftover video codec attributes)
  // that react-native-webrtc includes regardless of offerToReceiveVideo.
  private stripSdp(sdp: string | undefined): string {
    if (!sdp) return '';
    return sdp
      .split(/\r\n|\r|\n/)
      .filter(line => {
        if (line.startsWith('m=video')) return false;
        if (line.includes('vp8') || line.includes('vp9') || line.includes('h264')) return false;
        return true;
      })
      .join('\r\n');
  }

  private async executeToolCall(toolCallId: string, name: string, args: Record<string, unknown>): Promise<void> {
    vlog('[webrtc] TOOL CALL', name, JSON.stringify(args));
    this.emitter.emit('toolCall', { toolCallId, name, args });
    const tool = this.registry.get(name);
    const controller = new AbortController();
    this.inflight.set(toolCallId, controller);
    this.setStatus('executingTool');

    const respond = (status: 'ok' | 'denied' | 'error', result?: unknown, error?: { code: string; message: string }) => {
      this.inflight.delete(toolCallId);
      vlog('[webrtc] TOOL RESULT', status, JSON.stringify(result ?? error ?? {}));
      this.socket?.send({ type: 'client-tool-result', tool_call_id: toolCallId, status, result, error });
      this.emitter.emit('toolResult', { toolCallId, status, result, error });
      if (this.inflight.size === 0) this.setStatus('listening');
    };
    const fail = (code: string, message: string) => respond('error', undefined, { code, message });

    if (!tool) {
      fail('unknown_tool', `unknown tool: ${name}`);
      return;
    }
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
