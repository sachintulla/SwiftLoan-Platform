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
// Minimal hand-written client for the Getello ("Ello") voice-widget protocol,
// modelled on the @ello/agent-sdk integration guide. The real SDK isn't
// published anywhere we can install it from, so this reimplements the wire
// protocol directly against the documented endpoints:
//
//   1. POST {apiBaseUrl}/api/agents/publish  (X-API-Key header) -> conversation_id
//   2. WebSocket {wsUrl}                      -> connection-established
//   3. send {type:"voice-session-start", conversation_id, client_tools,
//      page_context}                           -> session-established
//   4. stream mic audio up as JSON messages
//      {type:"voice-audio-input", data:<base64 PCM16>, sample_rate:16000};
//      play back incoming {type:"voice-audio-output", audio:<base64>} chunks.
//   5. tool calls arrive as {type:"client-tool-call", ...}.
//
// The wire format (client_tools/page_context field names, voice-audio-input
// data/sample_rate shape, voice-audio-purge / voice-audio-stream-end, and the
// speaking→mute half-duplex rule) was cross-checked against the working
// Android client that uses the same backend.

export type ToolSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

export type ClientToolOptions<Args = Record<string, unknown>> = {
  name: string;
  description: string;
  schema: ToolSchema;
  handler: (args: Args) => unknown | Promise<unknown>;
  availableWhen?: () => boolean;
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
  sensitive?: boolean;
  timeoutMs?: number;
};

export type AgentStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "executingTool"
  | "ended";

type AgentEventMap = {
  statusChange: AgentStatus;
  transcript: { role: "user" | "agent"; text: string };
  toolCall: { name: string; args: Record<string, unknown> };
  toolResult: { name: string; status: "ok" | "error" | "unavailable" };
  toolsAck: { accepted: number; rejected: number };
  error: { message: string };
  sessionEnd: undefined;
  // Structured trace for the on-screen debugger: every notable event, both
  // directions, with a coarse kind so the panel can colour/group them.
  debug: {
    t: number;
    kind: "in" | "out" | "info" | "warn" | "error";
    label: string;
    detail?: string;
  };
};

type Listener<K extends keyof AgentEventMap> = (payload: AgentEventMap[K]) => void;

export type ElloAgentOptions = {
  /** No longer sent to Ello from the browser; kept optional for existing callers. */
  apiKey?: string;
  /** Informational only — the server maps a role to an agent. */
  assistantId?: string;
  apiBaseUrl?: string;
  wsUrl?: string;
  /** Our own API, which brokers the Ello session. */
  sessionUrl?: string;
  role?: "websiteCompanion" | "companion" | "adminNavigator";
  widget?: { position?: "bottom-right" | "bottom-left"; hidden?: boolean };
  debug?: boolean;
};

const DEFAULT_API_BASE = "https://api-in.getello.ai";
const DEFAULT_WS_URL = "wss://connect-in.getello.ai/ws-ello";

export class ElloAgent {
  private opts: Required<Pick<ElloAgentOptions, "apiBaseUrl" | "wsUrl" | "sessionUrl">> & ElloAgentOptions;
  private tools = new Map<string, ClientToolOptions>();
  private pageContextFn: (() => Record<string, unknown>) | null = null;
  private ws: WebSocket | null = null;
  private status: AgentStatus = "idle";
  private listeners: Partial<{ [K in keyof AgentEventMap]: Listener<K>[] }> = {};

  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micProcessor: ScriptProcessorNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private playbackQueueTime = 0;
  private playing: AudioBufferSourceNode[] = []; // scheduled speech, for barge-in purge
  private startTime = 0;
  // The backend rejects `update-context` ("Unknown message type"). Once we see
  // that, stop sending it (and stop surfacing the rejection as a user error).
  private contextUpdatesUnsupported = false;
  // This backend does NOT send a "speaking ended" / voice-audio-stream-end
  // message. Without one, the half-duplex mic-mute (applied on `speaking`) would
  // never lift and the mic stays dead after the agent's first utterance. We
  // watchdog the audio-output stream: when it goes quiet, resume listening.
  private speakingQuietTimer: ReturnType<typeof setTimeout> | null = null;
  private static SPEAKING_QUIET_MS = 1200;
  // Live counters exposed to the debug panel.
  stats = { micFrames: 0, micSoundFrames: 0, audioOut: 0, toolsSent: 0, toolsAcked: null as number | null };

