# Ello Voice SDK — Integration Guide

**Audience:** engineers integrating a third-party application (web or mobile) with
Ello's native speech-to-speech voice assistant, so users can operate the app by
voice instead of touch.

**What you get:** a live, low-latency voice conversation with an AI agent that can
see what's on the user's screen and drive it — tap buttons, fill fields, navigate
screens — by calling functions ("tools") that your app implements and executes
locally.

---

## 1. How it works, in one picture

```
Your App                         Ello Backend
─────────                        ────────────
1. POST /api/agents/{id}/calls  ──────────────▶   creates a conversation,
                                                    returns conversation_id
2. open WebSocket
   /ws/native-audio/{conversation_id}  ─────────▶  accepted

3. send "voice-session-start"
   { client_tools: [...], page_context: {...} }  ▶  builds the AI session,
                                                      connects to the model

4. stream mic audio  ─────────────────────────────▶  "voice-audio-input" frames

                                 ◀─────────────────  "voice-audio-output" frames
5. play audio to speaker                              (the agent's voice)

                                 ◀─────────────────  "client-tool-call"
6. execute the action locally                          { name, args }
   (tap a button, fill a field, etc.)
   send the result back  ─────────────────────────▶  "client-tool-result"

7. on navigation, refresh what
   the agent knows about the
   screen  ──────────────────────────────────────▶  "client-tools-update"

8. hang up  ───────────────────────────────────────▶  "voice-session-end"
```

Everything after step 3 happens continuously and concurrently: audio streams in
both directions, tool calls can arrive at any time, and the conversation just
keeps going until either side ends it.

---

## 2. Prerequisites

You need, from the Ello team:
- an **API key** (`x-api-key` header)
- an **assistant ID** — a voice assistant configured in the Ello dashboard, with
  `native_mode: true` and a provider that supports native speech-to-speech
  (currently Gemini Live)
- the base HTTP URL of the API gateway (e.g. `https://api.getello.ai` or your
  staging host)
- the WebSocket URL for the native-audio bridge (see §3.1 — this is **not** the
  same host/path pattern as the REST call)

You provide, in your app:
- a way to record microphone audio and stream it as base64-encoded PCM16 chunks
- a way to play back base64-encoded PCM16 audio chunks through the speaker
- a registry of "tools" — functions the agent can call that actually do things
  in your app (tap a button, read a field, navigate a screen, etc.)
- a way to describe "what's on screen right now" as a small JSON object

None of this requires you to run any AI yourself — the model, the turn-taking,
and the conversation logic all live on the Ello side. Your app is purely the
hands, eyes, and microphone/speaker.

---

## 3. Step-by-step integration flow

### 3.1 Create a conversation

```http
POST {apiBaseUrl}/api/agents/{assistantId}/calls
Content-Type: application/json
x-api-key: {your API key}

{
  "assistant_id": "{assistantId}",
  "agent_type": "webcall",
  "call_type": "outbound",
  "name": "",
  "message": "optional greeting hint",
  "memory_id": "{a UUID you generate — identifies this user across calls}"
}
```

Response (shape varies slightly by deployment — check all of these):
```json
{ "success": true, "data": { "call_id": "6a663374ddd0988891b8b854" } }
```

Take whichever of `data.call_id`, `data.conversation_id`, `call_id`, `id` is
present — that's your `conversation_id` for the rest of the call.

### 3.2 Open the WebSocket

```
wss://{host}/ws-ello
```

> **This is the correct, documented client-facing endpoint.** There is a second,
> internal endpoint (`/ws/native-audio/{conversation_id}` directly on the
> assistant-service) that the Ello connector uses server-side to bridge to the
> voice model — it is **not meant for external clients** and currently has no
> authentication of its own. Always connect through `/ws-ello`; let the Ello
> backend handle the bridge to the model internally.

### 3.3 Send `voice-session-start`

