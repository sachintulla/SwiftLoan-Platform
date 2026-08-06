# SwiftLoan Agent API — push & pull

One reference for every call between our dashboard and the agents. Give the Ello
sections to the Ello team.

Two directions, both needed:

- **PULL** — the agent asks us what we know, *before it speaks*
- **PUSH** — the agent tells us what happened, *when it finishes*

Skip the pull and a returning customer is greeted as a stranger. Skip the push and
the conversation is lost the moment the socket closes.

## Base URL

| Environment | Base |
|---|---|
| Production | `https://swiftloan-api.onrender.com` |
| Local dev | `http://localhost:4000` — **not reachable from Ello's servers** |

## Two auth schemes — pick by caller

| Caller | Header | Why |
|---|---|---|
| **Ello** (phone, website widget) | `x-api-key: <CONVERSATION_API_KEY>` | server-to-server; no user session exists |
| **Mobile app** | `Authorization: Bearer <user access token>` | the phone comes from the token, so the app needs no shared secret |

`x-webhook-secret` is accepted in place of `x-api-key`, so Ello can reuse the value
already configured for webhooks.

> The mobile app deliberately does **not** get the shared secret. Anyone who
> unpacks an APK would then be able to read any customer's history by phone
> number. With a user token the app can only ever read and write its own.

---

# PART 1 — Ello

## 1.1 PULL: what do we know about this number?

```
GET /api/conversations/context?phone=9876500011&limit=8
x-api-key: <CONVERSATION_API_KEY>
```

Any phone format works — `+91 98765 00011`, `098765-00011`, `9876500011` all
resolve to the same person.

**Response (known):**
```json
{
  "success": true,
  "data": {
    "known": true,
    "phone": "9812340001",
    "name": "Ravi Kumar",
    "city": "Pune",
    "stage": "contacted",
    "brief": "This person (9812340001) has had 5 conversations with us across in-app voice chat, website voice chat, phone call (we called them).\nJourney stage: contacted…\n2 minutes ago — in-app voice chat, 45s. Asked how to upload salary slips.\n15 minutes ago — phone call (we called them), 130s, outcome: interested. Confirmed 5L, salaried 70k/month…",
    "conversationCount": 5,
    "channels": ["mobile_app", "website_widget", "phone_outbound"],
    "lastAt": "2026-08-05T12:40:00.000Z",
    "conversations": [
      { "channel": "mobile_app", "channelLabel": "in-app voice chat", "agentRole": "companion",
        "at": "…", "durationSec": 45, "summary": "Asked how to upload salary slips.",
        "outcome": null, "outcomeConfirmed": false, "details": null }
    ]
  }
}
```

**`brief` is the field to inject into the prompt.** One ready-to-read paragraph,
composed server-side so all four agents describe the history identically.

**Response (unknown number):** `200` with `{ "known": false, "phone": "…" }` —
a first-time caller is normal, not an error.

Shorter variant if you only want the paragraph:
```
GET /api/conversations/summary?phone=9876500011
→ { phone, known, brief, conversationCount, lastAt }
```

## 1.2 PUSH: save the conversation

```
POST /api/conversations
x-api-key: <CONVERSATION_API_KEY>
```
```json
{
  "phone": "9812340001",
  "channel": "phone_outbound",
  "agent_role": "leadCallback",
  "provider_conversation_id": "6a71e36f1c9cbd51e750973c",
  "summary": "Confirmed 5 lakh personal loan. Salaried, 70k/month. Sending app link on WhatsApp.",
  "outcome": "interested",
  "duration_sec": 130,
  "started_at": "2026-08-05T12:05:00Z",
  "ended_at": "2026-08-05T12:07:10Z",
  "transcript": [{ "role": "agent", "content": "…" }, { "role": "user", "content": "…" }],
  "details": { "employment": "salaried", "income_range": "50000-75000", "preferred_channel": "whatsapp" },
  "recording_url": "https://…/recording.mp3"
}
```

| Field | Required | Notes |
|---|---|---|
| `phone` | **yes** | normalised to bare 10 digits |
| `channel` | **yes** | `phone_outbound` \| `phone_inbound` \| `website_widget` \| `mobile_app` \| `admin` — anything else is a `400` |
| `summary` | **in practice yes** | 1–3 sentences. **This is what the next agent reads.** Max 2000 chars |
| `provider_conversation_id` | strongly recommended | Ello's `conversation_id`. Makes the call **idempotent** — post at start and end and it updates one row |
| `agent_role` | recommended | `leadCallback` \| `campaign` \| `companion` \| `websiteCompanion` \| `adminNavigator` |
| `outcome` | optional | **Omit if unsure — never guess.** Anything sent here is recorded as agent-confirmed |
| `transcript`, `details`, `duration_sec`, `started_at`, `ended_at`, `recording_url` | optional | |

## 1.3 PUSH: call lifecycle (phone agents only)

```
POST /api/webhooks/ello/call-outcome
x-webhook-secret: <ELLO_WEBHOOK_SECRET>
```
Send for each of `call.started`, `call.completed`, `call.processed`,
`call.recording`. Fields: `event`, `conversation_id`,
`context_data.swiftloan_call_id`, `status`, **`answered`**, `connected_at`,
`call_duration`, `transcripts`, `call_insights`, `recording_url`,
`error_code`/`error_reason`.

