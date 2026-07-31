# ello voice-command protocol — wire reference

This documents exactly how `@ello/agent-sdk` talks to the backend, at the
message level — so a client on **any platform** (mobile app, different web
stack, whatever SwiftLoan or another app is built in) can implement the same
protocol without depending on our TypeScript package. Every message shape and
sequence below is taken directly from the working SDK implementation and
confirmed against two real, working sessions: the ello-shop browser demo and
a live SwiftLoan webcall (`conv=6a633a3328fe7896438fb837`) whose backend log
showed the full flow succeeding end-to-end.

## Overview

Two calls, in order:

1. **HTTP POST** — mint a `conversation_id`.
2. **WebSocket** — stream audio, send your tool declarations, receive tool
   calls, send tool results.

```
Your app                          API gateway              ai-voice-agent (/ws-ello)
   |  POST /api/agents/publish        |                              |
   |──────────────────────────────────▶                              |
   |◀────────────────────────────────  conversation_id                |
   |                                                                   |
   |  WebSocket connect                                                |
   |───────────────────────────────────────────────────────────────────▶
   |  {"type": "voice-session-start", conversation_id, client_tools, page_context}
   |───────────────────────────────────────────────────────────────────▶
   |◀─────────────────────────────  {"type": "session-established"}   |
   |  {"type": "voice-audio-input", data: base64, sample_rate}         |
   |───────────────────────────────────────────────────────────────────▶ (repeat continuously)
   |◀────────────────────────────  {"type": "voice-audio-output", ...} |
   |◀────────────────────────────  {"type": "conversation-text", ...}  |
   |◀────────────────────────────  {"type": "client-tool-call", ...}   |
   |  {"type": "client-tool-result", tool_call_id, status, result}     |
   |───────────────────────────────────────────────────────────────────▶
```

## Step 1 — Mint a session

```
POST {apiBaseUrl}/api/agents/publish
Content-Type: application/json
x-api-key: ak_xxx

{
  "assistant_id": "6a5de4fdced754d6abd71e2b",
  "agent_type": "webcall",
  "source": "sdk"
}
```

Response:
```json
{
  "status": 200,
  "message": "Message published successfully",
  "data": { "conversation_id": "6a633a3328fe7896438fb837", "call_status": "success" }
}
```

Take `data.conversation_id` — every following WebSocket message is keyed to it.

**Auth header is `x-api-key`, not `Authorization: Bearer`.** Getting this
wrong is a common integration mistake — it returns a 401 that looks like a
bad key when the key is actually fine.

**`agent_type` must be `"webcall"`** for an SDK-driven session, not `"chat"`
or a telephony type — this is what makes the backend skip SIP/PSTN call
initiation entirely (`Skipping call initiation as agent_type is 'webcall'`
in the backend log) and go straight to a native audio session.

## Step 2 — Open the WebSocket

