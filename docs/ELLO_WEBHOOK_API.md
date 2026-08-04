# API for Ello — reporting call status and outcome

Give this to the Ello team. Two endpoints: one for the call lifecycle, one for the
disposition. Both are on our API and both are **public** (no login) because Ello's
servers call them, so both are protected by a shared secret instead.

---

## Base URL

| Environment | Base |
|---|---|
| Production | `https://swiftloan-api.onrender.com` |
| Local dev | `http://localhost:4000` — **not reachable from Ello**, see the note at the end |

## Auth — required on both endpoints

```
x-webhook-secret: <ELLO_WEBHOOK_SECRET>
```

Wrong or missing secret → `401`. In production a missing secret configured on our
side returns `503` rather than accepting an unverified post: these endpoints move
customers through the funnel, so an unauthenticated caller could mark someone
`contacted`, or send `do_not_call` and end their journey outright.

---

## 1. Call lifecycle — status, transcript, recording

```
POST /api/webhooks/ello/call-outcome
Content-Type: application/json
x-webhook-secret: <secret>
```

Send this for each lifecycle event: `call.started`, `call.completed`,
`call.processed`, `call.recording`. Sending all four is fine and expected — we
guard against double-counting.

### Fields

| Field | Type | Notes |
|---|---|---|
| `event` | string | `call.started` \| `call.completed` \| `call.processed` \| `call.recording`. **Most important field** — we trust it over `status`. |
| `conversation_id` | string | Ello's id, returned when the call was created. Primary match key. |
| `context_data.swiftloan_call_id` | string | Our own id, echoed back from what we sent. Fallback match key — please include it. |
| `status` | string | Optional. `completed`, `failed`, `no_answer`, `busy`, `cancelled`, `in_progress`… tolerant matching. |
| `answered` | boolean | **Please send this.** Without it we infer connection from `connected_at` or a non-zero duration, and an answered call with neither is wrongly recorded as *no answer*. |
| `connected_at` | timestamp | Alternative signal that the call connected. |
| `call_duration` | number | Seconds. |
| `transcripts` | array | `[{ role, content }]` or `[{ text }]`. **This is what lets us derive an outcome** — see below. |
| `call_insights` | string/object | Free-text summary. |
| `recording_url` | string | Link to the recording. |
| `error_code` / `error_reason` | string | On failure. `error_reason` is mapped to an outcome where possible. |

### Example

```json
{
  "event": "call.completed",
  "conversation_id": "6a71e36f1c9cbd51e750973c",
  "context_data": { "swiftloan_call_id": "b4c7b32b-5d17-4782-a90b-ccb9fde0aa2c" },
  "status": "completed",
  "answered": true,
  "call_duration": 96,
  "call_insights": "Customer asked for the app link on WhatsApp.",
  "transcripts": [
    { "role": "agent", "content": "Hello Ravi, this is Ella from SwiftLoan…" },
    { "role": "user",  "content": "Yes please send me the link on whatsapp" }
  ],
  "recording_url": "https://…/recording.mp3"
}
```

### Responses

| Code | Meaning |
|---|---|
| `200` `{matched:true, …}` | Recorded. |
| `200` `{matched:false}` | We could not find that call — **deliberately 200 so you do not retry a body we can never match.** |
| `401` | Bad secret. |

---

## 2. Call outcome — what the agent concluded

```
POST /api/webhooks/ello/call-outcome-report
Content-Type: application/json
x-webhook-secret: <secret>
```

**This is the important one.** Ello's lifecycle webhooks contain no disposition
field, so without this we can only *guess* the outcome by keyword-matching the
transcript — and the dashboard labels such guesses "unconfirmed" because acting on
a wrongly inferred `do_not_call` silences a real customer.

Configure it as a tool named `report_call_outcome` on the agent, called once
before the call ends.

### Fields

| Field | Type | Notes |
|---|---|---|
| `conversation_id` | string | Either identifier is enough; both is safest. |
| `swiftloan_call_id` | string | From `context_data`. |
| `outcome` | enum | **Required.** One of: `interested`, `not_interested`, `callback_requested`, `wrong_number`, `voicemail`, `unreachable`, `do_not_call`, `installed_app`, `other`. Unrecognised values are logged, not guessed at. |
| `summary` | string | One or two sentences for the dashboard. |
| `income_range` | string | Only if actually stated. |
| `employment` | string | e.g. `salaried`, `self_employed`. |
| `preferred_channel` | string | `whatsapp` \| `sms` \| `email`. |
| `callback_at` | ISO 8601 | Must be in the future; a past timestamp is ignored. |

### Example

```json
{
  "conversation_id": "6a71e36f1c9cbd51e750973c",
  "swiftloan_call_id": "b4c7b32b-5d17-4782-a90b-ccb9fde0aa2c",
  "outcome": "interested",
  "summary": "Wants 3L personal loan. Salaried, ~60k/month. Sending app link on WhatsApp.",
  "income_range": "50000-75000",
  "employment": "salaried",
  "preferred_channel": "whatsapp",
  "callback_at": null
}
```

### Behaviour

- An outcome reported here **always wins** over one we inferred from the transcript.
- `do_not_call` moves the customer to `lost` and stops further outreach.
- If the customer hangs up before the tool can be called, that is fine — we record
  an unknown outcome rather than a wrong one. **Never send a guessed outcome.**

---

## Outcome precedence, for reference

| Source | Meaning | Trust |
|---|---|---|
| `agent` | Endpoint 2 above | authoritative |
| `inferred` | Our keyword match on `transcripts` | a guess, shown as unconfirmed |
| `status` | Derived from no-answer / error | reliable but coarse |

So: **send endpoint 2 and the transcript, and the dashboard is accurate. Send
neither and it can only show that a call happened.**

---

## Configuring it on our side

Admin dashboard → Integrations → Ello → `webhookUrl`, or `ELLO_WEBHOOK_SECRET` in
the server environment.

> **Local development does not work without a tunnel.** `http://localhost:4000` is
> not reachable from Ello's servers, so no webhook arrives, the call sits at
> `dialing` forever and the customer never leaves `lead_captured` — which looks
> like a broken pipeline but is only an unreachable URL. Use a public tunnel
> (`cloudflared tunnel --url http://localhost:4000`) and set `webhookUrl` to the
> tunnel address, or test against the deployed API.
