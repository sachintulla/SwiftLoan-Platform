# Ello tool configuration — per agent

Field-by-field values for Ello's tool builder. One section per agent; configure
only what its section lists.

Replace `HOST` with the public API address in every Request URL. **Ello's servers
cannot reach `localhost`** — with a local URL every tool call fails silently from
the customer's point of view.

Replace `SECRET` with the value of `ELLO_WEBHOOK_SECRET` (or
`CONVERSATION_API_KEY`) from the server environment. The same value works on every
tool below, under either `x-api-key` or `x-webhook-secret`.

---

## Which agent needs what

| Agent | Ello ID | get_customer_history | save_conversation | report_call_outcome |
|---|---|---|---|---|
| **Loan_campaign_agent** (all outbound calls) | `6a6c630e2f3448069caa1fe5` | **required** | recommended | **required** |
| **mobile companion app** | `6a7197be89c98da763e29b22` | optional | **required** | — |
| **Website companion app** | `6a7197ff89c98da763e29b23` | optional | **see note** | — |
| **Admin companion app** | `6a71988489c98da763e29b24` | — | — | — |

**Admin needs nothing.** It is an internal ops co-pilot with its own browser-side
tools; it never speaks to a customer, so there is no conversation worth
remembering.

**Website — worth one look before skipping.** The pull genuinely is near-useless:
the agent has no phone number until the visitor gives one. But without
`save_conversation`, a website voice conversation exists only inside Ello and is
**gone when the socket closes** — so a visitor who discusses their loan on the site
and then takes our callback is a stranger on that call. If the widget ever captures
a phone number mid-conversation, adding this tool is the difference between
remembering that exchange and losing it. Config is in the last section if you want
it.

---

# 1. Loan_campaign_agent — `6a6c630e2f3448069caa1fe5`

Handles **all outbound calls**: website lead callbacks, campaign dialling, and
drop-off follow-ups. Two tools are essential here.

## 1a. `get_customer_history` — REQUIRED

Without this the agent has no idea it has spoken to the person before.

| Field | Value |
|---|---|
| Tool Name | `get_customer_history` |
| Description | `Look up everything SwiftLoan already knows about this phone number across our website, previous phone calls and the mobile app. Call this ONCE at the very start of the call, before speaking, using the number being called. Returns a summary of past conversations to continue from. If known is false this is a new customer — greet them normally and do not mention any history.` |
| Request URL | `https://HOST/api/conversations/context` |
| Timeout | `20` |
| HTTP Method | `POST` |
| Headers | `Content-Type: application/json`<br>`x-api-key: SECRET` |

**Request Body**

| Property | Type | Required | Description |
|---|---|---|---|
| `phone` | string | yes | `The phone number being called, any format` |
| `limit` | number | no | `How many past conversations to return. Use 6.` |

**Response Body → variables**

| Extract | Variable name |
|---|---|
| `data.brief` | `conversation_history` |
| `data.known` | `is_returning_customer` |
| `data.conversationCount` | `past_conversation_count` |

**Messages:** leave empty. A spoken "let me check our records" before the greeting
announces that a machine is looking something up.

## 1b. `report_call_outcome` — REQUIRED

Ello's webhooks carry **no outcome field**, so without this tool every disposition
in the dashboard is our own keyword guess at the transcript, shown as unconfirmed.
This tool is the only source of a trustworthy outcome.

| Field | Value |
|---|---|
| Tool Name | `report_call_outcome` |
| Description | `Report how this call ended. Call this ONCE, just before the call finishes. Only set outcome to something the customer actually indicated. If you are not sure, do NOT call this tool — an unknown outcome is better than a wrong one.` |
| Request URL | `https://HOST/api/webhooks/ello/call-outcome-report` |
| Timeout | `20` |
| HTTP Method | `POST` |
| Headers | `Content-Type: application/json`<br>`x-api-key: SECRET` |

**Request Body**

| Property | Type | Required | Description |
|---|---|---|---|
| `conversation_id` | string | yes | `{{conversation_id}}` |
| `outcome` | string | yes | `One of exactly: interested, not_interested, callback_requested, wrong_number, voicemail, unreachable, do_not_call, installed_app, other` |
| `summary` | string | no | `One or two sentences a colleague can read in the dashboard` |
| `income_range` | string | no | `Only if the customer stated it, e.g. 50000-75000` |
| `employment` | string | no | `salaried or self_employed, only if stated` |
| `preferred_channel` | string | no | `whatsapp, sms or email` |
| `callback_at` | string | no | `ISO 8601 timestamp, only if they asked to be called back. Must be in the future.` |

**Messages:** none. This is bookkeeping — the customer should hear nothing.

> `do_not_call` ends the customer's journey and stops all further outreach. Only
> send it when they actually asked not to be contacted.

## 1c. `save_conversation` — RECOMMENDED

