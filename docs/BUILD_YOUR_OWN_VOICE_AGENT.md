# Build Your Own Voice Agent with Gemini (No Ello)

**Goal:** run the same kind of agent we run on Ello today — talks in real time, can act on your app's screens, makes outbound phone calls, remembers customers — **owning every layer yourself**, with Google's Gemini Live API as the voice model.

**Short answer: yes, it is possible.** Ello's "Native Mode" is Gemini Live under the hood. So the model is not the hard part — you can call it directly. What Ello gives you on top of the model is **plumbing**: sessions, telephony, a dialler, webhooks, recordings/transcripts and a dashboard. Going without Ello means you build or buy each of those.

> Verified against Google's Live API docs on 2026-10-05. This API moves fast: re-check model ids, limits and SDK signatures before you start coding.

---

## 1. What Ello does for you vs what you must replace

| Ello gives you today | You'll need instead |
|---|---|
| Hosted Gemini Live session + WebSocket protocol | Connect to Gemini Live directly (§5, step 2) |
| Session minting, keeping the key off devices | Your own server: **ephemeral tokens** or a WebSocket relay |
| Phone numbers, SIP trunk, outbound dialling | A telephony provider (CPaaS / SIP) + a bridge (§3) |
| Batch campaign dialler, webhooks | Your own campaign scheduler + call-event handling |
| Call recordings, transcripts, call insights | Your own recording storage, transcription capture, summaries |
| Agent/prompt/tools dashboard | Prompts and tool configs in your own repo/admin |
| Concurrency, scaling, uptime | Your own infra, quotas, monitoring |
| Support | You |

What you **keep** from an existing Ello-based setup: the app-side voice layer is mostly provider-agnostic — the tool executor, the screen/control registry, sensitive-field guards, page-context throttling, native audio capture/playback with echo cancellation, confirmation sheets, and your backend memory/outcome APIs. Only the **transport** (how a session starts and which messages are exchanged) changes.

---

## 2. Architecture

```
 In-app / web voice                                 Phone calls
 ┌──────────────┐  ephemeral token   ┌───────────┐  ┌──────────────┐  SIP/RTP   ┌──────────────┐
 │ App / site   │◀──────────────────▶│ Your      │  │ Telephony    │◀──────────▶│ Customer     │
 │ mic + tools  │                    │ backend   │  │ provider     │            └──────────────┘
 └──────┬───────┘                    │ (tokens,  │  └──────┬───────┘
        │ WebSocket (audio + tools)  │ memory,   │         │ media stream (WebSocket)
        ▼                            │ calls,    │         ▼
 ┌──────────────────┐                │ campaigns,│  ┌────────────────────┐
 │ Gemini Live API  │◀───────────────┤ webhooks) │◀▶│ Voice bridge       │
 │ (audio ⇄ audio,  │  server-to-    └───────────┘  │ (transcode audio,  │
 │  tool calls)     │  server WS                    │  run tools, log)   │
 └──────────────────┘                               └────────────────────┘
```

Two connection patterns for the Live API:
- **Client-to-server** (app/browser connects straight to Google): lowest latency, but you must use **ephemeral tokens**, never your API key.
- **Server-to-server** (your backend holds the key and relays audio): required for **phone calls** (the media arrives at your server anyway) and useful when you want to run tools, log and record on the server.

---

## 3. Third-party tools you'll need