Connect to `{wsUrl}` (e.g. `wss://connect-dev.getello.ai/ws-ello`). No
handshake payload — just open the socket, then immediately send
`voice-session-start` (don't wait for any message from the server first).

## Step 3 — `voice-session-start`

Sent once, immediately after the socket opens:

```json
{
  "type": "voice-session-start",
  "conversation_id": "6a633a3328fe7896438fb837",
  "client_tools": [
    {
      "name": "fill_username",
      "description": "MUST CALL THIS IMMEDIATELY when user gives a username...",
      "parameters": { "type": "object", "properties": { "username": { "type": "string" } }, "required": ["username"] },
      "available": true,
      "requires_confirmation": false,
      "sensitive": false,
      "timeout_ms": 10000
    }
  ],
  "page_context": { "...": "see below" }
}
```

`client_tools[]` field reference:

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Unique, letters/digits/`_`/`-`, max 64 chars |
| `description` | yes | **Written for the model.** Be explicit/directive — "MUST CALL THIS IMMEDIATELY when..." |
| `parameters` | yes | JSON Schema (object type) for the tool's arguments |
| `available` | yes | Whether this tool can be called *right now* — recompute per current screen/page |
| `requires_confirmation` | no | Backend shows a confirm step before the model's call reaches you |
| `sensitive` | no | Redact args/results from logs |
| `timeout_ms` | no | Capped server-side at 30000 |

**Register every tool your app will ever need, up front, in this one
message.** Confirmed from a real backend log: `provider can't update tools
live — using context + gating` — Gemini Live (the model behind native mode)
cannot add or remove function declarations mid-session. Sending
`client-tools-update` later (see Step 7) only changes `available` flags via
an injected text reminder, not the model's actual callable-function set. If
a tool wasn't in the *original* `client_tools` array, the model can never
call it for the rest of that session, no matter what you send afterward.

### `page_context` — a proven richer shape

The ello-shop demo used a minimal `page_context`. A more recent real
production session (SwiftLoan) used a much richer structure and it worked
well — recommended as the pattern to follow:

```json
{
  "page": "permissions",
  "screen_title": "Permissions",
  "screen_overview": "SwiftLoan asks to allow notifications, SMS, camera and location for KYC.",
  "available_actions": ["allow permissions to continue"],
  "already_filled": {},
  "app_map": [
    { "screen": "language", "title": "Choose your language", "actions": ["select a language", "continue"] },
    { "screen": "intro", "title": "Welcome to SwiftLoan", "actions": ["get started / continue"] }
  ],
  "view_only": false,
  "next_step": { "screen": "aboutyou", "title": "About you", "blocked_reason": null },
  "language": "en",
  "loggedIn": true,
  "interactionGuide": {
    "goal": "Help the user operate the app by voice on the CURRENT screen.",
    "instruction": "The user is on the \"Permissions\" screen. Briefly tell them which screen they're on, then ask only for the details still missing. Call the matching tool for their request."
  }
}
```

Why this shape works well — carry it over to any new app:
- **`app_map`** gives the model a map of the *entire* app up front, so it can
  reason about navigation ("go to my profile") even for screens you're not
  currently on — it doesn't need a fresh tool call just to know what
  `profile` means.
- **`available_actions`** + **`next_step`** tell the model exactly what's
  actionable *right now*, separate from the general app map.
  `next_step.blocked_reason` lets you explain *why* something isn't
  available yet ("must verify OTP first") instead of the model guessing.
- **`already_filled`** avoids the model re-asking for data the user already
  gave.
- **`interactionGuide.instruction`** is regenerated per-screen with the
  *current* screen's specific instructions — keep `goal` stable and only
  rewrite `instruction`.

## Step 4 — `session-established`

Backend confirms the session is live:
```json
{ "type": "session-established" }
```
Start streaming audio only after this arrives (don't send audio while
waiting on it — some backends will ignore it anyway, but don't rely on
that).

## Step 5 — Audio streaming

**Outbound** (your mic → backend), sent continuously in small chunks:
```json
{ "type": "voice-audio-input", "data": "<base64 PCM16LE mono>", "sample_rate": 16000 }
```
- Format: PCM16, 16kHz, mono, base64-encoded, chunked at roughly 40ms per
  message (real sessions show a steady stream — dozens of these per second
  of speech).

**Inbound** (backend → your speakers):
```json
{ "type": "voice-audio-output", "audio": "<base64>", "format": "pcm" }
```
Play these back as they arrive.

**Barge-in** — if the user starts talking while the agent is still speaking:
```json
{ "type": "voice-audio-purge" }
```
Drop any queued/playing output immediately when you see this.

**Turn boundary** — model finished speaking for this turn:
```json
{ "type": "voice-audio-stream-end" }
```

## Step 6 — Transcripts

```json
{ "type": "conversation-text", "data": { "text": "...", "source": "agent", "is_interim": false } }
```
`source` is `"agent"` or `"user"`. `is_interim: true` means partial/live
text that may still change; `false` means final. Useful for debugging/UI
captions — not required for the core loop to function.

## Step 7 — Tool calls (the core of "voice controls the app")

Backend → you, when the model decides to act:
```json
{ "type": "client-tool-call", "tool_call_id": "fc_693736964984660289", "name": "apply_filters", "args": { "category": "smartphones" }, "timeout_ms": 10000 }
```

Your app must:
1. Look up the tool by `name`.
2. Check it's currently `available` (re-verify locally — don't trust the
   model to only call available tools; the gating in Step 3 is a soft
   context hint on some providers, not a hard constraint).