  conversationId: string | null = null;

  constructor(options: ElloAgentOptions) {
    this.opts = {
      apiBaseUrl: options.apiBaseUrl ?? DEFAULT_API_BASE,
      wsUrl: options.wsUrl ?? DEFAULT_WS_URL,
      // Our own API brokers the Ello session (see start()).
      sessionUrl:
        options.sessionUrl ?? process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000",
      ...options,
    };
  }

  private log(...args: unknown[]) {
    if (this.opts.debug) console.log("[ello-agent]", ...args);
  }

  // Structured trace for the debug panel (and console when debug is on).
  private dbg(kind: AgentEventMap["debug"]["kind"], label: string, detail?: string) {
    const t = this.startTime ? Date.now() - this.startTime : 0;
    this.emit("debug", { t, kind, label, detail });
    if (this.opts.debug) console.log(`[ello-agent ${t}ms] ${kind.toUpperCase()} ${label}`, detail ?? "");
  }

  on<K extends keyof AgentEventMap>(event: K, fn: Listener<K>) {
    const list = (this.listeners[event] as Listener<K>[] | undefined) ?? [];
    list.push(fn);
    this.listeners[event] = list as never;
  }

  private emit<K extends keyof AgentEventMap>(event: K, payload: AgentEventMap[K]) {
    this.listeners[event]?.forEach((fn) => fn(payload));
  }

  private setStatus(s: AgentStatus) {
    if (this.status === s) return;
    this.status = s;
    // Half-duplex echo control (matches the working app): mute the mic while
    // the agent is speaking so its own voice isn't captured and fed back —
    // that feedback is what makes replies break up / repeat. Unmute when we
    // return to listening.
    if (s === "speaking") this.setMuted(true);
    else if (s === "listening") this.setMuted(false);
    this.emit("statusChange", s);
  }

  registerTool<Args = Record<string, unknown>>(tool: ClientToolOptions<Args>) {
    this.tools.set(tool.name, tool as unknown as ClientToolOptions);
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
    // The backend doesn't implement mid-session context updates (it replies
    // "Unknown message type: update-context"). Once we've learned that, don't
    // keep sending it — the context sent at voice-session-start still applies.
    if (this.contextUpdatesUnsupported) return;
    const payload = {
      type: "update-context",
      conversation_id: this.conversationId,
      client_tools: this.toolsPayload(),
      page_context: this.pageContextFn?.() ?? {},
    };
    this.log("update-context ->", payload);
    this.dbg("out", "update-context");
    this.ws.send(JSON.stringify(payload));
  }

  showWidget() {
    // No-op here: the floating button is a React component
    // (see components/VoiceWidget.tsx) that calls start()/stop() directly.
  }