| Need | Options | Notes |
|---|---|---|
| **Voice model** | Gemini Live API (Google AI Studio / Gemini API), or Gemini on Vertex AI | Check the models page for the current Live model id; at time of writing it lists `gemini-3.8-live` (stable), `gemini-3.8-live-extended-thinking`, and previews such as `gemini-3.1-flash-live-preview`. Confirm exact ids before coding |
| **SDK** | `@google/genai` (JS/TS), Google GenAI SDK for Python | Wraps the WebSocket and message types |
| **Voice orchestration (optional but saves weeks)** | **Pipecat**, **LiveKit Agents** | Open-source frameworks that already handle audio plumbing, interruptions and (LiveKit) SIP; both advertise Gemini Live integrations — verify current support. Google's own docs name no telephony partner |
| **Telephony (phone calls)** | Twilio, Telnyx, Plivo, Vonage, Exotel (India), or your carrier's SIP trunk | You need numbers, outbound dialling, and a **media stream** to your bridge. Most streams are **8 kHz μ-law** — you transcode to/from Gemini's formats |
| **Browser/mobile real-time transport** | Plain WebSocket PCM (simplest), or WebRTC (LiveKit, Daily) | WebRTC gives better echo handling and network resilience on bad connections |
| **Backend & data** | Node/Python service, Postgres, Redis + a queue (BullMQ/Celery), object storage (S3) | Calls, contacts, outcomes, memory, recordings |
| **Scheduler/dialler** | Your own job runner | Campaign window, retries, concurrency, per-number cooldown |
| **Secrets & config** | A secret manager | API keys, webhook secrets — never in client bundles |
| **Observability** | Logging + metrics + alerting (Datadog/Grafana/Sentry, etc.) | Voice failures are silent otherwise |
| **Optional fallbacks** | Google Cloud Speech-to-Text/Text-to-Speech, Deepgram, ElevenLabs | Only if you ever move to a cascaded STT → LLM → TTS pipeline |

---

## 4. Things to make sure of (read before you commit)

### Gemini Live specifics (from Google's docs)

