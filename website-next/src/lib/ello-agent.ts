/**
 * Turn any provider error body into a sentence a human can act on.
 *
 * Ello nests differently per status: a 401 gives `{ message: "..." }` (a string),
 * but a 402 gives `{ message: { success, message, error_code, ... } }` — an
 * OBJECT. The old code did `new Error(json.message)`, so `String(err)` rendered
 * the useless "Error: [object Object]" and hid the real cause ("No active
 * subscription"), which cost real debugging time. Anything that reaches a user
 * must be unwrapped, never stringified blindly.
 */
export function readProviderError(json: unknown, status: number): string {
  const seen = new Set<unknown>();
  const dig = (v: unknown, depth = 0): string | null => {
    if (v == null || depth > 5 || seen.has(v)) return null;
    if (typeof v === 'string') return v.trim() || null;
    if (typeof v !== 'object') return String(v);
    seen.add(v);
    const o = v as Record<string, unknown>;
    // Most specific first: a human-facing reason beats a generic wrapper.
    for (const k of ['message', 'error_message', 'detail', 'error', 'reason', 'error_code']) {
      if (k in o) {
        const found = dig(o[k], depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  const msg = dig(json);
  const code = (json as any)?.message?.error_code ?? (json as any)?.error_code;
  if (msg) return code && !msg.includes(String(code)) ? `${msg} (${code})` : msg;
  return `request failed with HTTP ${status}`;
}
/* =========================================================
   SwiftLoan.ai — Ello voice-agent client (ported from
   website/js/ello-agent.js / admin/src/lib/ello-agent.ts).
   WebSocket + audio capture/playback + tool dispatch.
   Dense/mechanical port — kept close to source.
   ========================================================= */
/* eslint-disable @typescript-eslint/no-explicit-any */

const DEFAULT_API_BASE = 'https://api-in.getello.ai';
const DEFAULT_WS_URL = 'wss://connect-in.getello.ai/ws-ello';

export type AgentStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'executingTool' | 'ended';

export interface ElloTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (args: any) => unknown | Promise<unknown>;
  availableWhen?: () => boolean;
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
  timeoutMs?: number;
  sensitive?: boolean;
}

export interface ElloAgentOptions {
  /** No longer sent to Ello from the browser — kept optional for callers that still pass it. */
  apiKey?: string;
  /** Informational only; the server decides which agent a role maps to. */
  assistantId?: string;
  apiBaseUrl?: string;
  wsUrl?: string;
  /** Our own API, which brokers the Ello session. */
  sessionUrl?: string;
  /** Which agent role to start. */
  role?: 'websiteCompanion' | 'companion' | 'adminNavigator';
  debug?: boolean;
}

type Listener = (payload?: any) => void;

export class ElloAgent {
  static SPEAKING_QUIET_MS = 1200;

  private opts: Required<Pick<ElloAgentOptions, 'apiBaseUrl' | 'wsUrl' | 'sessionUrl'>> & ElloAgentOptions;
  private tools = new Map<string, ElloTool>();
  private pageContextFn: (() => Record<string, unknown>) | null = null;
  private ws: WebSocket | null = null;
  status: AgentStatus = 'idle';
  private listeners: Record<string, Listener[]> = {};
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micProcessor: ScriptProcessorNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private playbackQueueTime = 0;
  private playing: AudioBufferSourceNode[] = [];
  private startTime = 0;
  private contextUpdatesUnsupported = false;
  private speakingQuietTimer: ReturnType<typeof setTimeout> | null = null;
  stats = { micFrames: 0, micSoundFrames: 0, audioOut: 0, toolsSent: 0, toolsAcked: null as number | null };
  conversationId: string | null = null;
  private playCount = 0;

  constructor(options: ElloAgentOptions) {
    this.opts = {
      apiBaseUrl: options.apiBaseUrl ?? DEFAULT_API_BASE,
      wsUrl: options.wsUrl ?? DEFAULT_WS_URL,
      // Our own API brokers the Ello session (see start()). Same resolution order
      // as the lead form, so both agree on which backend they are talking to.
      sessionUrl:
        options.sessionUrl ??
        (typeof window !== 'undefined'
          ? (window as unknown as { SWIFTLOAN_API_BASE?: string }).SWIFTLOAN_API_BASE
          : undefined) ??
        process.env.NEXT_PUBLIC_API_BASE ??
        'https://swiftloan-api.onrender.com',
      ...options,
    };
  }

  private log(...args: unknown[]) {
    if (this.opts.debug) console.log('[ello-agent]', ...args);
  }

  private dbg(kind: string, label: string, detail?: unknown) {
    const t = this.startTime ? Date.now() - this.startTime : 0;
    this.emit('debug', { t, kind, label, detail });
    if (this.opts.debug) console.log(`[ello-agent ${t}ms] ${kind.toUpperCase()} ${label}`, detail ?? '');
  }

  on(event: string, fn: Listener) {
    const list = this.listeners[event] ?? [];
    list.push(fn);
    this.listeners[event] = list;
  }

  private emit(event: string, payload?: unknown) {
    this.listeners[event]?.forEach((fn) => fn(payload));
  }

  private setStatus(s: AgentStatus) {
    if (this.status === s) return;
    this.status = s;
    // The mic deliberately stays live throughout the whole call, including
    // while the agent is speaking — muting it here was killing barge-in:
    // the user's interrupting speech never reached the server, so its VAD
    // had nothing to detect and voice-audio-purge never fired. Echo is
    // handled by getUserMedia's echoCancellation/noiseSuppression (see
    // acquireMic) instead of muting, matching the mobile app's client
    // (src/voice/agent.ts), which documents this exact tradeoff.
    this.emit('statusChange', s);
  }

  registerTool(tool: ElloTool) {
    this.tools.set(tool.name, tool);
  }

  unregisterTool(name: string) {
    this.tools.delete(name);
  }

  registerPageContext(fn: () => Record<string, unknown>) {
    this.pageContextFn = fn;
  }

  private toolsPayload() {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.schema,
      available: t.availableWhen ? t.availableWhen() : true,
    }));
  }

  updatePageContext() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.contextUpdatesUnsupported) return;
    const payload = {
      type: 'update-context',
      conversation_id: this.conversationId,
      client_tools: this.toolsPayload(),
      page_context: this.pageContextFn?.() ?? {},
    };
    this.log('update-context ->', payload);
    this.dbg('out', 'update-context');
    this.ws.send(JSON.stringify(payload));
  }

  async start() {
    if (this.status !== 'idle' && this.status !== 'ended') return;
    this.startTime = Date.now();
    this.stats = { micFrames: 0, micSoundFrames: 0, audioOut: 0, toolsSent: 0, toolsAcked: null };
    this.dbg('info', 'start()', 'connecting');
    this.setStatus('connecting');
    this.playbackQueueTime = 0;
    this.playCount = 0;
    try {
      await this.ensureAudioContext();
    } catch {
      /* ignore */
    }
    try {
      await this.acquireMic();
    } catch (err) {
      this.dbg('error', 'mic acquire failed', String(err));
      this.emit('error', {
        message: 'Microphone access is needed to talk. Please allow it in your browser and click again.',
      });
      this.setStatus('idle');
      return;
    }
    try {
      // Session is started through OUR server, not Ello directly.
      //
      // Ello's api-in sends no `Access-Control-Allow-Origin` and does not allow
      // the `X-API-Key` header cross-origin, so a browser preflight always fails
      // — that is the "Failed to fetch" this replaces. Going via our own API also
      // keeps the Ello key server-side instead of shipping it to every visitor.
      //
      // We send a ROLE, never an agent id: the server resolves which agent that
      // means, so a visitor cannot repoint our key at another agent.
      const resp = await fetch(`${this.opts.sessionUrl}/api/voice/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: this.opts.role ?? 'websiteCompanion' }),
      });
      const json = await resp.json();
      this.log('session response', json);
      const conversationId = json?.data?.conversationId ?? json?.data?.conversation_id;
      if (!resp.ok || !conversationId) {
        throw new Error(readProviderError(json, resp.status));
      }
      this.conversationId = conversationId;
      // The server owns which Ello environment we talk to, so let it tell us.
      if (json?.data?.wsUrl) this.opts.wsUrl = json.data.wsUrl;
      this.dbg('info', 'session ok', `conversation_id=${conversationId}`);
    } catch (err) {
      this.dbg('error', 'publish failed', String(err));
      // `String(err)` on an Error yields "Error: <message>", and on a non-Error
      // object "[object Object]" — neither belongs in front of a user.
      this.emit('error', { message: err instanceof Error ? err.message : readProviderError(err, 0) });
      this.setStatus('idle');
      return;
    }
    await this.openSocket();
  }

  private async openSocket() {
    const ws = new WebSocket(this.opts.wsUrl);
    this.ws = ws;
    ws.binaryType = 'arraybuffer';
    ws.addEventListener('open', () => {
      this.log('ws open');
      this.dbg('info', 'ws open');
    });
    ws.addEventListener('close', (e) => {
      this.log('ws close', e.code, e.reason);
      this.dbg('info', 'ws close', `code=${e.code} ${e.reason ?? ''}`);
      this.setStatus('ended');
      this.emit('sessionEnd');
      this.stopMic();
    });
    ws.addEventListener('error', () => {
      this.dbg('error', 'ws error');
      this.emit('error', { message: 'WebSocket error' });
    });
    ws.addEventListener('message', (e) => {
      if (typeof e.data === 'string') {
        this.handleMessage(e.data);
      } else {
        this.handleAudioFrame(e.data as ArrayBuffer);
      }
    });
    await new Promise<void>((resolve) => {
      if (ws.readyState === WebSocket.OPEN) return resolve();
      ws.addEventListener('open', () => resolve(), { once: true });
    });
    const tools = this.toolsPayload();
    this.stats.toolsSent = tools.length;
    ws.send(
      JSON.stringify({
        type: 'voice-session-start',
        conversation_id: this.conversationId,
        assistant_id: this.opts.assistantId,
        client_tools: tools,
        page_context: this.pageContextFn?.() ?? {},
      })
    );
    this.dbg('out', 'voice-session-start', `${tools.length} tools sent`);
    window.setTimeout(() => {
      if (this.stats.toolsAcked === null && this.ws === ws && this.status !== 'idle' && this.status !== 'ended') {
        this.dbg(
          'warn',
          'no tools-ack after 5s',
          `Sent ${tools.length} tools but the backend never acknowledged them. The assistant is likely NOT in Native Mode (Gemini Live), so it can talk but will never call a tool. Fix on the ello dashboard.`
        );
      }
    }, 5000);
  }

  private async handleMessage(raw: string) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.log('non-JSON message', raw.slice(0, 200));
      return;
    }
    this.log('<-', msg.type, msg);
    switch (msg.type) {
      case 'connection-established':
        this.dbg('in', 'connection-established');
        break;
      case 'session-established':
        this.dbg('in', 'session-established', 'mic starting');
        this.setStatus('listening');
        await this.startMic();
        break;
      case 'tools-ack':
      case 'client-tools-ack': {
        const d = msg.data ?? msg;
        const acc = d.accepted;
        const rej = d.rejected;
        const accepted = Array.isArray(acc) ? acc.length : Number(acc ?? 0);
        const rejected = Array.isArray(rej) ? rej.length : Number(rej ?? 0);
        this.stats.toolsAcked = accepted;
        this.dbg('in', String(msg.type), `accepted=${accepted} rejected=${rejected}`);
        this.emit('toolsAck', { accepted, rejected });
        break;
      }
      case 'transcript':
      case 'conversation-text': {
        const d = msg.data ?? msg;
        const src = d.source ?? d.role ?? d.speaker ?? msg.role;
        const role = src === 'user' || src === 'human' ? 'user' : 'agent';
        const text = String(d.text ?? msg.text ?? '');
        this.dbg('in', `transcript(${role})`, text);
        this.emit('transcript', { role, text });
        break;
      }
      case 'voice-audio-output': {
        const b64 = msg.audio ?? msg.data?.audio;
        if (b64) this.playPcm16(base64ToPcm16(b64));
        this.stats.audioOut++;
        if (this.stats.audioOut % 10 === 1) this.dbg('in', 'voice-audio-output', `chunk #${this.stats.audioOut}`);
        if (this.status !== 'speaking') this.setStatus('speaking');
        if (this.speakingQuietTimer) clearTimeout(this.speakingQuietTimer);
        this.speakingQuietTimer = setTimeout(() => {
          this.speakingQuietTimer = null;
          if (this.status === 'speaking') {
            this.dbg('info', 'audio-output quiet', 'no chunk for ' + ElloAgent.SPEAKING_QUIET_MS + 'ms -> listening');
            this.setStatus('listening');
          }
        }, ElloAgent.SPEAKING_QUIET_MS);
        break;
      }
      case 'voice-audio-purge':
        this.dbg('in', 'voice-audio-purge', 'barge-in, clearing playback');
        if (this.speakingQuietTimer) {
          clearTimeout(this.speakingQuietTimer);
          this.speakingQuietTimer = null;
        }
        this.purgePlayback();
        this.setStatus('listening');
        break;
      case 'voice-audio-stream-end':
        this.dbg('in', 'voice-audio-stream-end');
        if (this.speakingQuietTimer) {
          clearTimeout(this.speakingQuietTimer);
          this.speakingQuietTimer = null;
        }
        if (this.status === 'speaking') this.setStatus('listening');
        break;
      case 'client-tool-call':
      case 'tool-call':
      case 'toolCall':
        this.dbg('in', 'client-tool-call', JSON.stringify(msg.data ?? msg).slice(0, 160));
        await this.runTool(msg);
        break;
      case 'error-occurred':
      case 'error': {
        const d = msg.error ?? msg;
        const message = String(d.message ?? 'unknown error');
        if (/unknown message type/i.test(message) && /update-context/i.test(message)) {
          this.contextUpdatesUnsupported = true;
          this.dbg('info', 'update-context unsupported', 'backend rejected it; disabling further sends');
          break;
        }
        this.dbg('error', 'server error', message);
        this.emit('error', { message });
        break;
      }
      case 'speaking-started':
        this.setStatus('speaking');
        break;
      case 'speaking-ended':
        this.setStatus('listening');
        break;
      case 'session-ended':
        this.dbg('in', 'session-ended');
        this.setStatus('ended');
        this.emit('sessionEnd');
        this.stopMic();
        break;
      default:
        this.log('unhandled message type', msg.type, msg);
        this.dbg('in', `unhandled: ${String(msg.type)}`, JSON.stringify(msg).slice(0, 140));
    }
  }

  private confirm(tool: ElloTool): Promise<boolean> {
    const message = tool.confirmationMessage ?? `Allow: ${tool.name.replace(/[_-]/g, ' ')}?`;
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.setAttribute('role', 'alertdialog');
      wrap.style.cssText =
        'position:fixed;bottom:96px;right:24px;z-index:60;max-width:320px;background:#111010;color:#f7f3ec;border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,.45);font:14px/1.4 system-ui,sans-serif';
      const msg = document.createElement('p');
      msg.textContent = message;
      msg.style.cssText = 'margin:0 0 12px';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
      const deny = document.createElement('button');
      deny.textContent = 'Deny';
      deny.style.cssText =
        'padding:6px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#f7f3ec;cursor:pointer;font:inherit';
      const allow = document.createElement('button');
      allow.textContent = 'Allow';
      allow.style.cssText =
        'padding:6px 16px;border-radius:999px;border:0;background:#c8a97e;color:#0a0908;font-weight:600;cursor:pointer;font:inherit';
      let settled = false;
      const done = (v: boolean) => {
        if (settled) return;
        settled = true;
        wrap.remove();
        resolve(v);
      };
      deny.onclick = () => done(false);
      allow.onclick = () => done(true);
      row.append(deny, allow);
      wrap.append(msg, row);
      document.body.appendChild(wrap);
      setTimeout(() => done(false), 30000);
    });
  }

  private withTimeout<T>(p: Promise<T>, ms?: number): Promise<T> {
    if (!ms) return p;
    const capped = Math.min(ms, 30000);
    return Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Tool timed out after ${capped}ms`)), capped)),
    ]);
  }

  async debugSimulateToolCall(name: string, args: Record<string, unknown> = {}) {
    return this.runTool({ type: 'client-tool-call', data: { name, arguments: args, call_id: 'debug' } });
  }

  private async runTool(msg: any) {
    const d = msg.data ?? msg;
    const name = String(d.name ?? d.tool_name ?? '');
    const args = d.arguments ?? d.args ?? {};
    // tool_call_id is the field name confirmed against the real backend
    // (native_orchestrator.py's _client_tool_result_for_model) — the mobile
    // app's src/voice/agent.ts uses it directly. call_id/id are kept as
    // fallbacks only in case an older backend revision used them.
    const callId = d.tool_call_id ?? d.call_id ?? d.id ?? null;
    this.emit('toolCall', { name, args });
    const tool = this.tools.get(name);
    // Status vocabulary matches the server exactly: 'ok' -> result payload,
    // 'denied' -> user declined a confirmation, anything else -> error.{code,message}.
    let status: 'ok' | 'denied' | 'error' = 'ok';
    let result: unknown = null;
    let error: { code: string; message: string } | undefined;
    if (!tool) {
      status = 'error';
      error = { code: 'unknown_tool', message: `Unknown tool: ${name}` };
    } else if (tool.availableWhen && !tool.availableWhen()) {
      status = 'error';
      error = { code: 'tool_unavailable', message: `Tool ${name} is not available on this page right now.` };
    } else if (tool.requiresConfirmation && !(await this.confirm(tool))) {
      status = 'denied';
      this.setStatus('listening');
    } else {
      this.setStatus('executingTool');
      try {
        result = await this.withTimeout(Promise.resolve(tool.handler(args)), tool.timeoutMs);
      } catch (err) {
        status = 'error';
        error = { code: 'tool_handler_failed', message: String(err) };
      }
      this.setStatus('listening');
    }
    this.emit('toolResult', { name, status });
    this.ws?.send(
      JSON.stringify({
        type: 'client-tool-result',
        tool_call_id: callId,
        status,
        result: tool?.sensitive ? '[redacted]' : result,
        error,
      })
    );
  }

  private handleAudioFrame(buf: ArrayBuffer) {
    this.playPcm16(new Int16Array(buf));
  }

  private analyser: AnalyserNode | null = null;

  /** Analyser sitting between playback and the speakers. Created on demand. */
  private outputAnalyser(ctx: AudioContext): AnalyserNode {
    if (!this.analyser) {
      this.analyser = ctx.createAnalyser();
      // Small FFT: we only want a loudness envelope, not a spectrum, and a
      // short window keeps the mouth responsive rather than smeared.
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.35;
      this.analyser.connect(ctx.destination);
    }
    return this.analyser;
  }

  /**
   * Current output loudness, 0..1 — the agent's own voice, not the mic.
   *
   * Returns 0 when nothing is playing, so an avatar driven by this closes its
   * mouth naturally between words instead of flapping on a fixed cycle.
   */
  getOutputLevel(): number {
    if (!this.analyser) return 0;
    const buf = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    // Speech rarely approaches full scale; scale up so normal talking reaches
    // a fully open mouth, and clamp.
    return Math.min(1, peak * 2.6);
  }

  private getAudioContextCtor(): typeof AudioContext {
    return window.AudioContext || (window as any).webkitAudioContext;
  }

  private async ensureAudioContext(): Promise<AudioContext> {
    if (!this.audioCtx) {
      const Ctx = this.getAudioContextCtor();
      this.audioCtx = new Ctx();
    }
    if (this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
      } catch {
        /* ignore */
      }
    }
    return this.audioCtx;
  }

  private playPcm16(int16: Int16Array) {
    if (!this.audioCtx) {
      const Ctx = this.getAudioContextCtor();
      this.audioCtx = new Ctx();
    }
    const ctx = this.audioCtx;
    if (ctx.state === 'suspended') {
      ctx.resume().then(
        () => this.log('audioCtx resumed for playback'),
        () => this.emit('error', { message: "Can't play audio — AudioContext is suspended (browser autoplay block)." })
      );
    }
    const inRate = 16000;
    const outRate = ctx.sampleRate;
    const ratio = outRate / inRate;
    const outLen = Math.max(1, Math.round(int16.length * ratio));
    const buffer = ctx.createBuffer(1, outLen, outRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < outLen; i++) {
      const srcIdx = i / ratio;
      const i0 = Math.floor(srcIdx);
      const i1 = Math.min(i0 + 1, int16.length - 1);
      const frac = srcIdx - i0;
      const s = int16[i0] * (1 - frac) + int16[i1] * frac;
      ch[i] = s / 32768;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // Route through an analyser so callers can read the real output level —
    // this is what drives Ruby's mouth. Taking it from the actual audio rather
    // than a timer means the lips move with the speech, including pauses, and
    // stop the instant playback is purged on barge-in.
    src.connect(this.outputAnalyser(ctx));
    this.playing.push(src);
    src.onended = () => {
      const i = this.playing.indexOf(src);
      if (i >= 0) this.playing.splice(i, 1);
    };
    const now = ctx.currentTime;
    if (this.playbackQueueTime < now || this.playbackQueueTime > now + 5) {
      this.playbackQueueTime = now + 0.05;
    }
    src.start(this.playbackQueueTime);
    this.playbackQueueTime += buffer.duration;
    if (++this.playCount % 15 === 0) this.log(`playback: ${this.playCount} chunks, ctx=${ctx.state} @${outRate}Hz`);
  }

  private purgePlayback() {
    for (const src of this.playing.splice(0)) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        /* ignore */
      }
    }
    this.playbackQueueTime = this.audioCtx ? this.audioCtx.currentTime : 0;
  }

  private async acquireMic() {
    if (this.micStream && this.micStream.getAudioTracks().some((t) => t.readyState === 'live')) return;
    this.dbg('info', 'acquireMic()', 'requesting microphone…');
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone API unavailable (needs https / a supported browser).');
    }
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const tr = this.micStream.getAudioTracks()[0];
    this.dbg('info', 'getUserMedia ok', tr ? `${tr.label || 'mic'} enabled=${tr.enabled} muted=${tr.muted} state=${tr.readyState}` : 'no track');
  }

  private async startMic() {
    try {
      await this.acquireMic();
    } catch (err) {
      this.dbg('error', 'getUserMedia failed', String(err));
      this.emit('error', { message: `Microphone access denied: ${String(err)}` });
      return;
    }
    if (!this.micStream) return;
    const ctx = await this.ensureAudioContext();
    const rate = ctx.sampleRate;
    this.dbg('info', 'audioContext', `state=${ctx.state} sampleRate=${rate}`);
    this.micSource = ctx.createMediaStreamSource(this.micStream);
    this.micProcessor = ctx.createScriptProcessor(4096, 1, 1);
    let frames = 0;
    let soundFrames = 0;
    let firstFrameLogged = false;
    this.micProcessor.onaudioprocess = (ev) => {
      if (!firstFrameLogged) {
        firstFrameLogged = true;
        this.dbg('info', 'mic processor firing', `ctx=${this.audioCtx?.state} ws=${this.ws?.readyState}`);
      }
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const input = ev.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      const rms = Math.sqrt(sum / input.length);
      if (rms > 0.01) soundFrames++;
      const resampled = rate === 16000 ? input : downsampleTo16k(input, rate);
      const pcm16 = floatTo16BitPCM(resampled);
      this.ws.send(
        JSON.stringify({
          type: 'voice-audio-input',
          data: pcm16ToBase64(pcm16),
          sample_rate: 16000,
        })
      );
      frames++;
      this.stats.micFrames = frames;
      this.stats.micSoundFrames = soundFrames;
      if (frames % 25 === 0) {
        this.log(`mic: sent ${frames} frames @${rate}Hz, ${soundFrames} with sound (rms>0.01)`);
        this.dbg('out', 'mic frames', `${frames} sent @${rate}Hz, ${soundFrames} with sound (binary PCM16)`);
      }
    };
    setTimeout(() => {
      if (frames === 0) {
        this.dbg('error', 'mic not firing', '0 audio frames captured');
        this.emit('error', { message: "Mic capture isn't firing (0 audio frames). Check mic permission/hardware." });
      } else if (soundFrames === 0) {
        this.dbg('warn', 'mic silent', `${frames} frames but all near-silence`);
        this.emit('error', { message: 'Mic is connected but only silence is captured — check the OS input device/level.' });
      } else {
        this.dbg('info', 'mic live', `${frames} frames, ${soundFrames} with sound`);
      }
    }, 3500);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    this.micSource.connect(this.micProcessor);
    this.micProcessor.connect(mute);
    mute.connect(ctx.destination);
    this.log('mic started', { sampleRate: rate, ctxState: ctx.state });
  }

  private stopMic() {
    this.micProcessor?.disconnect();
    this.micSource?.disconnect();
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micProcessor = null;
    this.micSource = null;
    this.micStream = null;
    this.audioCtx?.close();
    this.audioCtx = null;
  }

  stop() {
    if (this.speakingQuietTimer) {
      clearTimeout(this.speakingQuietTimer);
      this.speakingQuietTimer = null;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'voice-session-end', conversation_id: this.conversationId }));
      } catch {
        /* ignore */
      }
    }
    this.purgePlayback();
    this.stopMic();
    this.ws?.close();
    this.ws = null;
    this.setStatus('ended');
  }
}

function pcm16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let binary = '';
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToPcm16(b64: string): Int16Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const even = bytes.byteLength - (bytes.byteLength % 2);
  return new Int16Array(bytes.buffer, 0, even / 2);
}

function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === 16000) return input;
  const ratio = inputRate / 16000;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += input[j];
      count++;
    }
    out[i] = count > 0 ? sum / count : 0;
  }
  return out;
}

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 32768 : s * 32767;
  }
  return out;
}

const SENSITIVE_RE = /password|otp|cvv|cvc|ssn|pin/i;
const SENSITIVE_AUTOCOMPLETE = new Set(['one-time-code', 'cc-csc', 'current-password', 'new-password']);

export function isSensitiveInput(el: Element): boolean {
  const attrs = [el.getAttribute('name'), el.getAttribute('id'), el.getAttribute('placeholder'), el.getAttribute('aria-label')]
    .filter(Boolean)
    .join(' ');
  if (SENSITIVE_RE.test(attrs)) return true;
  const ac = el.getAttribute('autocomplete');
  if (ac && SENSITIVE_AUTOCOMPLETE.has(ac)) return true;
  if (el instanceof HTMLInputElement && el.type === 'password') return true;
  return false;
}

export function fillInput(target: string, value: string): { success: boolean; reason?: string } {
  const el = document.querySelector(target);
  if (!el || !(el instanceof HTMLElement)) return { success: false, reason: 'Element not found' };
  if (isSensitiveInput(el)) {
    el.focus();
    return { success: false, reason: 'Refused: sensitive field — user must type it themselves' };
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true };
  }
  if (el instanceof HTMLSelectElement) {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true };
  }
  return { success: false, reason: 'Unsupported element type' };
}