Outbound calls are **already** mirrored into the conversation memory from the call
webhooks, so this is not strictly required. It is worth adding because the agent's
own summary is far better than anything we can derive from a raw transcript, and
posting it is idempotent — it updates the same record rather than adding a second.

| Field | Value |
|---|---|
| Tool Name | `save_conversation` |
| Description | `Save a short summary of this call so the next SwiftLoan agent on any channel knows what was discussed. Call this ONCE near the end of the call.` |
| Request URL | `https://HOST/api/conversations` |
| Timeout | `20` |
| HTTP Method | `POST` |
| Headers | `Content-Type: application/json`<br>`x-api-key: SECRET` |

**Request Body**

| Property | Type | Required | Value |
|---|---|---|---|
| `phone` | string | yes | the number being called |
| `channel` | string | yes | **fixed value `phone_outbound`** — not model-chosen |
| `summary` | string | yes | `One to three plain sentences on what was discussed and agreed` |
| `provider_conversation_id` | string | no | `{{conversation_id}}` |
| `duration_sec` | number | no | call length in seconds |

Leave `agent_role` out entirely: the server already knows whether a call was a
campaign or a lead callback, and letting the model guess would corrupt that.

---

# 2. mobile companion app — `6a7197be89c98da763e29b22`

## 2a. `save_conversation` — REQUIRED

This is the important one for mobile. Nothing else records in-app voice
conversations: the app does not post them, and there is no webhook for an in-app
session. Without this tool every conversation in the app is **lost when the session
ends**.

| Field | Value |
|---|---|
| Tool Name | `save_conversation` |
| Description | `Save a short summary of this in-app conversation so the next SwiftLoan agent knows what was discussed. Call this ONCE when the conversation is finishing.` |
| Request URL | `https://HOST/api/conversations` |
| Timeout | `20` |
| HTTP Method | `POST` |
| Headers | `Content-Type: application/json`<br>`x-api-key: SECRET` |

**Request Body**

| Property | Type | Required | Value |
|---|---|---|---|
| `phone` | string | yes | the signed-in user's number |
| `channel` | string | yes | **fixed value `mobile_app`** |
| `agent_role` | string | no | **fixed value `companion`** |
| `summary` | string | yes | `One to three plain sentences on what the user asked and what you helped with` |
| `provider_conversation_id` | string | no | `{{conversation_id}}` |
| `duration_sec` | number | no | seconds |

Do **not** add an `outcome` property here. An in-app help conversation is not a
sales disposition, and one set by mistake would feed the funnel that decides who
gets called.

## 2b. `get_customer_history` — OPTIONAL

The app already fetches the customer's history itself and passes it to the agent as
page context, so a tool would be a second route to the same information. Add it
only if the agent is not reliably receiving that context — configuration is
identical to **1a** above.

---

# 3. Website companion app — `6a7197ff89c98da763e29b23`

Skip if you have decided to. If you want the conversation retained, add only this:

| Field | Value |
|---|---|
| Tool Name | `save_conversation` |
| Description | `Save a short summary of this website conversation, but ONLY if the visitor gave their phone number. If you do not have their number, do not call this tool.` |
| Request URL | `https://HOST/api/conversations` |
| Timeout | `20` |
| HTTP Method | `POST` |
| Headers | `Content-Type: application/json`<br>`x-api-key: SECRET` |

**Request Body**

| Property | Type | Required | Value |
|---|---|---|---|
| `phone` | string | yes | the number the visitor gave |
| `channel` | string | yes | **fixed value `website_widget`** |
| `agent_role` | string | no | **fixed value `websiteCompanion`** |
| `summary` | string | yes | one to three sentences |
| `provider_conversation_id` | string | no | `{{conversation_id}}` |

A conversation with no phone number cannot be stored — the number is the key that
ties the channels together — which is why the description tells the agent to skip
the call rather than invent one.

---

# Prompt wording to add

The prompts already handle their own openings. Add these two lines to any agent
given the tools above.

For an agent with `get_customer_history`:

> At the start of the conversation, call `get_customer_history` with the customer's
> phone number. If `conversation_history` comes back, continue from it — do not
> re-ask anything it already answers. If an outcome in it is marked unconfirmed, do
> not state it as fact.

For an agent with `save_conversation`:

> Before the conversation ends, call `save_conversation` with a one to three
> sentence summary of what was discussed and agreed.

---

# Verified endpoint behaviour

Tested against the running API:

| Call | Result |
|---|---|
| `POST /api/conversations/context` known number | `200`, brief returned |
| same, unknown number | `200` with `known:false` — **not** an error |
| same, `phone` missing | `400 phone is required` |
| same, `"+91 98765 00022"` | resolves to `9876500022` |
| any endpoint, wrong key | `401` |
| `POST /api/conversations` twice, same `provider_conversation_id` | updates one record, no duplicate |
| `POST /call-outcome-report`, unmatched id | `200 matched:false` — deliberately not a 4xx, so retries do not loop |