| Fact | What it means for you |
|---|---|
| **Audio in: 16-bit PCM, 16 kHz, little-endian. Audio out: 16-bit PCM, 24 kHz.** | Your playback must handle **24 kHz** (an Ello session delivered 16 kHz — don't reuse that assumption). Phone audio needs resampling both ways |
| **Tools are declared in the session config, before connecting.** Docs say nothing about changing them mid-session | Treat tools as **frozen at connect**: declare every tool up front; use a generic executor + `available`/page context as you do today |
| **No automatic tool handling** — you receive a tool call and must send the response yourself | You write the tool loop (see sketch below) |
| **Async (non-blocking) function calling isn't supported on the 3.1 Flash Live preview** (sync only); the 2.5 native-audio preview supports both | Keep tools **fast**; a slow tool stalls the conversation. Re-check per model |
| **Audio-only sessions are limited to ~15 min without compression; a connection lives ~10 min**; the server sends `GoAway` before closing | Turn on **context window compression** and **session resumption** (resumption handles are valid ~2 h) and reconnect on `GoAway`. Long phone calls will hit this |
| **Context window: 128k tokens** for native-audio models | Plan prompt + memory + tool results to fit |
| **Voice activity detection is automatic and tunable** (`startOfSpeechSensitivity`, `endOfSpeechSensitivity`, `prefixPaddingMs`, `silenceDurationMs`; Google suggests ~500–800 ms silence) | You now own turn-taking quality — expect to tune it per language and per noisy phone line |
| **Barge-in arrives as `interrupted`** | Stop and clear playback immediately when you see it |
| **Native audio models respond with AUDIO only**; enable input/output **transcription** to get text | Turn on both transcriptions — you need them for logs, summaries and compliance |
| **Ephemeral tokens**: default 30 min expiry, 1 min to start a session, single use; usable only with the Live API; can be locked to a model/config | Mint one per session on your server; lock the config so a stolen token can't be repurposed |

### Things Ello was quietly doing — now your job

- **Echo cancellation and audio routing** on devices (you already solved this natively; keep it).
- **Call recording, transcripts and summaries.** Decide what you store, where, and for how long.
- **Webhook-like call events and outcome capture.** Gemini doesn't know your funnel. Keep the "agent reports its own outcome via a tool" pattern; don't rely on keyword guesses.
- **Call state and reconciliation** (stuck/ghost calls, lost events).
- **Calling compliance.** Consent, recording disclosure, calling-hours windows, do-not-call lists, caller-ID rules and sender registration (for example, in India, telemarketing registration and calling-hour rules) — confirm with your telecom provider and legal counsel. Ello's tooling didn't remove these obligations, but your own platform now has to enforce them end to end.
- **Spend control.** Audio is billed per token/time, plus telephony per minute. Put an hourly cap, per-number cooldown and a global kill switch in code before the first real call.
- **Data protection.** Customer audio goes to Google. Check data-processing terms, regions and retention (and whether Vertex AI gives you the controls you need). Never let the agent collect secrets (passwords, card/ID numbers, one-time codes) by voice.
- **Reliability.** One provider means one outage domain. Define the degraded behaviour (voicemail, "we'll call you back", plain text chat) and alert on session start failures.
- **Quotas.** Check concurrent-session and rate limits for your account tier before planning campaign concurrency.

---

## 5. Steps

### Step 1 — Prove the model (½–1 day)
Get a Gemini API key, open a Live session from a small script, send a prompt and a recorded 16 kHz clip, and play back the 24 kHz reply. Pick the model id from Google's models page.

### Step 2 — Server: token broker (1 day)
Your backend holds the Gemini key and issues a **single-use ephemeral token** per session (lock model and config). Rate-limit it and authenticate the caller (user session or role). Never ship the key in a client.

### Step 3 — Client: in-app / web voice (2–5 days if you reuse an existing voice layer)
Write a new transport that implements the same interface your current agent uses:

```ts
// Sketch — check current SDK signatures in Google's docs.
const ai = new GoogleGenAI({ apiKey: ephemeralToken });
const session = await ai.live.connect({
  model: MODEL_ID,
  config: {
    responseModalities: [Modality.AUDIO],
    systemInstruction: PROMPT,
    tools: [{ functionDeclarations }],                       // ALL tools, up front
    realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 600 } },
    inputAudioTranscription: {}, outputAudioTranscription: {},
    sessionResumption: {}, contextWindowCompression: { slidingWindow: {} },
  },
  callbacks: { onmessage, onerror, onclose },
});

// mic → Gemini (16 kHz PCM16, ~20–40 ms chunks)
session.sendRealtimeInput({ audio: { data: base64Pcm16k, mimeType: 'audio/pcm;rate=16000' } });

// Gemini → you
function onmessage(m) {
  if (m.serverContent?.interrupted) player.purge();          // barge-in
  for (const p of m.serverContent?.modelTurn?.parts ?? [])
    if (p.inlineData) player.play(p.inlineData.data);        // 24 kHz PCM16
  if (m.toolCall) runTools(m.toolCall.functionCalls)         // you must answer yourself
      .then(responses => session.sendToolResponse({ functionResponses: responses }));
  if (m.goAway) reconnectWithResumptionHandle();             // before the connection dies
}
```

Carry over: serialised tool execution, availability re-checks, argument validation, fail-closed confirmations, "report the real state after the action", sensitive-field denylist, throttled page context. **Replace:** the Ello-specific messages (`voice-session-start`, `client-tools-update`, `voice-audio-input`…) with the Live API's equivalents. Page context becomes text you send into the session (as a client content turn) and/or part of the system instruction — design how often you send it, because injecting context during speech can interrupt the model.

### Step 4 — Memory and outcome APIs (reuse)
Keep the phone-keyed memory pull/push and the outcome-report endpoints you already have. The difference: **you** call them — either as Gemini function tools executed on your server, or as direct server code at session start (inject the "brief" into the system instruction instead of relying on a tool) and session end (save the summary from the output transcription).

### Step 5 — Phone calls (1–3 weeks)
1. Choose a telephony provider; buy/port numbers; complete any regulatory registration.
2. **Outbound:** your server asks the provider to dial; when answered, the provider opens a **media stream** (usually WebSocket, 8 kHz μ-law) to your **voice bridge**.
3. **Bridge:** open a Gemini Live session (server-to-server), transcode phone audio ↔ Gemini audio (8 kHz μ-law → 16 kHz PCM up; 24 kHz PCM → 8 kHz μ-law down), pipe both ways, handle `interrupted` by flushing the provider's outbound buffer, run tools, save transcript and recording.
4. Handle provider call-status callbacks (ringing, answered, busy, no-answer, completed) → your call table. Add a reconcile sweep for calls with no terminal event.
5. Prefer **Pipecat or LiveKit Agents** here: they already implement the bridge, interruption handling and (LiveKit) SIP, which removes most of the audio engineering.

### Step 6 — Campaigns and safety (1–2 weeks)
Contact lists, schedule window in the campaign's time zone, retry rules, concurrency limit, per-number cooldown, hourly spend cap, do-not-call exclusion, idempotent dialling, kill switch. You can reuse existing campaign data models and rules; the only change is that **your** scheduler now dials every contact (you lose Ello's batch dialler, but you also gain full control of windows and retries).

