# Ello Integration Guide — Voice Agents and Outbound Campaigns

**From:** the Ello integration team
**For:** engineering teams adding an Ello voice agent to their own mobile app, website, internal tool or outbound-calling flow

This guide walks you through the whole integration — the architecture, the steps in order, the contracts you need to build, the safety rules, and an honest list of **pros and cons** that came out of the first production integration we supported. It is written so you can follow it top to bottom.

> **How to read the labels.** Behaviour documented in Ello's API reference at <https://docs.getello.ai> is stated plainly. Behaviour we established by testing against live environments is marked **(observed)** — it has been reliable, but confirm it against the current docs before you depend on it. Never put API keys, webhook secrets or agent IDs in this document or in source control.

---

## Contents

1. [What you can build](#1-what-you-can-build)
2. [Architecture and who owns what](#2-architecture-and-who-owns-what)
3. [The integration flow at a glance](#3-the-integration-flow-at-a-glance)
4. [Phase 0 — Prerequisites on the Ello side](#4-phase-0--prerequisites-on-the-ello-side)
5. [Phase 1 — Build the server side first](#5-phase-1--build-the-server-side-first)
6. [Phase 2 — Add a live voice agent to your app or site](#6-phase-2--add-a-live-voice-agent-to-your-app-or-site)
7. [Phase 3 — Give the agent shared memory](#7-phase-3--give-the-agent-shared-memory)
8. [Phase 4 — Outbound phone calls](#8-phase-4--outbound-phone-calls)
9. [Phase 5 — Bulk campaigns](#9-phase-5--bulk-campaigns)
10. [Phase 6 — Prompts, variables and agent management](#10-phase-6--prompts-variables-and-agent-management)
11. [Phase 7 — Safety and compliance](#11-phase-7--safety-and-compliance)
12. [Phase 8 — Test, then go live](#12-phase-8--test-then-go-live)
13. [Voice protocol reference](#13-voice-protocol-reference)
14. [Pros and cons — what we learned building it](#14-pros-and-cons--what-we-learned-building-it)
15. [Troubleshooting](#15-troubleshooting)
16. [Integration checklist](#16-integration-checklist)
17. [Glossary](#17-glossary)

---

## 1. What you can build

Ello gives you a hosted speech-to-speech **assistant** (agent) with a system prompt, tools and a voice. There are two ways to put it in front of people, and most products use both.

| Mode | What happens | Typical use |
|---|---|---|
| **Live voice in your product** | The user taps a mic button. Their device opens a WebSocket to Ello and streams audio. The agent can also *act on your UI* by calling **client tools** that your code registered. | In-app copilot, website guide, internal-tool navigator |
| **Outbound phone calls** | Your server asks Ello to dial a number. Ello places a real phone call, then reports status, transcript, recording and (if the agent reports it) an outcome to **webhooks** on your server. | Lead callbacks, drop-off follow-ups, reminders, bulk campaigns |

A third capability ties them together: **shared conversation memory** keyed on the customer's phone number. Before it speaks, any of your agents can ask your backend "what do we already know about this person?", and when it finishes it can save a summary. That is what makes your website agent, app agent and phone agent feel like one company.

---

## 2. Architecture and who owns what

```
                   ┌──────────────────────── Ello ────────────────────────┐
                   │  assistants (prompt + tools)  speech model  telephony │
                   │  batch campaign dialler       webhooks                │
                   └───▲──────────▲───────────────▲──────────────▲─────────┘
        REST mint +    │          │ WebSocket     │ REST dial /  │ webhooks (call.*, campaign.*)
        WebSocket      │          │ (brokered)    │ campaign     │ + agent tool calls
   ┌───────────────┐   │   ┌──────┴────────┐      │              │
   │ Mobile app    │───┘   │ Website / web │      │              │
   └──────┬────────┘       └──────┬────────┘      │              │
          │ your API              │ POST /voice/session           │
          ▼                       ▼               │              │
   ┌──────────────────────────────────────────────┴──────────────┴────────┐
   │ YOUR BACKEND                                                         │
   │  • session broker (holds the Ello key)      • webhook receiver       │
   │  • memory API (pull + push)                 • dial + campaign logic  │
   │  • call records, outcomes, safety guards    • admin tooling          │
   └──────────────────────────────────────────────────────────────────────┘
```

| Ello provides | You build |
|---|---|
| Assistants, prompts, voice and the speech model | A **session broker** so browsers never hold your key |
| The WebSocket voice session and tool-call protocol | The client: mic capture, playback, tool handlers, page context |
| Telephony and the batch campaign dialler | The **webhook receiver**, call records and outcome logic |
| Webhook delivery and (optionally) agent-side tool calls to your API | The **memory API** the agent's tools call |
| | Calling-hours, cooldown, do-not-call and spend guards |

**Rule of thumb:** Ello owns the conversation; you own identity, data, consent and compliance.

---

## 3. The integration flow at a glance

Follow the phases in order. Each one is useful on its own, so you can ship incrementally.

| Phase | Outcome | Needed for |
|---|---|---|
| 0. Ello prerequisites | workspace, key, assistants in the right mode | everything |
| 1. Server side first | broker, config store, role→agent mapping | any browser/app voice, any call |
| 2. Live voice client | a mic button that talks and can act on the screen | in-product voice |
| 3. Shared memory | agents greet returning customers correctly | personalised voice |
| 4. Outbound calls | server-triggered phone calls + webhooks | callbacks, follow-ups |
| 5. Bulk campaigns | list upload → dialling → tracking | outreach at scale |
| 6. Prompts & variables | repeatable agent configuration | everything |
| 7. Safety & compliance | guards enforced in code | before any real call |
| 8. Test & go live | live-call verification | launch |

**Minimum viable voice agent** (talks and taps, nothing else): create a Native Mode assistant → add a server route that mints a session → open the WebSocket and send your **complete** tool list → stream 16 kHz mono audio both ways → answer tool calls → send a page context with a non-empty `page` so the agent speaks first. Everything after that is what makes it dependable.

---

## 4. Phase 0 — Prerequisites on the Ello side

1. **Workspace and API key** (format `ak_…`). Authenticate with the header **`x-api-key`**. A `Authorization: Bearer` header returns a 401 that looks like a bad key when the key is fine; the Bearer token you see in the dashboard's own traffic is a short-lived login token, not a credential to embed.
2. **One assistant per purpose.** One assistant has one prompt. Create separate assistants for, say, your in-app copilot, your website guide, your internal navigator, and your phone agent. If several purposes share one assistant, whichever prompt you pushed last wins.
3. **Native Mode (Gemini Live) for any assistant that calls client tools.** Without it the assistant will talk but never call a tool. The symptom is that no `client-tools-ack` arrives after `voice-session-start` — log a warning if none shows up within five seconds so the cause is obvious.
4. **Telephony for phone agents.** Outbound calls need a phone-type assistant and telephony (SIP trunk / number) configured on the workspace. Optional dial fields: `workspace_id`, `siptrunk_id`, `greeting_description`, `message` (opening line).
5. **Pick one environment's hosts and use them for both halves.** Ello runs separate hosts per environment (a REST host and a WebSocket host). The conversation id minted by one is only valid on the matching other. **(observed)** If the REST call succeeds but the socket closes immediately with **code 1006**, the WebSocket host is wrong or doesn't resolve — it looks exactly like a client bug.
6. **Plan to create tools in the Ello console.** Tools that call your backend (history lookup, save conversation, report outcome) are configured per assistant in the console; **(observed)** there is no API to create them.

---

## 5. Phase 1 — Build the server side first

Do this before any client work. It is the part that keeps your key safe and gives you somewhere to land webhooks.

### Step 1.1 — Store provider configuration, not hard-coded values

Keep Ello settings in your database (or secret manager) so an operator can change them without a deploy:

| Setting | Notes |
|---|---|
| `enabled` | master switch; return a clear error when off |
| `apiKey` | secret; never returned by any read API |
| `baseUrl` | Ello REST host |
| `wsUrl` | Ello WebSocket host (returned to clients by the broker) |
| `defaultAssistantId` | last-resort fallback only |
| `agents.<role>` | assistant id per role |
| `webhookUrl` | **public `https`** URL of your call webhook — no default |
| `campaignWebhookEvents` | `call.started`, `call.completed`, `call.processed`, `call.recording`, `campaign.started`, `campaign.ended` |
| dial options | `agentType` (phone), `callType` (outbound), `source`, optional `workspace_id`, `siptrunk_id`, `message` |

Make `webhookUrl` mandatory and refuse to dial without it. A localhost default is a trap: it silently becomes every environment's webhook, every call sits at "dialing", and nothing tells you why. Reject `http://` too — **(observed)** an `http` URL that your host redirects to `https` drops the POST body on most senders.

### Step 1.2 — Map roles to assistants

Define the roles your product needs (for example `appCompanion`, `siteGuide`, `adminNavigator`, `leadCallback`, `campaign`) and resolve an assistant id per role, first hit wins:

1. a value set from your admin screen →
2. an environment variable per role →
3. the workspace default.

Reject placeholder values (`todo`, `changeme`, `<id>`) so a half-filled config fails loudly. Surface in your admin screen which roles are on a **dedicated** assistant and which are silently on the **shared default** — the fallback is convenient but means a role can be running the wrong prompt without anyone noticing.

### Step 1.3 — Build the session broker

Browsers cannot call Ello directly, and shouldn't:

- **They can't:** Ello's REST host returns no `Access-Control-Allow-Origin` and doesn't allow the `X-API-Key` header cross-origin **(observed)**, so the preflight fails and you get an opaque "Failed to fetch".
- **They shouldn't:** anything in a client bundle (including `NEXT_PUBLIC_*` style variables) is readable by every visitor and can be used to run up call charges or reconfigure your agents.

So expose one endpoint:

```http
POST /voice/session
{ "role": "siteGuide" }
```
```json
{ "data": { "conversationId": "…", "wsUrl": "wss://…/ws-ello", "role": "siteGuide" } }
```

Rules for the broker:

- The client sends a **role**, never an assistant id or a key. Accepting an arbitrary id lets any caller aim your key at any agent in your workspace.
- **Whitelist the roles** it will start and **exclude every role that places phone calls.** The endpoint is public, so it must not be able to ring anyone.
- **Rate-limit it** (it is a spend surface).
- Call Ello to mint the session (below), with your key, server-side, with a timeout.
- Report upstream failures as `502` with the provider's reason, so the client knows nothing is wrong on its side. Unwrap the error body recursively — **(observed)** Ello returns `message` as a string on a 401 but as an **object** on a 402 (for example "No active subscription"), and stringifying it produces `[object Object]`.
- Return the `wsUrl` from your config so clients need no Ello settings at all.

**Minting a session.** Two variants work **(observed)**:

| Variant | Request | Id in the response |
|---|---|---|
| Publish | `POST {base}/api/agents/publish` with `{ "assistant_id", "agent_type": "webcall", "source": "sdk" }` | `data.conversation_id` |
| Calls | `POST {base}/api/agents/{assistantId}/calls` with `{ "assistant_id", "agent_type": "webcall", "call_type": "outbound", "name": "", "message": "…", "memory_id": "<uuid>", "context_data": { … } }` | `data.call_id` |

`agent_type` must be `"webcall"` for app/browser sessions — that is what makes Ello skip phone dialling and go straight to a native audio session. The "calls" variant lets you pass `context_data` (for example the signed-in user's phone number), which a pre-call tool needs in order to look the user up. **(observed)** Without it, the stored call record shows `context_data: null` and the tool has nothing to resolve. Omit the field entirely when the user is signed out rather than sending an empty string.

### Step 1.4 — Build the webhook receiver

Create one public endpoint for call and campaign events. Follow these rules from day one:

1. **Authenticate with a shared secret** in a header, and **fail closed in production** if the secret isn't configured. This endpoint moves customers through your funnel: a forged `call.completed` can mark someone contacted, a forged do-not-call can silence a real customer.
2. **Never answer 4xx for a body you can't match.** Ello will retry forever. Return `200 { "matched": false }` and log it.
3. **Persist the raw payload** of every event. When the provider's shape changes, you'll want the original.
4. **Be idempotent.** Ello sends several events per call; every update should be a set, not an increment, and "first terminal event only" side effects (timeline entries, counters) must be guarded.
5. **Merge, don't overwrite.** Each event carries a different subset of fields.
6. Match a call by Ello's `conversation_id` first, then by your own id echoed back in `context_data`, then (for campaign calls you didn't place yourself) by `campaign_id` + `to_number`. Events can arrive out of order, so reuse an unclaimed row rather than creating a second one.

### Step 1.5 — Add a reconcile sweep

Webhooks get lost. Run a periodic job that closes calls stuck in `queued`/`dialing`/`in_progress` for longer than any real call (we used 30 minutes) as **failed with no outcome**. Ello has no per-conversation status endpoint available to a standard key **(observed)**, so you can tell that a call is stuck but not what happened. Do not guess an outcome — a wrong outcome drives wrong follow-up.

---

## 6. Phase 2 — Add a live voice agent to your app or site

### Step 2.1 — Pick your client pattern

| Platform | Mic / playback | Session | Notes |
|---|---|---|---|
| Web | `getUserMedia` + Web Audio | via your broker | enable echo cancellation, noise suppression, auto-gain |
| React Native | a small native audio module per OS | via your broker (recommended) or direct with an embedded key | native echo cancellation is the hard part |
| Other native | platform audio engine | via your broker | same protocol |

There is no requirement to use an Ello package: the protocol in [§13](#13-voice-protocol-reference) is small enough to implement directly. If an official SDK for your platform exists, prefer it.

### Step 2.2 — Make the client opt-in and safe to ship

- Read credentials/config into one boolean (`configured`). If it's false, **don't render the mic button** and change nothing else. That lets you merge the feature into an existing app with zero risk to people who haven't enabled it.
- **Request microphone permission lazily**, only when the user taps to start a call, never at launch.
- **On the web, call `getUserMedia` first after the click.** Browsers decide whether to show the permission prompt from the user-activation, and stricter engines let it expire across an intervening `await`.

### Step 2.3 — Implement the session lifecycle

1. Check connectivity first (fail fast and explain, rather than a hung button).
2. Take a **start token** (an incrementing counter). Re-check it after every `await` (REST mint, socket open, mic start); `stop()` bumps it. Without this, a user who taps start then immediately cancels leaves a stale `start()` that brings the session up after they hung up.
3. Mint the session (via your broker), with a timeout.
4. Open the WebSocket. **Guard every handler with "is this still the current socket?"** A closing socket can still deliver frames after a newer start replaced it — we saw two calls' audio interleave and a stale `session-ended` tear down the live session.
5. Send `voice-session-start` with the **complete tool list** and the start page context.
6. Start the microphone and stream audio. Move to *listening*.
7. On `session-ended` (the server can end a call), tear down **and close the socket yourself**. Dropping your reference leaves Ello's side open until the provider times it out, and usage/recording data may not attach to the call.

Status values worth modelling: `idle`, `connecting`, `listening`, `speaking`, `executingTool`, `ended`. Treat `connecting` as *active* so a second tap cancels the dial instead of being ignored. Add a short fallback (about 1.2 s) that returns `speaking → listening` if audio stops without a stream-end message.

### Step 2.4 — Declare **every** tool up front

> **The most common silent failure:** the model's callable-function set is fixed when the session connects. A tool that isn't in the first `voice-session-start` can never be called for the rest of that session. `client-tools-update` can toggle availability and refresh context; it cannot add tools. Ello's ack will list a late tool under `rejected` with reason `provider_tools_frozen_at_connect`.

Design for it with one of two patterns:

- **A. A small stable set of general tools** plus named aliases (recommended for apps with many screens). One generic executor — `perform_ui_action(action, target, value)` — resolves `target` against the controls on the current screen; aliases like `fill_field`, `select_option`, `continue_next`, `go_back`, `navigate` call the same executor. Models call a specifically-named tool far more reliably than they infer the right `action` + `target` pair, and one execution path is easy to debug.
- **B. One tool per distinct action**, gated per screen with `available`. Fine for a small surface.

What does *not* work: registering only the current screen's tools and adding more as the user navigates.

Tool-definition rules:

- `name` matches `^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$`. **Reserved:** `disconnect_call`, `knowledge_base_retrieval_tool`, `mina_stay_silent`, `check_end_of_utterance`, and anything starting with `transfer_call_`.
- `description` is written **for the model** ("CALL THIS IMMEDIATELY when…"). Never show it to end users — write separate human text for confirmation dialogs.
- `parameters` is JSON Schema; stay with `type`, `properties`, `required`, `enum`, `description`. Avoid `additionalProperties`, `$ref`, `$defs`, `patternProperties`, `const`, `default`, `examples`, `title` — some providers strip or reject them.
- `timeout_ms` is clamped to 30 000 ms. `sensitive: true` redacts arguments in Ello's logs. `requires_confirmation: true` makes Ello ask your client to confirm before the call reaches you.

### Step 2.5 — Execute tool calls carefully

For each `client-tool-call`:

1. Look up the tool; unknown ⇒ reply with an error (never drop it silently — the model needs the failure signal to recover).
2. Re-check availability locally. The `available` flag Ello holds can be stale.
3. Validate required keys and primitive types.
4. If confirmation is required, show a native Allow/Deny prompt with a time limit. **Timeout, dismissal or "no prompt mounted" must all mean *deny*** (fail closed).
5. Run the handler with a timeout and an abort signal wired to `client-tool-cancel`.
6. Reply with `client-tool-result` (`ok` | `error` | `denied` | `timeout` | `cancelled`).

**Run handlers one at a time, in arrival order.** The model often fires two tools in the same millisecond (select an option, then press continue). Run in parallel, the second inspects the screen before the first's state update renders and wrongly concludes the button is disabled. Start each handler's timeout when it starts, not while it waits in the queue.

### Step 2.6 — Report the *actual* state after every action

Don't return a bare `{ ok: true }`. Wait for the UI to re-render, then return what is really true now: the screen you landed on, whether you navigated, any message the UI showed the user (usually *why* something failed), and the controls now available with their state ("Submit (disabled)", "Terms (checked)"). Without this, the model assumes that a tap which only *selected* an option also moved to the next screen, and tells the user something false.

Two more habits that paid off:
- Show **disabled controls with a reason** instead of hiding them. A refused action then returns "not enabled yet — tick the terms box" and what *is* actionable, rather than "not found".
- Resolve controls by **visible label**, scoped to the **current screen only** (labels like "Continue" and "Back" repeat everywhere), trying exact → case-insensitive → prefix → substring (with a minimum length so short labels can't swallow unrelated queries). Never treat an unlabelled control as a candidate: an empty string matches every query.

### Step 2.7 — Send `page_context`

`page_context` is free-form JSON the model reads each turn. Two things matter most:

- A **non-empty top-level `page` string** puts Ello's backend on its prompt-driven greeting path. Without it nothing triggers "speak first" and the agent stays silent for the whole call.
- `interactionGuide.opening`, if present, is injected into the model's instructions and tells it to speak first. If you use it, **strip it from every later update** — otherwise the agent re-greets on every screen change.

Useful fields: `page`, a short `screen_overview` (a handful of strings, not your whole view tree), `available_actions`, `already_filled` (so it doesn't re-ask), `app_map` (all screens up front so it can reason about navigation), `next_step.blocked_reason`, `language`, `loggedIn`.

**Throttle updates — each rule below comes from a real failure:**

| Rule | Why |
|---|---|
| Debounce routine updates (~900 ms) | A data screen renders skeleton → partial → full; only the settled state should be sent |
| Don't send while the agent is speaking; flush when it returns to *listening* | **(observed)** an update during speech is treated as a barge-in — it cut the agent off mid-sentence and made it restart |
| Send an update from inside a tool's own result path, immediately | Ello then merges it with the pending tool call into **one** spoken turn; a delayed standalone update produces a second, separate turn |
| Reserve "urgent" (skip the speaking guard) for genuinely time-sensitive news, and coalesce bursts (~120 ms) | Two urgent updates in one tick should become one interruption carrying current truth |
| Skip an update if nothing changed for the same page | Sort lists before fingerprinting — render order is not stable. Ignore volatile fields such as "seconds ago" |
| Send the tools array only on the first update | Later copies change nothing and cost latency |
| Don't send a second standalone update on the same page right after the greeting | **(observed)** it made the model run the screen's opening script again |

Decide deliberately whether the **first turn** is generic. We chose a generic greeting (page name only, no screen details or user data), delivered user-specific data through a pre-call tool instead, and let the agent call a "read screen" tool when it needs specifics. A pre-call tool result is guaranteed to resolve before the agent speaks; a pushed context races the WebSocket handshake.

### Step 2.8 — Audio

| Direction | Format |
|---|---|
| Mic → Ello | PCM16 little-endian, **16 kHz**, mono, base64, ~40 ms per message, in the field named **`data`** |
| Ello → speaker | PCM16, 16 kHz, mono, base64 in `voice-audio-output` (some paths also deliver raw binary frames) |

- **Keep the mic live while the agent speaks** and cancel echo in the platform audio stack. Muting during agent speech kills barge-in: your interruption never reaches Ello's voice-activity detection, so `voice-audio-purge` never fires.
- On `voice-audio-purge`, **drop all queued and playing audio immediately.**
- Start streaming only after `session-established` (or immediately after sending `voice-session-start`, as some mobile clients do) — but never block `start()` on the optional `client-tools-ack`.

**Platform notes**

- *Web:* `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`, downsample to 16 kHz if the context runs at another rate, resample playback to the context rate, and route output through an analyser if you want an avatar's mouth to follow the real audio.
- *iOS:* a plain `.voiceChat` session mode only tunes routing and ducking — it does **not** cancel echo for a custom audio-engine graph. Enable the engine input node's **voice processing**. Create the converter and input tap once and keep them for the module's lifetime (recreating them per call freed a converter the render thread still used and crashed on rapid start/stop). Guard against a 0 Hz input format on simulators. Re-arm the audio session on route changes (e.g. Bluetooth connecting mid-call) instead of reconfiguring on every chunk.
- *Android:* attach the platform echo canceller, noise suppressor and AGC, and put capture **and** playback in communication mode — hardware echo cancellation only engages when both sides are. Prefer a Bluetooth headset, else the speakerphone. Request the Bluetooth-connect permission with the mic prompt; make declining it non-fatal. If a device has no hardware AGC, a software gain stage standing in for it is fine, but don't add a client-side noise gate — silencing audio is a turn-detection workaround that clips speech onsets.
- **Test on real devices.** Echo cancellation and permission behaviour differ from emulators in ways that decide whether this works. If a particular device refuses to cancel echo in the native path, a true WebRTC transport is the alternative, but confirm tool calling works over it with a live test before relying on it.

### Step 2.9 — Guardrails belong in code, not only in the prompt

| Guard | Behaviour |
|---|---|
| **Sensitive fields** | Maintain a denylist (passwords, card PINs, CVV, card numbers, government ID numbers). Honour platform signals (secure text entry, password content types) first. Refuse with a clear reason so the model can tell the user to type it themselves, and report only *filled / empty*, never the text. Beware false positives: "Full name (as per ID)" is a name field, and a postal "pin code" is not a PIN |
| **Secrets in the voice path** | Anything the user speaks is transcribed and can land in transcripts or memory. Default to refusing one-time codes too; if you allow voice entry for convenience, treat it as an explicit, reviewed product decision |
| **Skipping steps** | Make any "skip" action require a tap confirmation, so the agent can never skip on its own initiative |
| **Onboarding** | Don't let the agent navigate away from a first-run flow by itself |
| **Review before submit** | On screens that collect personal details, make the first "continue" return an instruction to read every value back and wait for explicit confirmation |
| **Auto-advance races** | If filling a field auto-submits and navigates, a follow-up "continue" a moment later can press the *next* screen's button. Remember where the last fill happened and refuse a continue that arrives right after the screen has changed |
| **Destructive actions** | `requires_confirmation`, fail closed |
| **Logging** | Make verbose voice logging dev-only — it carries transcripts |

### Step 2.10 — UI details that mattered

- Make hang-up a **dedicated button**; tapping the main button during a call only expands the controls. A stray tap shouldn't drop a call.
- Keep the screen awake for the whole call — locking the screen kills the mic and socket on most phones.
- Provide mute. Reset mute and panel state when a call ends.
- Show a clear *connecting → listening → speaking* state; a visual response to the agent's real output level feels more alive than a fixed animation.
- Offer proactive help tips if a user lingers (we used a short delay, rotating tips, a dismiss control, and a long snooze after dismissal). Track a single event per screen visit if you want your backend to react to stalls.
- Keep **two language settings** if you support several: the language of the screen text, and the language the agent should *speak*. Merging them made the agent's spoken language unreliable.

---

## 7. Phase 3 — Give the agent shared memory

### Step 3.1 — Pull before speaking, push when finished

| When | Call | Why |
|---|---|---|
| Before the agent speaks | `POST /memory/context { phone, limit }` | so a returning customer isn't greeted as a stranger |
| When it finishes | `POST /memory/conversations { … }` | so the next agent on any channel knows what was discussed |

Skip the pull and returning customers meet a stranger. Skip the push and the conversation is gone the moment the socket closes — Ello holds it, not your backend, and in-product sessions have no webhook.

### Step 3.2 — Contract to implement

**Key conversations on the phone number**, normalised to one canonical form (accept `+CC …`, leading zeros, spaces; store one format). Use it as the cross-channel join key.

`POST /memory/context` →

```json
{ "known": true, "brief": "One ready-to-read paragraph covering every channel…",
  "conversationCount": 3, "channels": ["app","phone","web"],
  "conversations": [ { "channel": "app", "summary": "…", "outcome": null, "outcomeConfirmed": false } ] }
```

- **An unknown number is `200 { "known": false }`, never a 404.** A first-time caller is normal.
- Compose the `brief` **server-side** so every agent describes history identically.
- Mirror the headline fields (`brief`, `known`) at the **top level** of the response as well. **(observed)** it is not documented whether Ello's response mapper walks into nested objects; duplicating two short fields costs nothing and makes the mapping work either way.
- Only mark `known: true` when a real conversation happened. Don't synthesise a "brief" from a form submission alone.

`POST /memory/conversations`:

| Field | Notes |
|---|---|
| `phone` | required; normalised |
| `channel` | required; a fixed list (for example `phone_outbound`, `phone_inbound`, `website_widget`, `mobile_app`, `admin`, `whatsapp`) — reject anything else |
| `summary` | 1–3 sentences; **this is what the next agent reads** |
| `provider_conversation_id` | Ello's id — makes the call **idempotent**: posting at start *and* end updates one record |
| `agent_role` | which agent held it |
| `outcome` | optional; **omit if unsure**; anything posted here is recorded as agent-confirmed |
| `duration_sec`, `started_at`, `ended_at`, `transcript`, `details`, `recording_url` | optional |

If the agent posts `do_not_call`, act on it **here too**, not just in the outcome-report endpoint — otherwise an agent configured with only this tool can log a refusal while your auto-dialler rings the person again.

### Step 3.3 — Authenticate agent-side calls

Ello's servers call these endpoints as a machine with no user session. Use a shared secret in `x-api-key` (also accept `x-webhook-secret` so one value works everywhere). Better: mint **named, per-agent keys**, store only a hash, show the plaintext once, and support revocation without a redeploy. Never leave these endpoints open — not even in development — they return a person's history for any number supplied.

**Do not give a mobile app the shared secret.** Anyone unpacking the app could look up any customer. Give the app its own endpoints authenticated with the signed-in user's token, where the phone comes **from the token**, never from a parameter, so it can only read and write its own record. Force `channel` to the app channel there, and **don't let the app set an `outcome`** — an in-app help chat isn't a sales disposition and a client-set one would corrupt whatever funnel drives your outbound calling.

### Step 3.4 — Configure the agent's tools in the Ello console

| Tool | Endpoint | Where it matters |
|---|---|---|
| `get_customer_history` | `POST /memory/context` | outbound phone agents (required), others optional |
| `get_user_context` | your profile/status lookup | in-app agent: profile + status before it speaks |
| `save_conversation` | `POST /memory/conversations` | in-app and web agents (their conversations exist nowhere else); recommended for phone |
| `report_call_outcome` | `POST /webhooks/call-outcome-report` | outbound phone agents (required for trustworthy outcomes) |

For every tool: `Content-Type: application/json`, header `x-api-key`, timeout ~20 s, and **leave the spoken "Messages" empty** — announcing "let me check our records" before the greeting tells the customer a machine is looking something up.

- **Fixed values must not be model-chosen.** Fix `channel` and `agent_role` per agent in the tool config; letting the model pick them corrupts your data.
- Use your public URL. **Ello's servers cannot reach `localhost`.**
- **The placeholder trap (observed).** Ello resolves a request-body property by matching its **name** against its available context variables. Text inside a *description* such as "{phone}" is decoration, never a template. For web-call agents the caller's number is exposed as **`phone_number`** (from `context_data.phone_number`), so the tool property must literally be called `phone_number`. For outbound dials, also send a `phone` key in `context_data` if your tool property is named `phone`. Make your endpoint accept either name, and **verify on a live call that the number really arrives**.

Add to the agent's prompt: *call `get_customer_history` first; if history returns, continue from it and don't re-ask; never state an unconfirmed outcome as fact; call `save_conversation` before the end.*

---

## 8. Phase 4 — Outbound phone calls

### Step 4.1 — One function places every call

Route every call — manual, scheduled job, journey step, campaign — through a single dial function so the lifecycle, timeline entry and error handling have one implementation. It must never throw: a provider outage degrades a call to `failed`, never an exception in a request handler.

1. **Create your own call record first** (`status: queued`). Its id is what you hand Ello; it is how the webhook (and the agent's own report) still matches if Ello answers slowly or you crash mid-flight.
2. Store exactly what the agent will be told (`context_data`) on that record. The first question when a call goes wrong is "what did it know?"
3. Ask Ello to dial:

```http
POST {baseUrl}/api/agents/{assistantId}/calls
x-api-key: …
{ "to_number": "+<E.164>", "agent_type": "<phone type>", "call_type": "outbound",
  "source": "<your label>", "hook_url": "https://…/webhooks/call-outcome",
  "name": "<customer name>",
  "context_data": { "<variables>": "…", "client_call_id": "<your call record id>" } }
```

4. Success ⇒ `dialing`, store Ello's `conversation_id`. Failure ⇒ `failed` with the error.

> **Format trap (observed):** this endpoint wants **E.164** (`+<country><number>`). The **campaign CSV upload wants the local number without a country code.** They look alike and take different formats — don't unify them.

Lifecycle: `queued → dialing → in_progress → completed | failed | no_answer | busy | cancelled`.

### Step 4.2 — Pass context so the call is a continuation, not a cold call

Everything in `context_data` is available to the agent as variables. Build it once and use the **same list** for (a) the variables registered on the agent and (b) the keys you send at dial time. If they drift, the agent reads `{{customer_name}}` aloud to a customer.

- Send **strings only**; **drop empty values** instead of sending blanks (a blank can render as a dangling "your  plan" mid-sentence), and tell the prompt that an absent value means *ask, don't assert*.
- Format values the way they should be *spoken* (amounts in words, "12 minutes ago").
- Include a `purpose` variable (`lead_followup`, `callback_requested`, `dropoff_followup`, `manual`, `campaign`…) so **one** phone agent can branch its opening internally.
- Include the memory `brief` at dial time. The agent can fetch it with a tool, but sending it means every call carries history even if the tool isn't configured yet — and saves a round-trip while the customer waits in silence.
- For drop-off follow-ups, write the reason in the second person and make it grammatical after the word "you" ("…you entered your number but never got past the verification step"), and frame it as a question about a *problem*, not a chase.

### Step 4.3 — Triggers you can offer

| Trigger | Notes |
|---|---|
| **Lead callback** | a visitor submits a form; a job calls them after a delay (we used ~60 minutes) if they didn't opt in to an instant call |
| **Instant callback opt-in** | "Yes, call me now": first attempt within seconds, retry ladder (e.g. 1 h gap, 3 attempts), resolved by the call's webhook; a call stuck in progress for ~40 minutes is resolved as a failed attempt so it can't block the cycle |
| **Journey step** | a messaging/automation tool waits for a follow-up event and, if it doesn't happen, calls your "place a call" endpoint |
| **Manual** | an operator clicks "Call now" (role-gated) |

**Never call within a minute of a form submission unless the visitor explicitly asked.** A flat "no" or silence must never become an unsolicited immediate call.

For a journey-triggered endpoint, **enforce every guard on your side** — the automation tool knows nothing about calling hours, cooldowns or do-not-call, and a misconfigured or looping journey must not be able to ring a real person. Return `200 { "called": false, "reason": … }` on denial, because a "failed" step would be retried. Order the checks: authenticated → valid phone → not do-not-call → inside calling hours → no recent call → lifetime cap → claim an idempotency key **before** dialling.

### Step 4.4 — Webhook events

Ello sends `call.started`, `call.completed`, `call.processed`, `call.recording` (and `campaign.started` / `campaign.ended` for campaigns).

| Field | Notes |
|---|---|
| `event` | the most reliable signal — trust it over `status` |
| `conversation_id` | Ello's id |
| `context_data.<your id>` | your id, echoed back |
| `status` | tolerant matching (`completed`, `ended`, `failed`, `no_answer`, `busy`, `cancelled`, `in_progress`…) |
| `answered`, `connected_at`, `call_duration` | **please send `answered: true`** — if none of the three is present, an answered call is recorded as *no answer* |
| `transcripts` | `[{role, content}]` — lets you infer a fallback outcome |
| `call_insights`, `recording_url`, `error_code`, `error_reason` | stored |

Typical handling: `call.started` ⇒ in progress; `completed`/`processed` ⇒ failed if there's an error, no-answer if nothing shows it connected, else completed; write one timeline entry on the **first** terminal event only.

### Step 4.5 — Outcomes: who do you trust?

**(observed)** Ello's lifecycle webhooks carry **no disposition field** — status, duration, transcript and recording, never "interested" or "not interested". Record the **source** of every outcome:

| Source | Meaning | Trust |
|---|---|---|
| `agent` | the agent called your `report_call_outcome` tool | authoritative |
| `inferred` | your keyword match on the transcript (store the matching phrase) | a guess — show it as *unconfirmed* |
| `status` | derived from no-answer / provider error | reliable but coarse |

Make inference conservative: only for connected calls, require a minimum transcript length, take the strongest signal (a refusal beats an earlier "interested"), return null when unsure, **never overwrite an agent report, and never re-infer over an earlier inference** (several events per call would make the disposition flap). A wrong "do not call" silences a real customer; a wrong "interested" keeps messaging someone who said no.

`report_call_outcome` payload: `conversation_id`, `outcome` (a closed list: `interested`, `not_interested`, `callback_requested`, `wrong_number`, `voicemail`, `unreachable`, `do_not_call`, `installed_app`/`converted`, `other`), `summary`, optional qualification fields, and `callback_at` (ISO-8601 — **ignore it unless it parses and is in the future**). If the customer hangs up before the tool fires, send nothing: **an unknown outcome is better than a wrong one.** Agents and dashboards should respect an `outcomeConfirmed` flag and never assert an unconfirmed outcome back to a customer.

---

## 9. Phase 5 — Bulk campaigns

A campaign is a contact list + an assistant + a schedule.

### Step 5.1 — Model it

- **Campaign:** name, unique code (attribution key), status (`draft`, `running`, `paused`, `completed`, `failed`, `cancelled`), assistant id, schedule, retry rules, counters, the provider's campaign id, soft-delete.
- **Contact:** phone (unique within the campaign), name, optional city/product/amount, any extra columns preserved, state (`pending`, `queued`, `called`, `failed`, `skipped`), attempt counters, `answered`.
- Store money in the smallest unit; convert to whole units when sending to the agent, because that's what it should say aloud.

### Step 5.2 — Build contact lists

- **Upload** (spreadsheet/CSV): match headers case- and space-insensitively against aliases (`name`/`fullname`, `phone`/`mobile`/`msisdn`, …); keep unmapped columns as extras; normalise phones; skip and **report invalid and duplicate rows with their spreadsheet row numbers**; enforce uniqueness per campaign so re-uploading a corrected file is safe. Parse in memory; don't write uploads to disk.
- **From segments:** if you build lists from saved segments, treat any user-supplied phone list as a *filter over the segment's own result only* — it must never add a number the segment didn't return, so exclusions such as do-not-call can't be bypassed.

### Step 5.3 — Start: hand the list to Ello's batch dialler

```http
POST {baseUrl}/api/campaign          (multipart/form-data, x-api-key)
  campaignName     your campaign name
  assistantId      the assistant to run it
  file             recipients.csv
  scheduleEnabled  "true"   (only when you want to delay the start)
  scheduleTime     ISO-8601 (only with scheduleEnabled)
  webhooks         JSON: [{ "url": "https://…", "method": "POST",
                            "events": ["call.started","call.completed","call.processed",
                                       "call.recording","campaign.started","campaign.ended"],
                            "headers": {} }]
```

Details that cost us time **(observed)**:

- **Re-send `webhooks` on every campaign.** Ello remembers nothing between campaigns.
- CSV columns: `phone_number, name, …`. Every row must have the **same columns** (a column present for only some contacts shifts values between rows). Every extra column reaches the agent as a **per-contact variable**.
- `phone_number` is the **local number without a country code** (different from the per-call endpoint).
- **`name` must be non-empty on every row.** A blank name doesn't return a clean 400 — it returns a malformed 500 ("Invalid status code: undefined"). Fall back to the phone number.
- On success, store Ello's `campaign_id`, mark the campaign running, and **move the contacts from `pending` to `queued` in the same transaction** so nothing else can also dial them and your dashboard doesn't read "pending" forever.
- Webhooks then arrive for calls Ello placed itself (they carry `campaign_id` + `to_number` and your call record doesn't exist yet — create it on the first event). `campaign.ended` carries Ello's own `successful_calls` / `failed_calls`; treat those as authoritative and write them with set semantics.

### Step 5.4 — Know what the hand-off gives up

Ello's campaign API takes a single `scheduleTime`. Once a list is handed off, **your own** recurring daily window, allowed weekdays, retry cadence (n per day, every n days, until answered), stop-on-answer and concurrency do **not** govern the dialling. The closest you can honour is deferring the *first* send until the next calling window opens. Plan accordingly:

- If you need richer cadence, either keep dialling per contact from your own scheduler (through the same single dial function) or split the list into waves.
- If you do **both** — hand lists to Ello *and* run your own scheduler — make sure contacts you've handed off can never be re-picked by your own loop. Webhook-driven state changes (`called`/`failed` without an incremented attempt counter) can make a handed-off contact look eligible again.
- **Cancelling:** there is no confirmed public API to cancel a campaign already running on Ello. Your cancel can only stop your own bookkeeping; tell the operator to also cancel on the Ello dashboard (we surfaced a flag in the response and the UI for this). Provide a global "stop everything" control for emergencies.

### Step 5.5 — Schedule rules (if you keep your own)

Keep them as pure functions with no database or network access so they can be unit-tested. Check in order: status → start/end → allowed weekday → daily window (an end earlier than the start wraps midnight). **Evaluate in the campaign's own time zone using `Intl`, not the server's clock** — a naive hour check would evaluate a 09:00–19:00 window against the server's zone and call people at night. Key the per-day attempt counter by the *local date* so it resets at local midnight without a reset job. Store `nextEligibleAt = null` for finished contacts so the scheduler query is cheap. Reject unknown time zones at save time rather than falling back silently.

---

## 10. Phase 6 — Prompts, variables and agent management

### Step 6.1 — Two layers, not one

An agent's behaviour comes from a large **static prompt** on Ello plus small **per-turn context** from your client. Anything that must be followed on the *current* screen should be re-asserted in per-turn context, because instructions that live only in the big prompt lose out to whatever is structurally closest to the model at generation time.

A good prompt covers: how to open the call, what your product can and can't do (and an explicit "never invent features"), the turn-by-turn loop, tool-selection guidance, sensitive-data rules, tone and language rules, and hard prohibitions.

### Step 6.2 — Keep prompts in version control and sync them by script

The agent lives in Ello's account, so a deploy can't provision it. Script it so the prompt you ship lives next to the code that feeds it:

1. Resolve the assistant for a role.
2. **Back up the current assistant document** to a file first — a prompt is the agent's entire behaviour and there is no version history to roll back to.
3. `PUT {baseUrl}/api/agents/{id}` with `{ "type", "prompt", "dynamic_variables" }` and the `x-api-key` header. **(observed)** The method must be **`PUT`** (POST and PATCH return 404). `dynamic_variables` must be an **array of plain strings**; objects are rejected.
4. **Read the stored document back and compare.** Don't trust the 200.
5. Provide a `--dry` mode.

Pitfalls **(observed)**:

- **Use an explicit end marker** for the prompt body. Terminating at the first horizontal rule silently truncated a prompt that used `---` as a section separator — it went live as just its opening paragraph and the agent lost every rule.
- In-product companions usually need **no** dynamic variables — their context arrives live over the session.
- The variable delimiter (`{{name}}`) wasn't initially confirmed. If a live call ever speaks `{{customer_name}}` aloud, try single braces and re-sync.
- One assistant = one prompt. If two roles share an assistant, branch inside the prompt on a `purpose` variable and sync it from one file.

### Step 6.3 — Make configuration visible

Give your admin team a screen that shows, per role, which assistant is in use, where that id came from, and whether it's dedicated or the shared default, plus a way to view/edit the prompt and list the workspace's assistants. Add a one-click "test connection".

---

## 11. Phase 7 — Safety and compliance

Enforce these **in your backend**, never only in the prompt or the automation tool that calls you.

| Control | Guidance |
|---|---|
| **Calling hours** | Obey your local telemarketing rules. Evaluate in the right time zone. Don't widen them in production because a test environment allowed it |
| **Spend ceiling** | A public form that can trigger a call is a billing risk. Cap calls per hour, counted from real call records (so a restart can't reset the cap), shared across every calling job |
| **Per-number cooldown** | One automatic call per number per window, across *all* sources. Allow `0` to disable it for testing — and beware the `Number(x) || default` trap, where a legitimate `0` is falsy and silently snaps back to the default |
| **Do-not-call** | One outcome ends the customer's journey and excludes them from every list, journey and job. A refusal outranks every automation |
| **Journey call cap** | A lifetime cap per customer for automated calls |
| **Blast radius** | Cap contacts handled per scheduler tick |
| **Idempotency** | Claim a key before dialling so a retried automation step can't double-call |
| **Disclosure & content** | Prompt rules we recommend: identify yourself as an AI; never claim to be human; never quote prices, rates or approvals you can't guarantee; never ask for one-time codes, PINs, CVV, card or government-ID numbers by phone; speak only the language the customer chose; honour a stop request immediately |
| **Data minimisation** | Don't let the agent collect secrets; redact sensitive tool arguments; keep verbose voice logs out of production builds |

---

## 12. Phase 8 — Test, then go live

### Automated

- Unit-test the pure logic: outcome inference and precedence, schedule rules, phone normalisation, CSV building, the variable list.
- For client UI, test control discovery, label resolution, sensitive-field refusal, disabled-control visibility, and that post-action reporting is event-driven rather than a fixed delay.
- Audio can't be unit-tested. Plan real-device runs.

### Simulate Ello's webhook (works before you have a public URL)

```sh
curl -X POST "$API/webhooks/call-outcome" -H "x-webhook-secret: $SECRET" -H 'Content-Type: application/json' -d '{
  "event":"call.completed","conversation_id":"<id>","context_data":{"client_call_id":"<your id>"},
  "status":"completed","answered":true,"call_duration":96,
  "transcripts":[{"role":"agent","content":"Hello…"},{"role":"user","content":"Yes, please send me the link"}] }'
```

### Expected API behaviour to assert

| Check | Expected |
|---|---|
| History for a known number | `200` with a brief |
| History for an unknown number | `200 { known: false }` — not an error |
| Phone in any format | resolves to the same person |
| Missing phone | `400` |
| Wrong or missing key | `401`; not configured: `503` |
| Save twice with the same `provider_conversation_id` | one record |
| Save with an unknown `channel` | `400` listing the allowed values |
| Outcome report for an unmatched id | `200 { matched: false }` (deliberately not 4xx) |
| Session broker with a phone-calling role | rejected |
| Broker when Ello is disabled / unconfigured | `503`; upstream failure: `502` |

### Live-call verification (with the real assistant)

Voice behaviour is a **prompt behaviour** check, not just data plumbing. On a real device and a real call, confirm: a tool-ack arrives; the agent speaks first; barge-in purges audio; the pre-call tool actually receives the number; the agent does not hear itself; tools change the UI and the result reports the real state; `report_call_outcome` lands as agent-sourced; the saved conversation is visible to the *next* agent.

### Go-live gate

- [ ] No Ello key in any client bundle, build argument, meta tag or repo (rotate it if it ever was)
- [ ] Webhook secret set in production; webhook URL is public `https`
- [ ] Every role is on a dedicated assistant (or you've consciously accepted the shared default)
- [ ] One full end-to-end call: dial → webhook → outcome reported → conversation saved → next agent sees it

---

## 13. Voice protocol reference

### Sequence

```
client                                 Ello REST                Ello WebSocket (/ws-ello)
  │ 1. mint a conversation ───────────────▶│                              │
  │◀──────────────── conversation_id ──────│                              │
  │ 2. open socket ─────────────────────────────────────────────────────────▶
  │ 3. voice-session-start {conversation_id, client_tools[], page_context} ─▶
  │◀───────────────────────────────────────────── session-established ─────│
  │ 4. voice-audio-input {data, sample_rate:16000, channels:1} (~40 ms) ───▶ (repeat)
  │◀──────────── voice-audio-output / conversation-text / client-tool-call ─│
  │ 5. client-tool-result {tool_call_id, status, result} ──────────────────▶
  │ 6. client-tools-update {tools?, page_context} ─────────────────────────▶
  │ 7. voice-session-end ──────────────────────────────────────────────────▶
```

Use the **`/ws-ello`** path. A sibling `/ws` path is a different, unrelated signalling route.

### Client → Ello

| `type` | Payload | When |
|---|---|---|
| `voice-session-start` | `conversation_id`, `client_tools[]`, `page_context` | once, right after the socket opens |
| `voice-audio-input` | `data` (base64 PCM16), `sample_rate`, `channels` | continuously (the field is `data`, not `audio`) |
| `client-tool-result` | `tool_call_id`, `status`, `result` or `error:{code,message}` | for every tool call |
| `client-tools-update` | optional `tools[]`, `page_context` | on navigation/state change. Note the field is `tools` here but `client_tools` in session-start — the asymmetry is real |
| `voice-session-end` | — | to hang up |

### Ello → client

| `type` | Meaning | Action |
|---|---|---|
| `session-established` | session live | mark live / start mic |
| `voice-audio-output` | `audio` (base64 PCM16), `format` | play |
| `voice-audio-purge` | barge-in | drop queued/playing audio immediately |
| `voice-audio-stream-end` | agent finished its turn | back to *listening* |
| `conversation-text` | `data:{text, source, is_interim}` | captions/transcript |
| `client-tool-call` | `tool_call_id`, `name`, `args`, `timeout_ms` | execute and reply |
| `client-tool-cancel` | call is moot | abort the handler |
| `client-tools-ack` | `accepted[]`, `rejected[]` | diagnostic only |
| `session-ended` / `voice-session-end` | server ended the call | tear down and close the socket |
| `error-occurred` | server error | log / surface |

### `client_tools[]` entry

```json
{ "name": "fill_field", "description": "Type a value into a named text field on the current screen.",
  "parameters": { "type": "object",
                  "properties": { "label": { "type": "string" }, "value": { "type": "string" } },
                  "required": ["label", "value"] },
  "available": true, "requires_confirmation": false, "sensitive": false, "timeout_ms": 10000 }
```

### Skeletons

**Session broker (pseudo-code)**
```ts
app.post('/voice/session', rateLimit(20, '1m'), async (req, res) => {
  const role = req.body?.role;
  if (!['appCompanion', 'siteGuide', 'adminNavigator'].includes(role)) return res.status(400).end();
  const cfg = await getEloConfig();                       // enabled, apiKey, baseUrl, wsUrl, agents
  if (!cfg.enabled || !cfg.apiKey) return res.status(503).end();
  const assistantId = await resolveAssistant(role);       // dashboard → env → default
  const r = await fetch(`${cfg.baseUrl}/api/agents/publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': cfg.apiKey },
    body: JSON.stringify({ assistant_id: assistantId, agent_type: 'webcall', source: 'sdk' }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await r.json().catch(() => null);
  const conversationId = body?.data?.conversation_id;
  if (!r.ok || !conversationId) return res.status(502).json({ error: unwrapError(body) });
  res.json({ data: { conversationId, wsUrl: cfg.wsUrl, role } });
});
```

**Tool execution (pseudo-code)**
```ts
queue = Promise.resolve();                                 // one handler at a time
onToolCall(msg => {
  const tool = tools.get(msg.name);
  if (!tool) return reply(msg, 'error', { code: 'unknown_tool' });
  if (tool.availableWhen && !tool.availableWhen()) return reply(msg, 'error', { code: 'tool_unavailable' });
  const bad = validate(tool.schema, msg.args); if (bad) return reply(msg, 'error', { code: 'invalid_args' });
  queue = queue.then(async () => {
    if (tool.requiresConfirmation && !(await confirmWithTimeout(45_000))) return reply(msg, 'denied');
    const result = await withTimeout(tool.handler(msg.args), tool.timeoutMs ?? 10_000);
    reply(msg, 'ok', await describeActualStateAfter(result));
  }).catch(e => reply(msg, 'error', { code: 'tool_handler_failed', message: String(e) }));
});
```

---

## 14. Pros and cons — what we learned building it

An honest account from the first production integration we supported. We kept the cons concrete so you can budget for them.

### Pros — what worked well

| # | What | Why it helped |
|---|---|---|
| 1 | **Speech-to-speech with real barge-in** | Conversations feel natural; users can interrupt, and a purge message gives you a clean hook to stop playback |
| 2 | **Client tools let the agent *act*, not just talk** | The agent fills fields, selects options and navigates — voice becomes an interface, not a chatbot |
| 3 | **A generic executor + aliases scales** | One tool surface covered every screen with no per-screen tool authoring; new screens became voice-addressable automatically |
| 4 | **Auto-discovering controls from the UI tree** | A single hook in a shared wrapper replaced hundreds of hand-registrations; a small explicit-registration hook covers the few it can't see |
| 5 | **Dynamic variables make calls a continuation** | The agent opens knowing name, product, amount and history, instead of "why are you calling?" |
| 6 | **One phone agent can serve many purposes** | Branching on a `purpose` variable meant one prompt, one place to improve |
| 7 | **Server-brokered sessions** | Solved CORS and kept the key off devices in one move; role-based requests prevent key misuse |
| 8 | **Webhooks + raw payload storage** | Provider shape drift became debuggable instead of silent |
| 9 | **Batch dialler** | Handing a list to Ello removed the need to run our own dialling infrastructure |
| 10 | **Agent-reported outcomes** | Once `report_call_outcome` was configured, dispositions became trustworthy |
| 11 | **Shared phone-keyed memory** | Website, app and phone agents behaved like one company; idempotent saves made retries safe |
| 12 | **Prompts in version control, synced by script** | Reproducible, reviewable, reversible (with backups and read-back verification) |
| 13 | **Fast to a first demo** | The protocol is small; a talking, tapping prototype was quick, and most effort went into reliability — which is the right place for it |

### Cons — what hurt, and how we handled it

| # | Issue | Impact | What to do |
|---|---|---|---|
| 1 | **Tools are frozen at connect** | A late-added tool is never callable; fails silently | Declare everything in the first message; design generic tools |
| 2 | **Native Mode (Gemini Live) required for tools** | Wrong mode ⇒ talks, never acts | Check mode first; warn if no tool-ack in 5 s |
| 3 | **Webhooks carry no outcome field** | Dispositions were keyword guesses | Configure `report_call_outcome`; store outcome *source*; conservative inference |
| 4 | **Tools can only be created in the console** | Manual, per agent, easy to forget | Keep a written per-agent tool matrix; verify each live |
| 5 | **No per-conversation status endpoint** | Lost webhooks leave calls "dialing" | Reconcile sweep that closes stale calls with no outcome |
| 6 | **Browsers can't call the REST API** | "Failed to fetch" | Broker through your server |
| 7 | **Inconsistent error bodies** (string vs object) | `[object Object]` shown to users | Unwrap recursively |
| 8 | **Separate hosts per environment; a bad socket host looks like a client bug** | Hours lost to code 1006 with a 200 from REST | Align REST + WS hosts; suspect the socket host first |
| 9 | **Echo cancellation is platform- and device-dependent** | The agent hears itself and cuts itself off | Voice processing (iOS), communication mode (Android), real-device tests; WebRTC as fallback (verify tool calling) |
| 10 | **Context updates during speech act as barge-ins** | Agent truncated and restarted mid-sentence | Defer until *listening*; debounce; dedupe |
| 11 | **Each standalone update can trigger an extra spoken turn** | Repeated greetings / duplicate scripts | Merge updates into the tool result; strip the opening after the first send |
| 12 | **Speak-first depends on a non-empty `page`** | Silent agent at call start | Always send `page` |
| 13 | **Tool-argument placeholder resolution is by *name*** | The pre-call tool got no phone number | Name the property after the context variable; accept both names server-side; test live |
| 14 | **Variable delimiter wasn't initially confirmed** | Risk of speaking `{{name}}` aloud | Verify on a live call; be ready to switch |
| 15 | **Prompt update API quirks** (PUT only; string-array variables; no history) | Truncated prompt shipped once; no rollback | Explicit end marker, backups, read-back verification |
| 16 | **Shared default agent hides misconfiguration** | A role ran the wrong prompt unnoticed | Show "dedicated vs shared" in admin; one prompt per purpose |
| 17 | **Two similar dial endpoints, two phone formats** | Wrong format ⇒ failures | Document and test both; don't unify |
| 18 | **Campaign API supports one `scheduleTime` only** | No recurring windows, retries, concurrency after hand-off | Defer first send; or dial per contact yourself; split into waves |
| 19 | **Blank contact name ⇒ malformed 500** | Whole upload fails confusingly | Fall back to the phone number |
| 20 | **No public cancel for a running campaign** | Cancelling on your side doesn't stop dialling | Operator cancels on Ello too; surface a warning; keep a kill switch |
| 21 | **Hand-off + your own scheduler can double-dial** | Possible duplicate calls to the same person | Make handed-off contacts ineligible for your scheduler; test with a small list |
| 22 | **Answered calls misclassified without an `answered` signal** | Real conversations counted as "unreachable" | Ask for `answered: true`; also use `connected_at` / duration |
| 23 | **Webhook URL must be public `https`** | Local dev gets no webhooks; `http` redirects drop the body | Tunnel for local work; require `https`; refuse to dial without it |
| 24 | **Optional ack, frozen tools and timing quirks make behaviour hard to see** | Slow debugging | Dev-only verbose logging of every frame type (never in production) |
| 25 | **Embedding a key in a mobile app is extractable** | Spend and reconfiguration risk | Broker mobile sessions too; if you must embed, rotate and rate-limit |
| 26 | **Voice raises data-handling questions** | Spoken secrets land in transcripts | Refuse secrets by default; redact sensitive tool args; decide one-time-code policy deliberately |
| 27 | **Real-device testing is mandatory** | Emulators hid mic and echo problems | Budget device time on every platform |

---

## 15. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Agent talks but never calls a tool; no `client-tools-ack` | Assistant not in Native Mode | Switch the mode in the Ello dashboard |
| A tool is acked but never called | Declared after session start, or reserved/duplicate name | Declare up front; check `rejected` in the ack |
| Agent never speaks first | `page_context.page` missing/empty | Send a non-empty `page` |
| Browser shows "Failed to fetch" | Calling Ello directly from the browser | Use your broker |
| REST 200 but the socket closes with 1006 | Wrong or unresolvable socket host; REST and WS in different environments | Align the hosts |
| Error text reads `[object Object]` | Stringifying a nested error body | Unwrap recursively |
| Broker returns 502 with a billing message | Upstream account state | Resolve with Ello; the 502 is intentional |
| Agent hears itself, cuts off mid-sentence | No echo cancellation | Platform voice processing; real-device test |
| Agent interrupted when the screen changes | Non-urgent update sent while speaking | Defer until *listening* |
| Agent repeats its greeting | `opening` left in updates, or an extra same-page update | Strip after first send; skip unchanged updates |
| Agent says a button is disabled when it isn't | Tool handlers ran in parallel | Serialise; report post-action state |
| Calls stuck at "dialing" | Webhook URL unreachable / `http` / unset | Public `https`; reconcile sweep |
| Answered call shows as unreachable | Webhook lacks `answered`/`connected_at`/duration | Have `answered: true` sent |
| Outcomes all "unconfirmed" | `report_call_outcome` not configured | Configure it on the agent |
| Returning customer greeted as a stranger | History tool not configured, or placeholder name doesn't match | Configure; use `phone_number`; verify live |
| Agent reads `{{variable}}` aloud | Variable not registered, or wrong delimiter | Re-sync variables; try single braces |
| Wrong prompt on a role | Roles share the default assistant | Assign dedicated assistants |
| Prompt went live truncated | Terminated at the first `---` | Explicit end marker; restore from backup |
| Campaign upload returns a malformed 500 | Blank `name` cell | Fall back to the phone number |
| Browser mic prompt never appears | `getUserMedia` wasn't first after the click | Reorder the awaits |
| iOS crash on rapid start/stop | Converter/tap recreated per call; 0 Hz input on simulator | Create once; guard invalid formats |

**When you ask Ello for help, send:** the `conversation_id`, the approximate UTC time, the environment (REST and socket hosts), the assistant id, and — for tool problems — the `client-tools-ack` payload. Never send your API key.

---

## 16. Integration checklist

**Ello**
- [ ] Workspace and API key stored in a secret manager
- [ ] One assistant per purpose; Native Mode on every one that uses client tools
- [ ] Telephony configured for phone agents
- [ ] REST and WebSocket hosts from the **same** environment

**Backend**
- [ ] Provider config store (enabled, key, hosts, per-role assistants, public `https` webhook URL)
- [ ] Role → assistant resolver with placeholder rejection and a "dedicated vs shared" view
- [ ] Session broker: role whitelist, no phone-calling roles, rate-limited, never accepts an assistant id, `502` on upstream failure, unwrapped errors
- [ ] Memory API: pull (unknown ⇒ 200), push (idempotent, `do_not_call` honoured), per-agent revocable keys
- [ ] Webhook receiver: secret-protected, fail closed in production, never 4xx for unmatched, raw payloads stored, idempotent, merge-not-overwrite
- [ ] Outcome source tracking with conservative inference
- [ ] Single dial function; context built once; variable list = registered variables
- [ ] Reconcile sweep for lost webhooks
- [ ] Safety guards: hours, spend cap, cooldown, do-not-call, journey cap, idempotency

**Client**
- [ ] Opt-in and self-disabling when unconfigured
- [ ] Lazy mic permission (web: `getUserMedia` first after the click)
- [ ] Start-token guard and per-socket "current" guard
- [ ] Every tool in `voice-session-start`; handlers serialised; availability re-checked; args validated; timeouts; fail-closed confirmation
- [ ] Results report real post-action state
- [ ] Sensitive-field denylist; skip/destructive actions need a tap
- [ ] `page_context` with non-empty `page`; debounce, defer-while-speaking, dedupe
- [ ] Platform echo cancellation; mic live during agent speech; purge on barge-in
- [ ] Screen stays awake; dedicated hang-up; clear states
- [ ] Verified on real devices

**Prompts and tools**
- [ ] Prompts in version control; sync script with backup, read-back and an explicit end marker
- [ ] Console tools configured per agent; property names match context variables; messages empty; public URLs
- [ ] Prompt lines for history, save, outcome and unconfirmed outcomes

**Go live**
- [ ] No Ello key in any client bundle or build argument
- [ ] Webhook secret set; webhook URL public `https`
- [ ] One full call verified end to end

---

## 17. Glossary

| Term | Meaning |
|---|---|
| **Assistant / agent** | An Ello-side agent: prompt, tools and voice, identified by an id |
| **Role** | Your name for a purpose an assistant serves |
| **Native Mode (Gemini Live)** | The assistant mode that supports client tool calls |
| **Client tool** | A function your app or page registers so the agent can act on your UI |
| **`page_context`** | Per-turn JSON describing what the user is looking at |
| **Barge-in** | The user speaks over the agent; Ello sends `voice-audio-purge` |
| **Session broker** | Your server endpoint that mints a session so the API key stays server-side |
| **`context_data`** | Variables sent with a dial or session and echoed on every webhook |
| **Brief** | The rolling cross-channel paragraph an agent reads before speaking |
| **Outcome source** | Whether a disposition came from the agent, an inference, or call status |
| **Hand-off** | Sending a campaign's list to Ello's batch dialler |
| **Reconcile sweep** | A job that closes calls whose terminal webhook never arrived |
