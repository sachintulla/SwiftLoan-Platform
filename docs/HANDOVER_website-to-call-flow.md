# Website submit → voice call → dashboard — handover

Built overnight 2026-08-03/04. Everything below is implemented and tested; the
open items at the bottom need you (agent IDs, a public webhook URL).

---

## TL;DR — what you need to give me

**4 agent IDs.** One exists, three are new.

| # | Role key | What it does | Status today |
|---|---|---|---|
| 1 | `leadCallback` | Calls a website lead ~1 min after they submit, already knowing what they asked for | **needs a new agent** |
| 2 | `campaign` | Works an uploaded contact list on the campaign schedule | reusing `Loan_campaign_agent` — **see warning** |
| 3 | `companion` | The mobile app's in-app voice copilot | exists on **dev** (`6a64d273a4fc43f6203cd3cc`), needs a production one |
| 4 | `adminNavigator` | Drives the admin dashboard by voice | **needs a new agent** |

Minimum to unblock: **1** (`leadCallback`). The rest improve quality but the flow
runs without them.

Once you have them, no code change is needed:

```
Admin dashboard → Agents → pick an agent per role → Save
# then push each prompt:
cd server
npm run ello:sync -- --role leadCallback
npm run ello:sync -- --role campaign
```

### ⚠️ One thing I changed on your Ello account