  async start() {
    if (this.status !== "idle" && this.status !== "ended") return;
    this.startTime = Date.now();
    this.stats = { micFrames: 0, micSoundFrames: 0, audioOut: 0, toolsSent: 0, toolsAcked: null };
    this.dbg("info", "start()", "connecting");
    this.setStatus("connecting");
    this.playbackQueueTime = 0; // reset per session so playback isn't scheduled in the past/future
    this.playCount = 0;
    // Create + resume the AudioContext NOW, inside the click gesture — doing it
    // later (after the publish fetch) can be blocked by the browser's autoplay
    // policy, leaving capture/playback silently dead.
    try {
      await this.ensureAudioContext();
    } catch {
      /* ignore */
    }
    // Acquire the mic NOW too, still inside the click gesture and BEFORE the
    // async publish/WebSocket hops. getUserMedia must run within a user
    // gesture; after several awaits (a network fetch) some browsers drop the
    // gesture context and silently suppress the permission prompt — so the
    // agent connects and talks but never captures the user. Acquiring up front
    // fixes that and surfaces a denial immediately instead of failing silently.
    try {
      await this.acquireMic();
    } catch (err) {
      this.dbg("error", "mic acquire failed", String(err));
      this.emit("error", {
        message:
          "Microphone access is needed to talk. Please allow it in your browser and click again.",
      });
      this.setStatus("idle");
      return;
    }
    try {
      // Brokered by OUR server, not Ello directly. Ello's api-in returns no
      // `Access-Control-Allow-Origin` and does not allow the `X-API-Key` header
      // cross-origin, so a browser preflight always fails — that is the
      // "Failed to fetch" this replaces. It also keeps the Ello key off the
      // client, where it was readable by anyone with devtools.
      //
      // A ROLE is sent, never an agent id, so the server decides which agent that
      // means and a caller cannot repoint our key at a different one.
      const resp = await fetch(`${this.opts.sessionUrl}/api/voice/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: this.opts.role ?? "adminNavigator" }),
      });
      const json = await resp.json();
      this.log("session response", json);
      const conversationId = json?.data?.conversationId ?? json?.data?.conversation_id;
      if (!resp.ok || !conversationId) {
        throw new Error(readProviderError(json, resp.status));
      }
      this.conversationId = conversationId;
      // The server owns which Ello environment we use.
      if (json?.data?.wsUrl) this.opts.wsUrl = json.data.wsUrl;
      this.dbg("info", "session ok", `conversation_id=${conversationId}`);
    } catch (err) {
      this.dbg("error", "publish failed", String(err));
      // `String(err)` on an Error yields "Error: <message>", and on a non-Error
      // object "[object Object]" — neither belongs in front of a user.
      this.emit("error", { message: err instanceof Error ? err.message : readProviderError(err, 0) });
      this.setStatus("idle");
      return;
    }

    await this.openSocket();
  }

  private async openSocket() {
    const ws = new WebSocket(this.opts.wsUrl);
    this.ws = ws;
    ws.binaryType = "arraybuffer";

    ws.addEventListener("open", () => {
      this.log("ws open");
      this.dbg("info", "ws open");
    });
    ws.addEventListener("close", (e) => {
      this.log("ws close", e.code, e.reason);
      this.dbg("info", "ws close", `code=${e.code} ${e.reason ?? ""}`);
      this.setStatus("ended");
      this.emit("sessionEnd", undefined);
      this.stopMic();
    });
    ws.addEventListener("error", () => {
      this.dbg("error", "ws error");
      this.emit("error", { message: "WebSocket error" });
    });
    ws.addEventListener("message", (e) => {
      if (typeof e.data === "string") {
        this.handleMessage(e.data);
      } else {
        this.handleAudioFrame(e.data as ArrayBuffer);
      }
    });

    // Wait for the socket to actually open before sending voice-session-start.
    await new Promise<void>((resolve) => {
      if (ws.readyState === WebSocket.OPEN) return resolve();
      ws.addEventListener("open", () => resolve(), { once: true });
    });

    const tools = this.toolsPayload();
    this.stats.toolsSent = tools.length;
    // Field names verified against the working Android client: the backend
    // reads `client_tools` and `page_context` — NOT `tools`/`context`. Sending
    // the wrong keys is why the model never received our tools (no tools-ack,
    // no tool calls).
    ws.send(
      JSON.stringify({
        type: "voice-session-start",
        conversation_id: this.conversationId,
        assistant_id: this.opts.assistantId,
        client_tools: tools,
        page_context: this.pageContextFn?.() ?? {},
      }),
    );
    this.dbg("out", "voice-session-start", `${tools.length} tools sent`);

    // Watchdog: if the backend never acks our tools, the model can't call them
    // (usually the assistant isn't in Native Mode). Surface it loudly.
    window.setTimeout(() => {
      if (this.stats.toolsAcked === null && this.ws === ws && this.status !== "idle" && this.status !== "ended") {
        this.dbg(
          "warn",
          "no tools-ack after 5s",
          `Sent ${tools.length} tools but the backend never acknowledged them. The assistant is likely NOT in Native Mode (Gemini Live), so it can talk but will never call a tool. Fix on the ello dashboard.`,
        );
      }
    }, 5000);
  }

  private async handleMessage(raw: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.log("non-JSON message", raw.slice(0, 200));
      return;
    }
    this.log("<-", msg.type, msg);

    switch (msg.type) {
      case "connection-established":
        this.dbg("in", "connection-established");
        break;
      case "session-established":
        this.dbg("in", "session-established", "mic starting");
        this.setStatus("listening");
        await this.startMic();
        break;
      // The backend acks tool registration as `client-tools-ack` with
      // `accepted`/`rejected` as ARRAYS of tool names (verified against the
      // live backend). Older `tools-ack`/numeric shapes handled too.
      case "tools-ack":
      case "client-tools-ack": {
        const d = (msg.data as Record<string, unknown>) ?? msg;
        const acc = d.accepted;
        const rej = d.rejected;
        const accepted = Array.isArray(acc) ? acc.length : Number(acc ?? 0);
        const rejected = Array.isArray(rej) ? rej.length : Number(rej ?? 0);
        this.stats.toolsAcked = accepted;
        this.dbg("in", String(msg.type), `accepted=${accepted} rejected=${rejected}`);
        this.emit("toolsAck", { accepted, rejected });
        break;
      }
      case "transcript":
      case "conversation-text": {
        // Verified shape: { data: { text, source: "agent"|"user", is_interim } }
        const d = (msg.data as Record<string, unknown>) ?? msg;
        const src = (d.source ?? d.role ?? d.speaker ?? msg.role) as string | undefined;
        const role = src === "user" || src === "human" ? "user" : "agent";
        const text = String(d.text ?? msg.text ?? "");
        this.dbg("in", `transcript(${role})`, text);
        this.emit("transcript", { role, text });
        break;
      }
      // Synthesised speech from the backend: base64 PCM16 @16kHz in a JSON msg.
      case "voice-audio-output": {
        const b64 = (msg.audio ?? (msg.data as Record<string, unknown>)?.audio) as string | undefined;
        if (b64) this.playPcm16(base64ToPcm16(b64));
        this.stats.audioOut++;
        if (this.stats.audioOut % 10 === 1) this.dbg("in", "voice-audio-output", `chunk #${this.stats.audioOut}`);
        if (this.status !== "speaking") this.setStatus("speaking");
        // Watchdog: this backend never emits a stream-end. Each chunk pushes the
        // deadline out; when audio stops arriving for SPEAKING_QUIET_MS we assume
        // the turn ended and go back to listening (which un-mutes the mic).
        if (this.speakingQuietTimer) clearTimeout(this.speakingQuietTimer);
        this.speakingQuietTimer = setTimeout(() => {
          this.speakingQuietTimer = null;
          if (this.status === "speaking") {
            this.dbg("info", "audio-output quiet", "no chunk for " + ElloAgent.SPEAKING_QUIET_MS + "ms -> listening");
            this.setStatus("listening");
          }
        }, ElloAgent.SPEAKING_QUIET_MS);
        break;
      }
      // Barge-in: user interrupted — drop everything still queued to play.
      case "voice-audio-purge":
        this.dbg("in", "voice-audio-purge", "barge-in, clearing playback");
        if (this.speakingQuietTimer) { clearTimeout(this.speakingQuietTimer); this.speakingQuietTimer = null; }
        this.purgePlayback();
        this.setStatus("listening");
        break;
      // Agent finished its turn — back to listening.
      case "voice-audio-stream-end":
        this.dbg("in", "voice-audio-stream-end");
        if (this.speakingQuietTimer) { clearTimeout(this.speakingQuietTimer); this.speakingQuietTimer = null; }
        if (this.status === "speaking") this.setStatus("listening");
        break;
      // Documented explicitly in the SDK guide's architecture section.
      case "client-tool-call":
      case "tool-call":
      case "toolCall":
        this.dbg("in", "client-tool-call", JSON.stringify((msg.data as Record<string, unknown>) ?? msg).slice(0, 160));
        await this.runTool(msg);
        break;
      case "error-occurred":
      case "error": {
        const d = (msg.error as Record<string, unknown>) ?? msg;
        const message = String(d.message ?? "unknown error");
        // Downgrade the update-context rejection: it's protocol negotiation
        // noise, not a real failure — disable further sends, don't alarm users.
        if (/unknown message type/i.test(message) && /update-context/i.test(message)) {
          this.contextUpdatesUnsupported = true;
          this.dbg("info", "update-context unsupported", "backend rejected it; disabling further sends");
          break;
        }
        this.dbg("error", "server error", message);
        this.emit("error", { message });
        break;
      }
      case "speaking-started":
        this.setStatus("speaking");
        break;
      case "speaking-ended":
        this.setStatus("listening");
        break;
      case "session-ended":
        this.dbg("in", "session-ended");
        this.setStatus("ended");
        this.emit("sessionEnd", undefined);
        this.stopMic();
        break;
      default:
        this.log("unhandled message type", msg.type, msg);
        this.dbg("in", `unhandled: ${String(msg.type)}`, JSON.stringify(msg).slice(0, 140));
    }
  }