3. Validate `args` against the schema you declared.
4. Run your handler.
5. Reply on the same connection:
```json
{ "type": "client-tool-result", "tool_call_id": "fc_693736964984660289", "status": "ok", "result": { "applied": {...}, "resultCount": 3 } }
```
`status` is one of `ok`, `error`, `denied` (user declined a
confirmation-gated tool), `timeout`, `cancelled`.

If a call arrives for an unknown tool or one you've marked unavailable,
respond with `status: "error"` and a short `error.message` instead of
silently dropping it — the model needs the failure signal to recover
gracefully (e.g. try a different tool, or tell the user it can't do that
here).

**Cancellation** — backend may cancel an in-flight call (user barged in, or
it timed out server-side):
```json
{ "type": "client-tool-cancel", "tool_call_id": "...", "reason": "..." }
```
Abort the handler if you can; otherwise just stop waiting on its result.

## Step 8 — `client-tools-ack` (best-effort, don't block on it)

After `voice-session-start`, the backend *may* send:
```json
{ "type": "client-tools-ack", "accepted": ["fill_username", "apply_filters"], "rejected": [{"name": "bad_tool", "reason": "..."}] }
```
Treat this as a diagnostic signal, not a required handshake step — some
backend versions/paths don't send it at all, and the session still works
fine without it (confirmed: the working SwiftLoan session logged `17 client
tool(s) registered` and functioned correctly with no ack ever observed on
the client side in earlier testing). Don't gate `start()` completion on
receiving it.

## Step 9 — Updating context as the user navigates

On every screen/page change, resend:
```json
{ "type": "client-tools-update", "tools": [ /* same shape as client_tools, with fresh "available" flags */ ], "page_context": { /* fresh page_context for the new screen */ } }
```
Remember Step 3's caveat: this **cannot** add tools the model didn't know
about at session start. It updates availability gating and app-state
context only.

## Step 10 — Ending the session

```json
{ "type": "voice-session-end" }
```
Backend may also send this to you (e.g. `{"type": "voice-session-end", "reason": "..."}` or `"session-ended"`) if it ends the call from its side.

## Security rules to carry over into any client

- **Never let the user speak or hear back passwords, OTPs, CVV/PIN, or
  similar secrets.** Don't register a tool that fills these — focus the
  field and tell the user to type it themselves. This must be enforced in
  your tool handlers; the backend doesn't strip it for you.
- **Never expose a tool's `description` text to the end user.** It's
  written as an instruction *for the model* ("CALL THIS IMMEDIATELY
  when...") — if you show any Allow/Deny-style confirmation UI for
  `requires_confirmation` tools, write separate, human-readable text for
  that; don't reuse `description`.
- **One tool per user-facing action.** Don't build a single generic
  "do-anything" tool — specific, narrowly-scoped tools with tight schemas
  get called correctly far more reliably than a catch-all.

## Confirmed-working reference values

From the real sessions this document is grounded in:
- Auth header: `x-api-key: ak_...`
- `agent_type: "webcall"` for SDK/app-driven voice (not phone calls)
- Audio: PCM16, 16kHz, mono, base64, ~40ms chunks
- Model/provider observed working: `gemini_live` (backend `ai_studio`,
  model `gemini-3.1-flash-live-preview`) — "native mode" in the ello
  dashboard maps to this.