Your workspace has only **one** agent, `Loan_campaign_agent`
(`6a6c630e2f3448069caa1fe5`). Its prompt was placeholder text ("You are a helpful
AI assistant…"), so I pushed the **lead-callback** prompt and 16 dynamic
variables onto it — you said to add the variables and update the prompt, and
without an agent the flow could not be tested at all.

So right now that agent behaves as a *website lead callback* agent, not a
campaign agent. Both roles currently point at it, which means **a campaign call
would use the lead-callback prompt** and open by claiming the person just filled
in a form. Fix by creating a dedicated campaign agent and assigning it, or run
`npm run ello:sync -- --role campaign` to put the campaign prompt back on it.

Full pre-change document is backed up at
`server/.ello-agent-backup.leadCallback.json`.

---

## The flow, verified end to end

Test run output (simulated dial, real everything else):

```
1 lead captured   : stage=lead_captured name=Ravi Kumar
2 agent context   : 14 vars | product=Home Loan amount=25 lakh rupees ago=just now
3 call queued     : 4a4d327c-…
4 webhook         : 200 Recorded | outcome=interested
  stored          : status=completed outcome=interested source=inferred evidence="send me the link"
5 journey         : lead_captured → call_completed
  customer stage  : contacted
6 agent report    : 200 Outcome recorded
  stored          : outcome=interested source=agent (was inferred) employment=salaried channel=whatsapp
```

1. **Website form** (`swiftloan.ai` → `POST /api/context/create`) creates the
   `Customer` at stage `lead_captured` with UTM/campaign attribution.
2. **`lead-autocaller` job** (every 60s) picks up leads older than
   `LEAD_CALL_DELAY_MINUTES` (default 1) that have never been called, inside the
   09:00–21:00 IST window, under the hourly cap and 24h per-phone cooldown.
3. **Context is built** ([`server/src/lib/callContext.ts`](../server/src/lib/callContext.ts))
   and sent as `context_data` on the Ello call — this is what makes it a
   continuation instead of a cold call.
4. **Ello dials**; `conversation_id` is stored on the `CallAttempt`, and the
   variables sent are stored in `callContext` so you can always see what the
   agent knew.
5. **Webhooks** (`/api/webhooks/ello/call-outcome`) update status, transcript,
   recording, duration, and advance the customer to `contacted`.
6. **Outcome** is captured — see below.
7. **Dashboard** shows all of it on the customer/lead journey page.

---

## The variables the agent receives

Defined once in `LEAD_CALL_VARIABLES`
([`server/src/lib/callContext.ts`](../server/src/lib/callContext.ts)) and used for
both the agent's `dynamic_variables` registration and the `context_data` payload —
if those two ever drift, the agent reads `{{lead_name}}` aloud to a customer.

| Variable | Example |
|---|---|
| `lead_name` / `lead_first_name` | `Anita Sharma` / `Anita` |
| `lead_city` | `Hyderabad` |
| `lead_phone` | `9812345670` |
| `lead_product` | `Personal Loan` |
| `lead_amount` / `lead_amount_words` | `₹3,00,000` / `3 lakh rupees` |
| `lead_submitted_ago` | `just now`, `12 minutes ago` |
| `lead_source` / `lead_campaign` | `campaign` / `diwali30` |
| `lead_stage` | `Lead submitted` |
| `lead_summary` | the visitor's own form wording |
| `lead_next_action` | `Call the lead` |
| `lead_prior_inquiries` / `lead_is_returning` | `2` / `yes` |
| `agent_purpose` | `website_lead_followup` |

Empty values are **dropped** rather than sent blank, and the prompt tells the
agent that an absent value means "ask, don't assert". Amounts are spoken the
Indian way ("3 lakh rupees") because that is what a caller expects to hear.

---

## Outcome capture — the part Ello does not give you

**Ello's webhooks carry no outcome field.** Verified: `call.started`,
`call.completed`, `call.processed`, `call.recording` between them give status,
duration, transcript and recording — never a disposition. So an answered call
would land in the dashboard as "completed, outcome blank", which is useless for
deciding follow-up.

Two sources, and the dashboard always shows **which one** you're looking at:

| `outcomeSource` | Meaning | Trust |
|---|---|---|
| `agent` | The agent called `report_call_outcome` | authoritative |
| `inferred` | We keyword-matched the transcript | **a guess** — `outcomeEvidence` shows the phrase |
| `status` | Derived from no-answer / provider error | reliable but coarse |
| `null` | Unknown | — |

This distinction is deliberate. Acting on an inferred `do_not_call` as if it were
confirmed silences a real customer; a false `interested` keeps messaging someone
who refused. Inference is conservative — it needs ≥25 chars of transcript,
prefers the strongest signal (a refusal beats an "interested" earlier in the same
call), returns null when unsure, never overwrites an agent report, and never
re-infers over an existing inference (Ello fires several events per call, which
would otherwise make the disposition flap).

18 unit tests cover this in
[`server/src/lib/callOutcome.test.ts`](../server/src/lib/callOutcome.test.ts).
**62 tests pass overall.**

### The tool to configure on each agent

`report_call_outcome` → `POST {PUBLIC_BASE}/api/webhooks/ello/call-outcome-report`
with header `x-webhook-secret: $ELLO_WEBHOOK_SECRET`:

```json
{
  "conversation_id": "{{conversation_id}}",
  "swiftloan_call_id": "<context_data.swiftloan_call_id>",
  "outcome": "interested",
  "summary": "Wants 3L personal loan, salaried, 60k/month. Link on WhatsApp.",
  "income_range": "50000-75000",
  "employment": "salaried",
  "preferred_channel": "whatsapp",
  "callback_at": null
}
```

Either identifier matches the call. A `callback_at` in the past is ignored.
`do_not_call` moves the customer to `lost`.

---

## What I changed

**Server**
- `src/lib/callContext.ts` — **new.** The variable contract + context builder.
- `src/lib/agents.ts` — **new.** Role → agent resolution with fallback.
- `src/lib/callOutcome.ts` — **new.** Inference, provenance, precedence rules.
- `src/lib/callOutcome.test.ts` — **new.** 18 tests.
- `src/lib/leadCaller.ts` — sends the full context; uses the `leadCallback` role.
- `src/lib/dialer.ts` — persists `callContext` on the attempt.
- `src/modules/webhooks.routes.ts` — outcome inference + provenance; new
  `/ello/call-outcome-report` endpoint.
- `src/modules/agents.routes.ts` — `GET`/`PUT /api/admin/agents/roles`.
- `prisma/schema.prisma` + migration `20260803185058_call_outcome_provenance` —
  7 new nullable columns on `CallAttempt`. **Additive only, zero destructive
  statements** (verified).
- `scripts/ello-sync-agent.ts`, `scripts/ello-agents.ts` — **new.**
  `npm run ello:sync`, `npm run ello:agents`.

**Prompts**
- `prompts/ello-lead-callback-prompt.md` — **new**, live on the agent.
- `prompts/ello-campaign-prompt.md` — **new**, not yet pushed.

Both carry hard regulatory rules: never quote a rate/EMI/approval, never ask for
OTP/CVV/PIN/account number, never ask for Aadhaar or PAN by phone, never claim to
be human, honour a do-not-call immediately.

**Admin UI** — call detail (outcome + source + evidence + captured details +
"what the agent knew") on the customer/lead journey pages, and a new `/agents`
page to assign agents per role. Built in parallel; verify before relying on it.

---

## Open items

1. **Agent IDs** — the 4 above.
2. **`webhookUrl` is `http://localhost:4000/...`** — Ello **cannot reach
   localhost**, so no outcome ever comes back in local testing. My end-to-end
   test simulated the provider's callback. For a real call you need a public URL
   (ngrok/cloudflared locally, or the Render URL in production), set in
   Integrations → Ello → `webhookUrl`. **This is the single biggest gap between
   "tested" and "working on a real call".**
3. **`{{...}}` delimiter is unverified.** Ello stores the prompt verbatim and its
   docs don't state the syntax; I used the cross-platform convention. If the
   first live call reads "{{lead_first_name}}" aloud, switch to
   `{lead_first_name}` and re-sync. Everything else was verified against the live
   API.
4. **`report_call_outcome` tool** must be configured on each agent in the Ello
   console — I can't create tools through the API. Until then, outcomes come only
   from inference.
5. **Only one agent exists**, and its prompt is now the lead-callback one — see
   the warning above.

## Commands

```sh
cd server
npm run ello:agents                          # which agent each role resolves to, and why
npm run ello:sync -- --role leadCallback --dry   # preview
npm run ello:sync -- --role leadCallback         # push prompt + variables (backs up first)
npm test                                     # 62 tests
```