The **first** message on the socket, and the only place your tool declarations
can ever be sent (see §5 — this is not optional, it's a hard protocol limit):

```json
{
  "type": "voice-session-start",
  "conversation_id": "6a663374ddd0988891b8b854",
  "client_tools": [ /* every tool for the ENTIRE session, see §5 */ ],
  "page_context": { /* the current screen, see §6 */ }
}
```

`codec`/`sample_rate` can also be included here if you're not using 16kHz PCM by
default (`{"codec": "pcm", "sample_rate": 16000}`); omit them and PCM16/16kHz is
assumed.

You'll get back:
```json
{ "type": "session-established", "data": { "session_id": "...", "message": "..." } }
```
(field names vary slightly by transport hop — treat this event as "the session
is live, you may now start streaming audio," nothing more.)

And shortly after:
```json
{ "type": "client-tools-ack", "data": { "accepted": [...], "rejected": [...] } }
```
Check `rejected` — see §5.4 for what a rejection means and why it happens.

### 3.4 Stream microphone audio

For every audio chunk captured from the mic (recommended: PCM16, 16kHz, mono,
~100-200ms per chunk):

```json
{ "type": "voice-audio-input", "data": "<base64 PCM16 bytes>", "sample_rate": 16000 }
```

Send these continuously for the whole call, even during silence — the model
does its own voice-activity detection server-side. Don't try to detect
silence/speech client-side and gate what you send; that's the model's job.

### 3.5 Play back agent audio

```json
{ "type": "voice-audio-output", "audio": "<base64 audio>", "format": "pcm" }
```

Play these to the speaker in the order received. Two other events manage
playback:
- `voice-audio-purge` — the user interrupted the agent (barge-in). **Drop
  everything queued for playback immediately.** The mic should stay live
  throughout the call (don't mute during agent speech) — echo cancellation is
  the platform's job, not yours, and muting breaks barge-in.
- `voice-audio-stream-end` — the agent finished its turn. Informational only;
  no action required.

### 3.6 Handle tool calls

```json
{
  "type": "client-tool-call",
  "tool_call_id": "fc_123",
  "name": "fill_field",
  "args": { "label": "Mobile Number", "value": "9876543210" },
  "timeout_ms": 10000,
  "requires_confirmation": false
}
```

Execute the corresponding local action, then reply:

```json
{
  "type": "client-tool-result",
  "tool_call_id": "fc_123",
  "status": "ok",
  "result": { "ok": true, "field": "Mobile Number" }
}
```

`status` is one of:
| status | when | `result`/`error` |
|---|---|---|
| `"ok"` | action succeeded | `result`: any JSON — becomes the tool's function-response payload to the model |
| `"denied"` | user declined a confirmation prompt | omit `result`/`error` |
| `"error"` | action failed | `error: { code, message }` — `message` should be phrasable back to the user by the model |

If a tool's declaration set `requires_confirmation: true` (you set this
yourself when registering the tool — see §5.3), show the user an Allow/Deny UI
**before** executing, and respond `"denied"` if they decline.

Respect `timeout_ms` — if you can't finish in time, the backend will move on
without you; a late result for a timed-out call is silently discarded, not an
error, so don't worry about racing it.

`client-tool-cancel` can arrive to tell you a pending call is moot (e.g. the
user barged in, or the page changed underneath it) — abort whatever you were
doing for that `tool_call_id` and don't bother sending a result.

### 3.7 Keep the agent's screen awareness fresh

Whenever the user navigates or the available actions on screen change, send:

```json
{
  "type": "client-tools-update",
  "tools": [ /* same shape as client_tools, see §5 */ ],
  "page_context": { /* updated screen description, see §6 */ }
}
```

**Read §5.2 before wiring this up** — there is a hard, easy-to-miss rule about
what you may and may not change here.

### 3.8 End the call

```json
{ "type": "voice-session-end" }
```

Then close the socket. You'll also receive `voice-session-end` from the server
side (with a `reason` field) if the agent hangs up, the call transfers, or the
backend force-ends it (credits exhausted, max duration, etc.) — treat that as
authoritative and tear your side down too.

---

## 4. Full inbound event reference

| `type` | When | What to do |
|---|---|---|
| `session-established` | after `voice-session-start` succeeds | mark the call as live |
| `voice-audio-output` | agent speech | play it |
| `voice-audio-purge` | barge-in | clear playback queue |
| `voice-audio-stream-end` | agent's turn done | informational |
| `conversation-text` | a transcript bubble (user or agent) | render in your UI if you show a transcript; `is_interim` tells you if it's final |
| `client-tool-call` | agent wants to run a tool | execute + respond |
| `client-tool-cancel` | a pending tool call is moot | abort it |
| `client-tools-ack` | response to your last `client-tools-update`/initial registration | inspect `rejected` |
| `voice-session-end` | call is over | tear down |
| `error-occurred` | something went wrong server-side | surface to the user / log |

---

## 5. Tool registration — read this whole section before writing any code

This is the single most common integration mistake, and it produces a **silent**
failure — no error, no crash, the tool just never gets called and you won't know
why unless you know this rule.

### 5.1 The hard limit: tools are frozen at connect

The underlying voice model (Gemini Live) **fixes its set of callable functions
the moment the session connects** and can never learn a new function name for
the rest of that call. This is a model-level constraint, not a bug in Ello's
backend — there is no workaround, no retry, no "just send it again."

**Rule: every tool your app will EVER need during the call — across every
screen the user might navigate to — must be included in the `client_tools`
array of the very first `voice-session-start` message.**

### 5.2 What `client-tools-update` can and cannot do

Given §5.1, `client-tools-update` is **not** for adding new tools mid-call. It
exists to:
- toggle `available: true/false` on tools **you already declared at connect**
  (e.g. "fill_field" is available on a form screen, not on a summary screen)
- refresh `page_context` as the user navigates

If you send a tool *name* in a `client-tools-update` that wasn't in your
original `client_tools` array, the backend will accept it into its bookkeeping
but the model will never be told it exists — so it can never be called. The
`client-tools-ack` you get back will honestly report this in `rejected` with
`reason: "provider_tools_frozen_at_connect"`. If you see that, it means your
integration is trying to register something new after connect — fix it by
declaring that tool up front instead.

### 5.3 How to design your tool set for this constraint

Two patterns work well:

**A. A small, stable set of general-purpose tools**, registered once, with
per-screen behavior driven entirely by `available` + `page_context`. This is
what we recommend, and what the reference implementation below uses: a generic
`perform_ui_action(action, target, value)` tool that resolves `target` against
whatever the current screen's addressable controls are, plus a handful of
"alias" tools (`fill_field`, `select_option`, `continue_next`, `navigate_screen`,
...) that just call the same executor with different framing, purely because a
model is more reliable calling a specifically-named tool than inferring the
right `action`/`target` combination itself. This scales to dozens of screens
with zero new tool declarations per screen.

**B. One tool per distinct action across the whole app**, registered once at
connect, gated by `available`/`availableWhen` per screen. This works too, but
if you have many screens with many distinct actions, you'll end up declaring a
large tool set up front — which is fine, there's no hard cap we've hit in
practice, just be mindful of unbounded growth.

What does **not** work: registering only the current screen's tools at connect
and adding more as the user navigates. That's exactly the pattern §5.1
forbids.

### 5.4 Registering a tool

```json
{
  "name": "fill_field",
  "description": "Type a value into a named text field on the current screen.",
  "parameters": {
    "type": "object",
    "properties": {
      "label": { "type": "string", "description": "the field's visible label" },
      "value": { "type": "string" }
    },
    "required": ["label", "value"]
  },
  "sensitive": false,
  "requires_confirmation": false,
  "timeout_ms": 10000,
  "available": true
}
```

- `name` — `^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$`. A short, fixed set of names is
  reserved by the platform and will be rejected if you try to use them:
  `disconnect_call`, `knowledge_base_retrieval_tool`, `mina_stay_silent`,
  `check_end_of_utterance`, and anything starting with `transfer_call_`.
- `description` — write this for the model, not for a human reader. Be
  explicit about when to call it and what the arguments mean.
- `parameters` — standard JSON Schema. Keep it simple: `type`, `properties`,
  `required`, `enum`, `description` are all safely supported; avoid
  `additionalProperties`, `$ref`, `$defs`, `patternProperties`, `const`,
  `default`, `examples`, `title` — some backend providers strip or reject these.
- `sensitive: true` — the tool's call arguments will be redacted in server
  logs. Set this on anything that could carry PII, even indirectly.
- `requires_confirmation: true` — the backend will tell your app to show an
  Allow/Deny UI before you may execute; see §3.6.
- `timeout_ms` — how long the backend will wait for your `client-tool-result`
  before giving up (clamped to a max of 30000ms server-side).
- `available` — whether this tool is usable **right now**, given the current
  screen. Re-evaluate this every time you send `client-tools-update`.

---

## 6. `page_context` — telling the agent what screen the user is on

```json
{
  "page": "loans",
  "screen_overview": "My Loans · Track your applications · Apply for a new loan",
  "interactionGuide": {
    "goal": "Help the user do what this screen is for, by calling tools rather than describing steps.",
    "opening": "As soon as the call connects, speak first without waiting for the user. In one short sentence, say which screen they are on and name one or two things they can do here. Then stop and listen."
  },
  "available_actions": [
    { "kind": "button", "label": "Apply for a new loan" },
    { "kind": "slider", "label": "Loan amount", "value": 300000 },
    { "kind": "scroll", "label": "page" }
  ]
}
```

- `page` / `screen_overview` — free text, gives the model situational
  awareness. Keep `screen_overview` short (a handful of key strings joined
  together is enough — don't dump your whole DOM/view tree).
- `interactionGuide.opening` — **this is what makes the agent speak first.**
  If you want the agent to greet the user proactively on connect (rather than
  waiting for them to speak), this field must be non-empty. It's injected
  verbatim into the model's instructions as "Page-specific behavior: …" — write
  it as a direct instruction to the model, not as user-facing copy.
- `available_actions` — a lightweight description of what's tappable/settable
  right now. This does **not** need to be exhaustive or map 1:1 to your tool
  schemas — it's context, not a second protocol.

Send an updated `page_context` (via `client-tools-update`, §3.7) every time the
user navigates or the set of available actions changes meaningfully. Don't send
it on every keystroke — debounce to "the control set actually changed," not
"something re-rendered."

**Timing tip:** if your app fires this from more than one place per navigation
(e.g. a screen-change effect and a separate control-discovery effect), coalesce
them into a single message before sending. Two near-identical
`client-tools-update` messages back to back for one navigation event cost real,
measurable latency (the backend must process each as its own turn) — batch them
into one.

---

## 7. Security — never let voice touch credentials

Do **not** build tools that let the model fill in, or even see the value of,
passwords, OTPs, PINs, CVVs, or other credentials. This isn't just a policy
recommendation — treat it as a hard requirement, for a concrete reason: any
value spoken by the user gets transcribed and can end up in call
transcripts/memory. A spoken password is a leaked password.

Practical guidance, proven by the reference implementation:
- Detect sensitive fields (by input type, `autocomplete`/`textContentType`
  hints, or label pattern-matching — do **not** rely on label matching alone,
  since e.g. "Full name (as per PAN)" is not itself a PAN number) and refuse to
  register a fill-tool for them, or have the handler explicitly refuse with a
  clear reason (`{ ok: false, refused: true, reason: "sensitive_field" }`).
- Tell the user, via your system prompt / tool descriptions, to type sensitive
  values themselves — the agent should only be able to tap the final
  "Verify"/"Continue" button once the value is entered.
- Mark any tool that legitimately touches PII-adjacent data as
  `sensitive: true` so server-side logs redact its arguments.

---

## 8. Minimal working example

This mirrors a real, shipping integration (React Native, but the pattern is
framework-agnostic):

```ts
// 1. One-time setup, before the user ever taps the mic.
const agent = new ElloAgent(
  { apiKey, assistantId, apiBaseUrl, wsUrl },
  micCapture,   // your MicCapture implementation
  pcmPlayer,    // your PcmPlayer implementation
  confirmFn,    // your Allow/Deny UI implementation
);

agent.registerTool({
  name: 'read_screen',
  description: 'Read the current screen: visible text and every actionable control.',
  schema: { type: 'object', properties: {} },
  handler: () => ({ ok: true, screen: getCurrentScreen(), controls: listControls() }),
});

agent.registerTool({
  name: 'fill_field',
  description: "Type a value into a named text field on the current screen.",
  schema: {
    type: 'object',
    properties: { label: { type: 'string' }, value: { type: 'string' } },
    required: ['label', 'value'],
  },
  handler: ({ label, value }) => {
    const field = findFieldByLabel(label);
    if (!field) return { ok: false, reason: 'not_found' };
    if (isSensitiveField(label, field.props)) return { ok: false, refused: true, reason: 'sensitive_field' };
    field.setValue(value);
    return { ok: true, field: label };
  },
});

agent.registerPageContext(() => buildPageContext(getCurrentScreen()));

// 2. On navigation (your router/state layer):
function onScreenChange(newScreen) {
  setCurrentScreen(newScreen);
  agent.updatePageContext(); // sends client-tools-update with fresh available/page_context
}

// 3. User taps the mic:
await agent.start();  // POST /calls -> open WS -> voice-session-start -> mic streaming begins

// 4. User taps to hang up:
await agent.stop();   // voice-session-end -> close WS -> release mic
```

---

## 9. Troubleshooting checklist

| Symptom | Likely cause | Fix |
|---|---|---|
| Agent never speaks first | `page_context.interactionGuide.opening` is empty/missing | Set it (§6) |
| A tool is acked as accepted but never gets called | It was declared after `voice-session-start`, not in it | Move its declaration into the initial `client_tools` array (§5.1) |
| Navigation feels sluggish (agent pauses noticeably after a page-changing tool call) | Multiple `client-tools-update` messages firing for one navigation | Coalesce to one send per navigation (§6, last paragraph) |
| Tool call never arrives even though the model said it would do something | Check `client-tools-ack`'s `rejected` list — the name may be malformed, reserved, or a duplicate | Fix the name / dedupe |
| Agent asks for a password/OTP out loud | A fill-tool without a sensitivity guard | Add the `isSensitiveField` check (§7) |