**Please send `answered: true`.** Without it (or `connected_at`, or a non-zero
duration) we infer the call was never picked up, and an answered call is recorded
as *unreachable*.

Outbound calls are mirrored into the conversation memory automatically from this
webhook — you do not need 1.2 as well, though sending it with a better `summary`
improves the brief and is idempotent.

## 1.4 PUSH: call outcome

```
POST /api/webhooks/ello/call-outcome-report
x-webhook-secret: <ELLO_WEBHOOK_SECRET>
```
```json
{
  "conversation_id": "…", "swiftloan_call_id": "…",
  "outcome": "interested",
  "summary": "Wants 3L personal loan, salaried, 60k/month.",
  "income_range": "50000-75000", "employment": "salaried",
  "preferred_channel": "whatsapp", "callback_at": null
}
```
`outcome` ∈ `interested`, `not_interested`, `callback_requested`, `wrong_number`,
`voicemail`, `unreachable`, `do_not_call`, `installed_app`, `other`.

Configure as a tool named `report_call_outcome`, called once before the call ends.
`do_not_call` moves the customer to `lost` and stops outreach. A `callback_at` in
the past is ignored. If the customer hangs up first, send nothing — an unknown
outcome is better than a wrong one.

---

# PART 2 — Mobile app

## 2.1 PULL: everything about the signed-in user

```
GET /api/context/me
Authorization: Bearer <user access token>
```

Phone is taken from the token — never from a query parameter, or this would be an
open lookup of anyone's loan history.

```json
{
  "success": true,
  "data": {
    "hasHistory": true,
    "name": "Ravi Kumar", "city": "Pune", "stage": "contacted",
    "nextAction": "Send the app download link",
    "brief": "Ravi enquired on the website 13 hours ago about Home Loan of 25 lakh rupees; spoke to us on the phone and the outcome was interested.",
    "conversationBrief": "This person has had 5 conversations across in-app voice chat, website voice chat, phone call…",
    "conversationCount": 5,
    "conversationChannels": ["mobile_app", "website_widget", "phone_outbound"],
    "conversations": [ { "channelLabel": "in-app voice chat", "summary": "…", "outcomeConfirmed": false } ],
    "inquiries": [ { "product": "Home Loan", "amountLabel": "25 lakh rupees" } ],
    "lastCall": { "outcome": "interested", "outcomeSource": "agent", "answered": true },
    "application": null, "loan": null
  }
}
```

Two briefs, on purpose: **`brief`** is the funnel journey (enquiries, application,
loan), **`conversationBrief`** is what was actually *said* across channels. An
in-app agent wants both — one says where they are, the other what they already
told us.

## 2.2 PUSH: save an in-app conversation

```
POST /api/context/me/conversation
Authorization: Bearer <user access token>
```
```json
{ "summary": "Asked how to upload salary slips. Guided to the documents screen.",
  "duration_sec": 45, "conversation_id": "…", "transcript": [], "details": {} }
```

`summary` is required (`400` without it). `channel` is forced to `mobile_app` and
`outcome` cannot be set — an in-app assistant chat is not a sales disposition, and
letting a client set one would corrupt the funnel that drives outbound calling.

---

# Verified behaviour

Tested live against the running API:

| Check | Result |
|---|---|
| `GET /context` known number | `200`, 5 conversations, 3 channels |
| `GET /context` unknown number | `200 known:false` (not an error) |
| `GET /context` without key | **`401`** |
| `POST /conversations` | `200 Conversation recorded` |
| `POST /conversations` bad channel | **`400`** with the allowed list |
| `POST` same `provider_conversation_id` twice | updates, does **not** duplicate |
| `GET /api/context/me` | `200`, both briefs populated |
| `POST /me/conversation` | `200 Conversation saved` |
| `POST /me/conversation` no summary | **`400`** |
| `POST /me/conversation` no auth | **`401`** |

---

# outcomeConfirmed — please respect it

Every conversation carries `outcomeConfirmed`:

- **`true`** — an agent explicitly reported it. Safe to rely on.
- **`false`** — **we guessed it** by keyword-matching the transcript, because
  Ello's webhooks carry no outcome field.

Never assert an unconfirmed outcome back to a customer. *"Last time you said you
weren't interested"* off a keyword guess is worse than saying nothing — and if that
guess was `do_not_call`, acting on it silences a real customer.

# Suggested prompt wording

> Before speaking you are given `conversation_history`: everything we know about
> this person across our website, phone calls and app. If present, continue from
> it — do not re-ask what it already answers. If an outcome there is marked
> unconfirmed, do not state it as fact. When the conversation ends, call
> `save_conversation` with a 1–3 sentence summary.

# What to configure in Ello, per agent

1. **Session start / pre-call:** GET the context for the number, inject
   `data.brief` as a dynamic variable (e.g. `conversation_history`).
2. **End of conversation:** a `save_conversation` tool that POSTs the summary.
3. **Phone agents only:** the `report_call_outcome` tool (1.4).

For phone agents the number is the one being dialled. For the website and in-app
agents it is known only once the visitor gives it or is logged in — call the pull
at that point, not at session start.

# Known gap

**`webhookUrl` currently points at `http://localhost:4000`**, which Ello's servers
cannot reach. Until that is a public URL (tunnel or the Render address), no call
lifecycle or outcome data arrives, and calls sit at `dialing` forever.