  // Built-in Allow/Deny chip for tools flagged requiresConfirmation. Renders
  // its own minimal DOM (no framework dependency) so it works identically in
  // every app. Resolves false on deny or after 30s.
  private confirm(tool: ClientToolOptions): Promise<boolean> {
    const message =
      tool.confirmationMessage ?? `Allow: ${tool.name.replace(/[_-]/g, " ")}?`;
    return new Promise<boolean>((resolve) => {
      const wrap = document.createElement("div");
      wrap.setAttribute("role", "alertdialog");
      wrap.style.cssText =
        "position:fixed;bottom:96px;right:24px;z-index:60;max-width:320px;background:#111010;color:#f7f3ec;border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,.45);font:14px/1.4 system-ui,sans-serif";
      const msg = document.createElement("p");
      msg.textContent = message;
      msg.style.cssText = "margin:0 0 12px";
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:8px;justify-content:flex-end";
      const deny = document.createElement("button");
      deny.textContent = "Deny";
      deny.style.cssText =
        "padding:6px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#f7f3ec;cursor:pointer;font:inherit";
      const allow = document.createElement("button");
      allow.textContent = "Allow";
      allow.style.cssText =
        "padding:6px 16px;border-radius:999px;border:0;background:#c8a97e;color:#0a0908;font-weight:600;cursor:pointer;font:inherit";
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
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Tool timed out after ${capped}ms`)), capped),
      ),
    ]);
  }

  // Debug-only: simulate the exact client-tool-call the backend sends when
  // the user speaks a command, so the tool-dispatch → app-action path can be
  // verified without a live audio session. Exposed on window in debug mode.
  async debugSimulateToolCall(name: string, args: Record<string, unknown> = {}) {
    return this.runTool({ type: "client-tool-call", data: { name, arguments: args, call_id: "debug" } });
  }

  private async runTool(msg: Record<string, unknown>) {
    const d = (msg.data as Record<string, unknown>) ?? msg;
    const name = String(d.name ?? d.tool_name ?? "");
    const args = (d.arguments ?? d.args ?? {}) as Record<string, unknown>;
    const callId = d.call_id ?? d.id ?? null;
    this.emit("toolCall", { name, args });

    const tool = this.tools.get(name);
    let status: "ok" | "error" | "unavailable" = "ok";
    let result: unknown = null;

    if (!tool) {
      status = "unavailable";
      result = { error: `Unknown tool: ${name}` };
    } else if (tool.availableWhen && !tool.availableWhen()) {
      status = "unavailable";
      result = { error: `Tool ${name} is not available on this page right now.` };
    } else if (tool.requiresConfirmation && !(await this.confirm(tool))) {
      // User declined the built-in Allow/Deny chip.
      status = "error";
      result = { denied: true, message: "User declined the action." };
      this.setStatus("listening");
    } else {
      this.setStatus("executingTool");
      try {
        result = await this.withTimeout(
          Promise.resolve(tool.handler(args)),
          tool.timeoutMs,
        );
      } catch (err) {
        status = "error";
        result = { error: String(err) };
      }
      this.setStatus("listening");
    }

    this.emit("toolResult", { name, status });
    this.ws?.send(
      JSON.stringify({
        type: "client-tool-result",
        call_id: callId,
        name,
        status,
        result: tool?.sensitive ? "[redacted]" : result,
      }),
    );
  }

  private handleAudioFrame(buf: ArrayBuffer) {
    // Fallback for any raw-binary audio frames (protocol primarily uses the
    // JSON voice-audio-output message handled in handleMessage()).
    this.playPcm16(new Int16Array(buf));
  }

  private getAudioContextCtor(): typeof AudioContext {
    return (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    );
  }

  // Single shared context for capture + playback. Uses the DEFAULT hardware
  // sample rate (do NOT force 16kHz — forcing it makes some browsers feed the
  // mic ScriptProcessor silence instead of resampled audio). We downsample to
  // 16kHz in JS for the upstream instead. Crucially resume()d — browsers start
  // it "suspended" and onaudioprocess/playback never fire until it's running.
  private async ensureAudioContext(): Promise<AudioContext> {
    if (!this.audioCtx) {
      const Ctx = this.getAudioContextCtor();
      this.audioCtx = new Ctx();
    }
    if (this.audioCtx.state === "suspended") {
      try {
        await this.audioCtx.resume();
      } catch {
        /* ignore */
      }
    }
    return this.audioCtx;
  }

  private playCount = 0;
  private playPcm16(int16: Int16Array) {
    if (!this.audioCtx) {
      const Ctx = this.getAudioContextCtor();
      this.audioCtx = new Ctx();
    }
    const ctx = this.audioCtx;
    if (ctx.state === "suspended") {
      ctx.resume().then(
        () => this.log("audioCtx resumed for playback"),
        () => this.emit("error", { message: "Can't play audio — AudioContext is suspended (browser autoplay block)." }),
      );
    }

    // Incoming PCM is 16kHz. Resample to the context's native rate and build
    // the buffer at that rate — avoids cross-sample-rate buffer quirks that
    // silently drop audio on some browsers.
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
      const s = int16[i0] * (1 - frac) + int16[i1] * frac; // linear interp
      ch[i] = s / 32768;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    // Track scheduled speech so a barge-in (voice-audio-purge) can stop it.
    this.playing.push(src);
    src.onended = () => {
      const i = this.playing.indexOf(src);
      if (i >= 0) this.playing.splice(i, 1);
    };

    const now = ctx.currentTime;
    // Resync if the queue pointer drifted (stale from a previous context, or
    // fell behind) so audio always plays right after "now".
    if (this.playbackQueueTime < now || this.playbackQueueTime > now + 5) {
      this.playbackQueueTime = now + 0.05;
    }
    src.start(this.playbackQueueTime);
    this.playbackQueueTime += buffer.duration;

    if (++this.playCount % 15 === 0)
      this.log(`playback: ${this.playCount} chunks, ctx=${ctx.state} @${outRate}Hz`);
  }

  // Barge-in: stop and drop all queued/playing speech immediately.
  private purgePlayback() {
    for (const src of this.playing.splice(0)) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    this.playbackQueueTime = this.audioCtx ? this.audioCtx.currentTime : 0;
  }

  // Open the mic stream. Called up front from start() (inside the click
  // gesture); idempotent so startMic() can safely call it again.
  private async acquireMic(): Promise<void> {
    if (this.micStream && this.micStream.getAudioTracks().some((t) => t.readyState === "live")) return;
    this.dbg("info", "acquireMic()", "requesting microphone…");
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone API unavailable (needs https / a supported browser).");
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
    this.dbg("info", "getUserMedia ok", tr ? `${tr.label || "mic"} enabled=${tr.enabled} muted=${tr.muted} state=${tr.readyState}` : "no track");
  }

  private async startMic() {
    try {
      await this.acquireMic();
    } catch (err) {
      this.dbg("error", "getUserMedia failed", String(err));
      this.emit("error", { message: `Microphone access denied: ${String(err)}` });
      return;
    }
    if (!this.micStream) return;
    const ctx = await this.ensureAudioContext();
    const rate = ctx.sampleRate; // 16000 when the browser honours our request
    this.dbg("info", "audioContext", `state=${ctx.state} sampleRate=${rate}`);
    this.micSource = ctx.createMediaStreamSource(this.micStream);
    // ScriptProcessorNode is deprecated but universally supported.
    this.micProcessor = ctx.createScriptProcessor(4096, 1, 1);

    let frames = 0;
    let soundFrames = 0; // frames whose RMS is above the near-silence floor
    let firstFrameLogged = false;
    this.micProcessor.onaudioprocess = (ev) => {
      if (!firstFrameLogged) {
        firstFrameLogged = true;
        this.dbg("info", "mic processor firing", `ctx=${this.audioCtx?.state} ws=${this.ws?.readyState}`);
      }
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      const input = ev.inputBuffer.getChannelData(0);
      // RMS to tell "mic dead / all zeros" apart from "mic live, user quiet".
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      const rms = Math.sqrt(sum / input.length);
      if (rms > 0.01) soundFrames++;

      const resampled = rate === 16000 ? input : downsampleTo16k(input, rate);
      const pcm16 = floatTo16BitPCM(resampled);
      // Verified against the working Android client: mic audio is a JSON
      // message { type:"voice-audio-input", data:<base64 PCM16>, sample_rate }.
      // The backend reads the base64 from `data` (its "no audio data" warning
      // was literally naming this key) and needs `sample_rate`, not `format`.
      this.ws.send(
        JSON.stringify({
          type: "voice-audio-input",
          data: pcm16ToBase64(pcm16),
          sample_rate: 16000,
        }),
      );
      frames++;
      this.stats.micFrames = frames;
      this.stats.micSoundFrames = soundFrames;
      if (frames % 25 === 0) {
        this.log(`mic: sent ${frames} frames @${rate}Hz, ${soundFrames} with sound (rms>0.01)`);
        this.dbg("out", "mic frames", `${frames} sent @${rate}Hz, ${soundFrames} with sound (binary PCM16)`);
      }
    };

    // Watchdog: if the processor never fires, or only ever sees pure silence,
    // surface it instead of failing invisibly.
    setTimeout(() => {
      if (frames === 0) {
        this.dbg("error", "mic not firing", "0 audio frames captured");
        this.emit("error", {
          message: "Mic capture isn't firing (0 audio frames). Check mic permission/hardware.",
        });
      } else if (soundFrames === 0) {
        this.dbg("warn", "mic silent", `${frames} frames but all near-silence`);
        this.emit("error", {
          message: "Mic is connected but only silence is captured — check the OS input device/level.",
        });
      } else {
        this.dbg("info", "mic live", `${frames} frames, ${soundFrames} with sound`);
      }
    }, 3500);

    // Route mic -> processor -> muted gain -> destination. The processor only
    // fires while connected to the graph; the zero-gain node keeps it running
    // WITHOUT echoing the user's mic back out the speakers.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    this.micSource.connect(this.micProcessor);
    this.micProcessor.connect(mute);
    mute.connect(ctx.destination);
    this.log("mic started", { sampleRate: rate, ctxState: ctx.state });
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

  setMuted(muted: boolean) {
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach((t) => (t.enabled = !muted));
    }
  }

  stop() {
    if (this.speakingQuietTimer) { clearTimeout(this.speakingQuietTimer); this.speakingQuietTimer = null; }
    // Tell the backend the session is ending (matches the working app) before
    // tearing down the socket.
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "voice-session-end", conversation_id: this.conversationId }));
      } catch {
        /* ignore */
      }
    }
    this.purgePlayback();
    this.stopMic();
    this.ws?.close();
    this.ws = null;
    this.setStatus("ended");
  }
}

function pcm16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToPcm16(b64: string): Int16Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  // Guard against odd byte lengths so the Int16Array view is always valid.
  const even = bytes.byteLength - (bytes.byteLength % 2);
  return new Int16Array(bytes.buffer, 0, even / 2);
}

function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === 16000) return input;
  const ratio = inputRate / 16000;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  // Averaging (box low-pass) downsample — NOT naive decimation. Decimation
  // without anti-aliasing garbles speech so the recognizer can't read it.
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
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

// fillInput: same security-gated helper the real SDK documents.
const SENSITIVE_RE = /password|otp|cvv|cvc|ssn|pin/i;
const SENSITIVE_AUTOCOMPLETE = new Set([
  "one-time-code",
  "cc-csc",
  "current-password",
  "new-password",
]);

export function isSensitiveInput(el: HTMLElement): boolean {
  const attrs = [el.getAttribute("name"), el.getAttribute("id"), el.getAttribute("placeholder"), el.getAttribute("aria-label")]
    .filter(Boolean)
    .join(" ");
  if (SENSITIVE_RE.test(attrs)) return true;
  const ac = el.getAttribute("autocomplete");
  if (ac && SENSITIVE_AUTOCOMPLETE.has(ac)) return true;
  if (el instanceof HTMLInputElement && el.type === "password") return true;
  return false;
}

export function fillInput(target: string, value: string): { success: boolean; reason?: string } {
  const el = document.querySelector(target);
  if (!el || !(el instanceof HTMLElement)) return { success: false, reason: "Element not found" };
  if (isSensitiveInput(el)) {
    el.focus();
    return { success: false, reason: "Refused: sensitive field — user must type it themselves" };
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { success: true };
  }
  if (el instanceof HTMLSelectElement) {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { success: true };
  }
  return { success: false, reason: "Unsupported element type" };
}
