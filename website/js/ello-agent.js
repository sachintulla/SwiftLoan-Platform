"use strict";
var ElloSDK = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // ../SwiftLoan-Platform/admin/src/lib/ello-agent.ts
  var ello_agent_exports = {};
  __export(ello_agent_exports, {
    ElloAgent: () => ElloAgent,
    fillInput: () => fillInput,
    isSensitiveInput: () => isSensitiveInput
  });
  var DEFAULT_API_BASE = "https://api-in.getello.ai";
  var DEFAULT_WS_URL = "wss://connect-in.getello.ai/ws-ello";
  var ElloAgent = class _ElloAgent {
    constructor(options) {
      this.tools = /* @__PURE__ */ new Map();
      this.pageContextFn = null;
      this.ws = null;
      this.status = "idle";
      this.listeners = {};
      this.audioCtx = null;
      this.micStream = null;
      this.micProcessor = null;
      this.micSource = null;
      this.playbackQueueTime = 0;
      this.playing = [];
      // scheduled speech, for barge-in purge
      this.startTime = 0;
      // The backend rejects `update-context` ("Unknown message type"). Once we see
      // that, stop sending it (and stop surfacing the rejection as a user error).
      this.contextUpdatesUnsupported = false;
      // This backend does NOT send a "speaking ended" / voice-audio-stream-end
      // message. Without one, the half-duplex mic-mute (applied on `speaking`) would
      // never lift and the mic stays dead after the agent's first utterance. We
      // watchdog the audio-output stream: when it goes quiet, resume listening.
      this.speakingQuietTimer = null;
      // Live counters exposed to the debug panel.
      this.stats = { micFrames: 0, micSoundFrames: 0, audioOut: 0, toolsSent: 0, toolsAcked: null };
      this.conversationId = null;
      this.playCount = 0;
      this.opts = {
        apiBaseUrl: options.apiBaseUrl ?? DEFAULT_API_BASE,
        wsUrl: options.wsUrl ?? DEFAULT_WS_URL,
        ...options
      };
    }
    static {
      this.SPEAKING_QUIET_MS = 1200;
    }
    log(...args) {
      if (this.opts.debug) console.log("[ello-agent]", ...args);
    }
    // Structured trace for the debug panel (and console when debug is on).
    dbg(kind, label, detail) {
      const t = this.startTime ? Date.now() - this.startTime : 0;
      this.emit("debug", { t, kind, label, detail });
      if (this.opts.debug) console.log(`[ello-agent ${t}ms] ${kind.toUpperCase()} ${label}`, detail ?? "");
    }
    on(event, fn) {
      const list = this.listeners[event] ?? [];
      list.push(fn);
      this.listeners[event] = list;
    }
    emit(event, payload) {
      this.listeners[event]?.forEach((fn) => fn(payload));
    }
    setStatus(s) {
      if (this.status === s) return;
      this.status = s;
      if (s === "speaking") this.setMuted(true);
      else if (s === "listening") this.setMuted(false);
      this.emit("statusChange", s);
    }
    registerTool(tool) {
      this.tools.set(tool.name, tool);
    }
    unregisterTool(name) {
      this.tools.delete(name);
    }
    registerPageContext(fn) {
      this.pageContextFn = fn;
    }
    toolsPayload() {
      return Array.from(this.tools.values()).map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.schema,
        available: t.availableWhen ? t.availableWhen() : true
      }));
    }
    updatePageContext() {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      if (this.contextUpdatesUnsupported) return;
      const payload = {
        type: "update-context",
        conversation_id: this.conversationId,
        client_tools: this.toolsPayload(),
        page_context: this.pageContextFn?.() ?? {}
      };
      this.log("update-context ->", payload);
      this.dbg("out", "update-context");
      this.ws.send(JSON.stringify(payload));
    }
    showWidget() {
    }
    async start() {
      if (this.status !== "idle" && this.status !== "ended") return;
      this.startTime = Date.now();
      this.stats = { micFrames: 0, micSoundFrames: 0, audioOut: 0, toolsSent: 0, toolsAcked: null };
      this.dbg("info", "start()", "connecting");
      this.setStatus("connecting");
      this.playbackQueueTime = 0;
      this.playCount = 0;
      try {
        await this.ensureAudioContext();
      } catch {
      }
      try {
        await this.acquireMic();
      } catch (err) {
        this.dbg("error", "mic acquire failed", String(err));
        this.emit("error", {
          message: "Microphone access is needed to talk. Please allow it in your browser and click again."
        });
        this.setStatus("idle");
        return;
      }
      try {
        const resp = await fetch(`${this.opts.apiBaseUrl}/api/agents/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": this.opts.apiKey },
          body: JSON.stringify({
            assistant_id: this.opts.assistantId,
            agent_type: "webcall",
            source: "sdk"
          })
        });
        const json = await resp.json();
        this.log("publish response", json);
        const conversationId = json?.data?.conversation_id ?? json?.conversation_id;
        if (!resp.ok || !conversationId) {
          throw new Error(json?.message ?? `publish failed: ${resp.status}`);
        }
        this.conversationId = conversationId;
        this.dbg("info", "publish ok", `conversation_id=${conversationId}`);
      } catch (err) {
        this.dbg("error", "publish failed", String(err));
        this.emit("error", { message: String(err) });
        this.setStatus("idle");
        return;
      }
      await this.openSocket();
    }
    async openSocket() {
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
        this.emit("sessionEnd", void 0);
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
          this.handleAudioFrame(e.data);
        }
      });
      await new Promise((resolve) => {
        if (ws.readyState === WebSocket.OPEN) return resolve();
        ws.addEventListener("open", () => resolve(), { once: true });
      });
      const tools = this.toolsPayload();
      this.stats.toolsSent = tools.length;
      ws.send(
        JSON.stringify({
          type: "voice-session-start",
          conversation_id: this.conversationId,
          assistant_id: this.opts.assistantId,
          client_tools: tools,
          page_context: this.pageContextFn?.() ?? {}
        })
      );
      this.dbg("out", "voice-session-start", `${tools.length} tools sent`);
      window.setTimeout(() => {
        if (this.stats.toolsAcked === null && this.ws === ws && this.status !== "idle" && this.status !== "ended") {
          this.dbg(
            "warn",
            "no tools-ack after 5s",
            `Sent ${tools.length} tools but the backend never acknowledged them. The assistant is likely NOT in Native Mode (Gemini Live), so it can talk but will never call a tool. Fix on the ello dashboard.`
          );
        }
      }, 5e3);
    }
    async handleMessage(raw) {
      let msg;
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
          const d = msg.data ?? msg;
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
          const d = msg.data ?? msg;
          const src = d.source ?? d.role ?? d.speaker ?? msg.role;
          const role = src === "user" || src === "human" ? "user" : "agent";
          const text = String(d.text ?? msg.text ?? "");
          this.dbg("in", `transcript(${role})`, text);
          this.emit("transcript", { role, text });
          break;
        }
        // Synthesised speech from the backend: base64 PCM16 @16kHz in a JSON msg.
        case "voice-audio-output": {
          const b64 = msg.audio ?? msg.data?.audio;
          if (b64) this.playPcm16(base64ToPcm16(b64));
          this.stats.audioOut++;
          if (this.stats.audioOut % 10 === 1) this.dbg("in", "voice-audio-output", `chunk #${this.stats.audioOut}`);
          if (this.status !== "speaking") this.setStatus("speaking");
          if (this.speakingQuietTimer) clearTimeout(this.speakingQuietTimer);
          this.speakingQuietTimer = setTimeout(() => {
            this.speakingQuietTimer = null;
            if (this.status === "speaking") {
              this.dbg("info", "audio-output quiet", "no chunk for " + _ElloAgent.SPEAKING_QUIET_MS + "ms -> listening");
              this.setStatus("listening");
            }
          }, _ElloAgent.SPEAKING_QUIET_MS);
          break;
        }
        // Barge-in: user interrupted — drop everything still queued to play.
        case "voice-audio-purge":
          this.dbg("in", "voice-audio-purge", "barge-in, clearing playback");
          if (this.speakingQuietTimer) {
            clearTimeout(this.speakingQuietTimer);
            this.speakingQuietTimer = null;
          }
          this.purgePlayback();
          this.setStatus("listening");
          break;
        // Agent finished its turn — back to listening.
        case "voice-audio-stream-end":
          this.dbg("in", "voice-audio-stream-end");
          if (this.speakingQuietTimer) {
            clearTimeout(this.speakingQuietTimer);
            this.speakingQuietTimer = null;
          }
          if (this.status === "speaking") this.setStatus("listening");
          break;
        // Documented explicitly in the SDK guide's architecture section.
        case "client-tool-call":
        case "tool-call":
        case "toolCall":
          this.dbg("in", "client-tool-call", JSON.stringify(msg.data ?? msg).slice(0, 160));
          await this.runTool(msg);
          break;
        case "error-occurred":
        case "error": {
          const d = msg.error ?? msg;
          const message = String(d.message ?? "unknown error");
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
          this.emit("sessionEnd", void 0);
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
    confirm(tool) {
      const message = tool.confirmationMessage ?? `Allow: ${tool.name.replace(/[_-]/g, " ")}?`;
      return new Promise((resolve) => {
        const wrap = document.createElement("div");
        wrap.setAttribute("role", "alertdialog");
        wrap.style.cssText = "position:fixed;bottom:96px;right:24px;z-index:60;max-width:320px;background:#111010;color:#f7f3ec;border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,.45);font:14px/1.4 system-ui,sans-serif";
        const msg = document.createElement("p");
        msg.textContent = message;
        msg.style.cssText = "margin:0 0 12px";
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:8px;justify-content:flex-end";
        const deny = document.createElement("button");
        deny.textContent = "Deny";
        deny.style.cssText = "padding:6px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#f7f3ec;cursor:pointer;font:inherit";
        const allow = document.createElement("button");
        allow.textContent = "Allow";
        allow.style.cssText = "padding:6px 16px;border-radius:999px;border:0;background:#c8a97e;color:#0a0908;font-weight:600;cursor:pointer;font:inherit";
        let settled = false;
        const done = (v) => {
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
        setTimeout(() => done(false), 3e4);
      });
    }
    withTimeout(p, ms) {
      if (!ms) return p;
      const capped = Math.min(ms, 3e4);
      return Promise.race([
        p,
        new Promise(
          (_, reject) => setTimeout(() => reject(new Error(`Tool timed out after ${capped}ms`)), capped)
        )
      ]);
    }
    // Debug-only: simulate the exact client-tool-call the backend sends when
    // the user speaks a command, so the tool-dispatch → app-action path can be
    // verified without a live audio session. Exposed on window in debug mode.
    async debugSimulateToolCall(name, args = {}) {
      return this.runTool({ type: "client-tool-call", data: { name, arguments: args, call_id: "debug" } });
    }
    async runTool(msg) {
      const d = msg.data ?? msg;
      const name = String(d.name ?? d.tool_name ?? "");
      const args = d.arguments ?? d.args ?? {};
      const callId = d.call_id ?? d.id ?? null;
      this.emit("toolCall", { name, args });
      const tool = this.tools.get(name);
      let status = "ok";
      let result = null;
      if (!tool) {
        status = "unavailable";
        result = { error: `Unknown tool: ${name}` };
      } else if (tool.availableWhen && !tool.availableWhen()) {
        status = "unavailable";
        result = { error: `Tool ${name} is not available on this page right now.` };
      } else if (tool.requiresConfirmation && !await this.confirm(tool)) {
        status = "error";
        result = { denied: true, message: "User declined the action." };
        this.setStatus("listening");
      } else {
        this.setStatus("executingTool");
        try {
          result = await this.withTimeout(
            Promise.resolve(tool.handler(args)),
            tool.timeoutMs
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
          result: tool?.sensitive ? "[redacted]" : result
        })
      );
    }
    handleAudioFrame(buf) {
      this.playPcm16(new Int16Array(buf));
    }
    getAudioContextCtor() {
      return window.AudioContext || window.webkitAudioContext;
    }
    // Single shared context for capture + playback. Uses the DEFAULT hardware
    // sample rate (do NOT force 16kHz — forcing it makes some browsers feed the
    // mic ScriptProcessor silence instead of resampled audio). We downsample to
    // 16kHz in JS for the upstream instead. Crucially resume()d — browsers start
    // it "suspended" and onaudioprocess/playback never fire until it's running.
    async ensureAudioContext() {
      if (!this.audioCtx) {
        const Ctx = this.getAudioContextCtor();
        this.audioCtx = new Ctx();
      }
      if (this.audioCtx.state === "suspended") {
        try {
          await this.audioCtx.resume();
        } catch {
        }
      }
      return this.audioCtx;
    }
    playPcm16(int16) {
      if (!this.audioCtx) {
        const Ctx = this.getAudioContextCtor();
        this.audioCtx = new Ctx();
      }
      const ctx = this.audioCtx;
      if (ctx.state === "suspended") {
        ctx.resume().then(
          () => this.log("audioCtx resumed for playback"),
          () => this.emit("error", { message: "Can't play audio \u2014 AudioContext is suspended (browser autoplay block)." })
        );
      }
      const inRate = 16e3;
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
      src.connect(ctx.destination);
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
      if (++this.playCount % 15 === 0)
        this.log(`playback: ${this.playCount} chunks, ctx=${ctx.state} @${outRate}Hz`);
    }
    // Barge-in: stop and drop all queued/playing speech immediately.
    purgePlayback() {
      for (const src of this.playing.splice(0)) {
        try {
          src.onended = null;
          src.stop();
        } catch {
        }
      }
      this.playbackQueueTime = this.audioCtx ? this.audioCtx.currentTime : 0;
    }
    // Open the mic stream. Called up front from start() (inside the click
    // gesture); idempotent so startMic() can safely call it again.
    async acquireMic() {
      if (this.micStream && this.micStream.getAudioTracks().some((t) => t.readyState === "live")) return;
      this.dbg("info", "acquireMic()", "requesting microphone\u2026");
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone API unavailable (needs https / a supported browser).");
      }
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      const tr = this.micStream.getAudioTracks()[0];
      this.dbg("info", "getUserMedia ok", tr ? `${tr.label || "mic"} enabled=${tr.enabled} muted=${tr.muted} state=${tr.readyState}` : "no track");
    }
    async startMic() {
      try {
        await this.acquireMic();
      } catch (err) {
        this.dbg("error", "getUserMedia failed", String(err));
        this.emit("error", { message: `Microphone access denied: ${String(err)}` });
        return;
      }
      if (!this.micStream) return;
      const ctx = await this.ensureAudioContext();
      const rate = ctx.sampleRate;
      this.dbg("info", "audioContext", `state=${ctx.state} sampleRate=${rate}`);
      this.micSource = ctx.createMediaStreamSource(this.micStream);
      this.micProcessor = ctx.createScriptProcessor(4096, 1, 1);
      let frames = 0;
      let soundFrames = 0;
      let firstFrameLogged = false;
      this.micProcessor.onaudioprocess = (ev) => {
        if (!firstFrameLogged) {
          firstFrameLogged = true;
          this.dbg("info", "mic processor firing", `ctx=${this.audioCtx?.state} ws=${this.ws?.readyState}`);
        }
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const input = ev.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
        const rms = Math.sqrt(sum / input.length);
        if (rms > 0.01) soundFrames++;
        const resampled = rate === 16e3 ? input : downsampleTo16k(input, rate);
        const pcm16 = floatTo16BitPCM(resampled);
        this.ws.send(
          JSON.stringify({
            type: "voice-audio-input",
            data: pcm16ToBase64(pcm16),
            sample_rate: 16e3
          })
        );
        frames++;
        this.stats.micFrames = frames;
        this.stats.micSoundFrames = soundFrames;
        if (frames % 25 === 0) {
          this.log(`mic: sent ${frames} frames @${rate}Hz, ${soundFrames} with sound (rms>0.01)`);
          this.dbg("out", "mic frames", `${frames} sent @${rate}Hz, ${soundFrames} with sound (binary PCM16)`);
        }
      };
      setTimeout(() => {
        if (frames === 0) {
          this.dbg("error", "mic not firing", "0 audio frames captured");
          this.emit("error", {
            message: "Mic capture isn't firing (0 audio frames). Check mic permission/hardware."
          });
        } else if (soundFrames === 0) {
          this.dbg("warn", "mic silent", `${frames} frames but all near-silence`);
          this.emit("error", {
            message: "Mic is connected but only silence is captured \u2014 check the OS input device/level."
          });
        } else {
          this.dbg("info", "mic live", `${frames} frames, ${soundFrames} with sound`);
        }
      }, 3500);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      this.micSource.connect(this.micProcessor);
      this.micProcessor.connect(mute);
      mute.connect(ctx.destination);
      this.log("mic started", { sampleRate: rate, ctxState: ctx.state });
    }
    stopMic() {
      this.micProcessor?.disconnect();
      this.micSource?.disconnect();
      this.micStream?.getTracks().forEach((t) => t.stop());
      this.micProcessor = null;
      this.micSource = null;
      this.micStream = null;
      this.audioCtx?.close();
      this.audioCtx = null;
    }
    setMuted(muted) {
      if (this.micStream) {
        this.micStream.getAudioTracks().forEach((t) => t.enabled = !muted);
      }
    }
    stop() {
      if (this.speakingQuietTimer) {
        clearTimeout(this.speakingQuietTimer);
        this.speakingQuietTimer = null;
      }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: "voice-session-end", conversation_id: this.conversationId }));
        } catch {
        }
      }
      this.purgePlayback();
      this.stopMic();
      this.ws?.close();
      this.ws = null;
      this.setStatus("ended");
    }
  };
  function pcm16ToBase64(int16) {
    const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
    let binary = "";
    const chunk = 32768;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }
  function base64ToPcm16(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const even = bytes.byteLength - bytes.byteLength % 2;
    return new Int16Array(bytes.buffer, 0, even / 2);
  }
  function downsampleTo16k(input, inputRate) {
    if (inputRate === 16e3) return input;
    const ratio = inputRate / 16e3;
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
  function floatTo16BitPCM(input) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 32768 : s * 32767;
    }
    return out;
  }
  var SENSITIVE_RE = /password|otp|cvv|cvc|ssn|pin/i;
  var SENSITIVE_AUTOCOMPLETE = /* @__PURE__ */ new Set([
    "one-time-code",
    "cc-csc",
    "current-password",
    "new-password"
  ]);
  function isSensitiveInput(el) {
    const attrs = [el.getAttribute("name"), el.getAttribute("id"), el.getAttribute("placeholder"), el.getAttribute("aria-label")].filter(Boolean).join(" ");
    if (SENSITIVE_RE.test(attrs)) return true;
    const ac = el.getAttribute("autocomplete");
    if (ac && SENSITIVE_AUTOCOMPLETE.has(ac)) return true;
    if (el instanceof HTMLInputElement && el.type === "password") return true;
    return false;
  }
  function fillInput(target, value) {
    const el = document.querySelector(target);
    if (!el || !(el instanceof HTMLElement)) return { success: false, reason: "Element not found" };
    if (isSensitiveInput(el)) {
      el.focus();
      return { success: false, reason: "Refused: sensitive field \u2014 user must type it themselves" };
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { success: true };
    }
    if (el instanceof HTMLSelectElement) {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { success: true };
    }
    return { success: false, reason: "Unsupported element type" };
  }
  return __toCommonJS(ello_agent_exports);
})();