### Step 7 — Prompts, config, observability
Keep prompts in version control; add a staging environment and a small regression set of scripted calls. Log: session start/stop, model id, tool calls and latencies, interruptions, errors, `GoAway`, token/time usage per call. Dashboard the first-response latency and session failure rate.

### Step 8 — Pilot, then scale
Start with internal staff, then one small campaign, with a human reviewing call transcripts daily. Check cost per minute against budget before increasing concurrency.

---

## 6. Pros and cons of going without Ello

| Pros | Cons |
|---|---|
| Full control over prompts, tools, data, logs and recordings | You own telephony, dialling, scaling, uptime and support |
| No platform fee or vendor lock-in on the voice layer; direct model pricing | Total cost = model + telephony + infra + engineering time; can exceed a platform at small scale |
| Choose your telephony and region; custom compliance flows | Regulatory and carrier work (registration, consent, recordings) lands on you |
| Run your own turn-taking, analytics and memory design | You must tune VAD, interruptions and echo yourself |
| Easier to swap models later behind your own interface | Gemini preview models change; you absorb breaking changes and deprecations |
| Data stays in systems you control (except audio sent to the model) | Session limits (15 min / ~10 min connection), tool-freeze and sync-only tools are now your problems |

**Rough effort** (one or two experienced engineers; treat as a planning guess, not a quote): in-app/web voice reusing an existing voice layer — about a week; add phone calls via Pipecat/LiveKit — 2–4 weeks; campaigns, compliance and hardening — another 2–4 weeks. Building the phone bridge from scratch takes longer and is where most teams stumble (audio transcoding, interruption flushing, call-state edge cases).

**Middle path worth considering:** keep Ello for **phone/campaign** (telephony and compliance are the heaviest parts) and move only the **in-app/web voice** to direct Gemini. That removes the per-session vendor dependency where it's easiest to replace, without taking on a dialler.

---

## 7. Checklist

- [ ] Model id chosen from Google's current models page; pricing and quotas checked
- [ ] Ephemeral-token broker (single-use, config-locked, rate-limited); no key in any client
- [ ] All tools declared at connect; tools are fast (sync-only on some models)
- [ ] Audio paths: 16 kHz in, **24 kHz** out; `interrupted` clears playback; echo cancellation on real devices
- [ ] Context window compression + session resumption + `GoAway` reconnect tested past 15 minutes
- [ ] Input/output transcription on; transcripts and recordings stored per your retention policy
- [ ] Memory pull/push and agent-reported outcomes in place; unknown outcome stays unknown
- [ ] Telephony provider, numbers, registrations and call-status callbacks working; reconcile sweep for stuck calls
- [ ] Calling hours, consent/disclosure, do-not-call, per-number cooldown, spend cap, kill switch enforced **in code**
- [ ] Sensitive data refused by voice; sensitive tool args redacted from logs
- [ ] Monitoring and alerts; fallback behaviour when Gemini is unavailable
- [ ] Pilot with human transcript review before scaling

---

## Sources

- Gemini Live API overview — <https://ai.google.dev/gemini-api/docs/live>
- Live API capabilities guide (VAD, interruptions, transcription) — <https://ai.google.dev/gemini-api/docs/live-guide>
- Live API session management (limits, GoAway, resumption, compression) — <https://ai.google.dev/gemini-api/docs/live-session>
- Live API tool use — <https://ai.google.dev/gemini-api/docs/live-tools>
- Ephemeral tokens — <https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens>
- Gemini models — <https://ai.google.dev/gemini-api/docs/models>
