# Conversation Memory API — for Ello

Give this to the Ello team. It is what makes all four agents share one memory of a
customer, keyed on their phone number.

**Every agent makes two calls:**

| When | Call | Why |
|---|---|---|
| **Before it speaks** | `GET /api/conversations/context?phone=…` | so it knows what was already discussed |
| **When it finishes** | `POST /api/conversations` | so the next agent knows too |

Without the first call the agent greets a returning customer as a stranger.
Without the second, the conversation is lost the moment the socket closes.

---

## Base URL

| Environment | Base |
|---|---|
| Production | `https://swiftloan-api.onrender.com` |
| Local dev | `http://localhost:4000` — not reachable from Ello's servers |

## Auth — required on every call

```
x-api-key: <CONVERSATION_API_KEY>
```

`x-webhook-secret` is accepted too, so the same value already configured for the
call webhooks can be reused.

Wrong or missing → **401**. Not configured on our side → **503**.

> Unlike the call webhooks, this endpoint is **never** open in development. It
> returns a person's loan and conversation history for any number supplied, so the
> secret is the only thing between a caller and a customer-data lookup.

---

## 1. Fetch context — call this BEFORE the conversation starts

```
GET /api/conversations/context?phone=9876500011&limit=8
```

`phone` — any format; `+91 98765 00011`, `098765-00011` and `9876500011` all
resolve to the same person. `limit` — how many past conversations to return
(default 8, max 25).

### Response — known number

```json
{
  "success": true,
  "data": {
    "known": true,
    "phone": "9812340001",
    "name": "Ravi Kumar",
    "city": "Pune",
    "stage": "contacted",
    "brief": "Ravi (9812340001) has had 3 conversations with us across in-app voice chat, phone call (we called them), website voice chat.\nJourney stage: contacted. First seen via website.\n2 minutes ago — in-app voice chat, 60s. Asked how to finish KYC…\n15 minutes ago — phone call (we called them), 130s, outcome: interested. Confirmed 5L, salaried 70k/month…",
    "conversationCount": 3,
    "channels": ["mobile_app", "phone_outbound", "website_widget"],
    "lastAt": "2026-08-05T12:20:11.000Z",
    "conversations": [
      {
        "id": "…",
        "channel": "mobile_app",
        "channelLabel": "in-app voice chat",
        "agentRole": "companion",
        "at": "2026-08-05T12:20:11.000Z",
        "durationSec": 60,
        "summary": "Asked how to finish KYC. Guided to the Aadhaar screen.",
        "outcome": null,
        "outcomeConfirmed": false,
        "details": null
      }
    ]
  }
}
```

**`brief` is the field to inject into the agent's prompt.** It is one
ready-to-read paragraph covering every channel, composed server-side so all four
agents describe the history identically.

### Response — unknown number

```json
{ "success": true, "data": { "known": false, "phone": "9812340001" } }
```

**200, not 404.** A first-time caller is normal. The agent should just behave as
it would with no context — do not treat this as an error.

### `outcomeConfirmed` — please respect this

- `true` — a previous agent explicitly reported that outcome. Safe to rely on.
- `false` — **we guessed it** by keyword-matching the transcript, because Ello's
  webhooks carry no outcome field.

An agent must not assert an unconfirmed outcome back to the customer. Saying *"last
time you said you weren't interested"* off a keyword guess is worse than saying
nothing — and if that guess was `do_not_call`, acting on it silences a real
customer.

---

## 2. Save the conversation — call this WHEN IT ENDS

```
POST /api/conversations
Content-Type: application/json
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
  "transcript": [
    { "role": "agent", "content": "Hello Ravi, this is Ella from SwiftLoan…" },
    { "role": "user",  "content": "Yes, please send the link on WhatsApp" }
  ],
  "details": { "employment": "salaried", "income_range": "50000-75000", "preferred_channel": "whatsapp" },
  "recording_url": "https://…/recording.mp3"
}
```

### Fields

| Field | Required | Notes |
|---|---|---|
| `phone` | **yes** | Any format; normalised to bare 10 digits. |
| `channel` | **yes** | `phone_outbound` \| `phone_inbound` \| `website_widget` \| `mobile_app` \| `admin` |
| `provider_conversation_id` | strongly recommended | Ello's `conversation_id`. Makes the call **idempotent** — post at start and end and it updates one row instead of creating two. |
| `agent_role` | recommended | `leadCallback` \| `campaign` \| `companion` \| `websiteCompanion` \| `adminNavigator` |
| `summary` | **yes, in practice** | 1–3 sentences. **This is what the next agent reads** — an empty summary makes the whole feature pointless. Max 2000 chars. |
| `outcome` | optional | Same enum as the call report. **Omit if unsure — never guess.** Anything posted here is recorded as agent-confirmed. |
| `transcript` | optional | Any shape. |
| `details` | optional | Free-form object; income, employment, preferred channel… |
| `duration_sec`, `started_at`, `ended_at`, `recording_url` | optional | |

### Response

```json
{ "success": true, "data": { "id": "…", "phone": "9812340001", "channel": "phone_outbound" }, "message": "Conversation recorded" }
```

`400` on a bad phone or an unknown `channel`.

---

## 3. Just the brief

```
GET /api/conversations/summary?phone=9812340001
```

→ `{ phone, known, brief, conversationCount, lastAt }` — for an agent that wants
one string and nothing else.

---

## Where to configure this in Ello

For each of the four agents:

1. **A pre-call / session-start step** that GETs `/context` for the caller's number
   and injects `data.brief` into the system prompt (a dynamic variable, e.g.
   `conversation_history`).
2. **An end-of-conversation tool** (`save_conversation`) that POSTs the summary.

For the **outbound phone agents** the number is the one being dialled. For the
**website and in-app agents** the number is known only once the visitor gives it
or is logged in — call `/context` at that point rather than at session start.

## Prompt wording we suggest

> Before speaking, you are given `conversation_history` — everything we already
> know about this person across our website, phone calls and app. If it is
> present, continue from it; do not re-ask what it already answers. If an outcome
> in that history is marked unconfirmed, do not state it as fact.

---

## What we already do for you

Outbound phone calls placed by SwiftLoan are mirrored into this memory
automatically from the call webhooks — you do not need to POST those separately,
though doing so with a better `summary` improves the brief and is idempotent on
`provider_conversation_id`.

What we **cannot** capture without you: the website-widget and in-app voice
conversations. Those live entirely inside Ello, so if the agent does not POST them
they are lost when the socket closes.
