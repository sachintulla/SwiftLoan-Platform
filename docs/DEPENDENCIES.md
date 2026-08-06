# What we need from you — ordered task list

Everything on our side is built and tested. These are the items that need someone
outside the codebase: Ello, Upshot, an SMS provider, or a Render setting.

Work top to bottom — the order is deliberate. Items 1–3 unblock the most.

---

## 1. Deploy to the cloud — **blocks everything below**

**Why:** every API we built exists only on the laptop.
`https://swiftloan-api.onrender.com` is running older code and returns **404** for
`/api/conversations/context`, `/api/context/me` and the rest. Ello cannot reach a
laptop, so nothing can be tested for real until this is done.

**Task**
1. Tell me to commit and push (29 files, branch `Website/dashboard`). I have
   already scanned the diff for secrets — it is clean.
2. Render auto-deploys from that branch.
3. In the Render dashboard → `swiftloan-api` → Environment, set:
   - `ELLO_API_KEY` = `ak_5LmXxVYDAA9xd25Y3CzG_kwQyY3Smzsq__eTKYO52pM.CXOZZi5lpnO0nMyS`
   - `ELLO_WEBHOOK_SECRET` = click **Generate**, then copy the value — you need it
     for step 2 below.
4. Confirm `DATABASE_URL` points at the database you want migrated. Five
   migrations will apply; all are additive (2 new tables, new nullable columns,
   one index widened). No data is dropped.

**Done when:** `https://swiftloan-api.onrender.com/api/ready` returns 200 and
`/api/conversations/context` no longer 404s.

> I already fixed a gap that would have made this deploy half-work: the build ran
> `prisma generate` but never `prisma migrate deploy`, so the new tables would not
> have existed and every conversation endpoint would have 500'd.

---

## 2. Ello — point the webhook at the public URL

**Why:** this is the single setting standing between "tested" and "works on a real
call". Right now a call dials correctly, the customer answers — and nothing comes
back. No transcript, no outcome, and they sit at `lead_captured` looking broken.

**Task**
- Admin dashboard → Integrations → Ello → `webhookUrl`
- Set to: `https://swiftloan-api.onrender.com/api/webhooks/ello/call-outcome`
- In Ello's console, confirm the same URL is registered for the call events
  (`call.started`, `call.completed`, `call.processed`, `call.recording`).

**Also ask Ello to send `answered: true`** on answered calls. Without it (or
`connected_at`, or a non-zero `call_duration`) we infer the call was never picked
up, and an answered call is recorded as *unreachable*. I hit this exact case in
testing.

**Done when:** you place a call and the transcript appears on the lead page.

---

## 3. Ello — add the two tools to each agent

**Why:** without the save tool, website and in-app conversations are lost the
moment the socket closes — they exist only inside Ello.

Full field-by-field values: [`ELLO_TOOL_CONFIG.md`](ELLO_TOOL_CONFIG.md).
Short version — both tools are `POST`, both use
`x-api-key: <ELLO_WEBHOOK_SECRET from step 1>`:

| Tool | URL | Body |
|---|---|---|
| `get_customer_history` | `https://swiftloan-api.onrender.com/api/conversations/context` | `phone` |
| `save_conversation` | `https://swiftloan-api.onrender.com/api/conversations` | `phone`, `channel`, `summary`, `outcome?` |

On Tool 1, map the response: `brief` → `conversation_history`, `known` →
`is_returning_customer`. Both are top-level in the response, so no nesting needed.

`channel` is a **fixed value per agent**, never model-chosen:

| Agent | Ello ID | channel |
|---|---|---|
| Loan_campaign_agent | `6a6c630e2f3448069caa1fe5` | `phone_outbound` |
| mobile companion app | `6a7197be89c98da763e29b22` | `mobile_app` |
| Website companion app | `6a7197ff89c98da763e29b23` | `website_widget` |
| Admin companion app | `6a71988489c98da763e29b24` | *(no tools needed)* |

**Done when:** a test conversation appears under that phone number in the
dashboard's Leads page.

---

## 4. Ello — confirm the variable syntax

**Why:** the only unverified assumption in the whole system. Ello stores prompts
verbatim and does not document its placeholder delimiter, so the prompts use
`{{variable}}` — the cross-platform convention.

**Task:** place one call and listen to the opening line.
- If it says *"Hello, is that Priya?"* — correct, nothing to do.
- If it says *"Hello, is that {{lead_first_name}}?"* — wrong delimiter. Tell me
  and I re-sync with `{single braces}`; it is a two-minute change.

**Done when:** you have heard a real call open with a real name.

---

## 5. Upshot — the India data region value

**Why:** `NEXT_PUBLIC_UPSHOT_DATA_REGION` is empty, which means **USA**. You asked
for India only. I tried to derive it and could not:

```
api.goupshot.com        → 503 (exists)
in.api.goupshot.com     → does not resolve
india.api.goupshot.com  → does not resolve
```

**Do not fire the event catalogue until this is answered.** Upshot infers each
attribute's type from the **first** event it receives, so firing into the wrong
region can leave attribute types wrong permanently, and the events would not
appear on the dashboard you are building journeys in.

**Task:** ask Upshot for the exact `dataRegion` string for your India account.
It is one word. Send it to me and I set it in one line.

**Done when:** you tell me the value.

---

## 6. Upshot — which account are the journeys in?

**Why:** three different App IDs are in play and they are not interchangeable.

| Where | App ID |
|---|---|
| Server integration config | `16471b38-…` |
| Website | `0664adf7-9c55-4a5d-833a-c5c8fd3cf3f5` |
| Mobile app | `aa5b7c7f-0ec1-4888-9bd8-35c210f0e5fb` |

Events fired from the website land in the website app; journeys built in a
different app will never see them.

**Task:** confirm which app each journey should live in — or whether they should
be unified.

---

## 7. Upshot — REST host and API key (server-side events)

**Why:** the server integration is **disabled**, `baseUrl` is empty and there is
no `apiKey` — only `appId` and `accountId`. So every stall rule that queues an
Upshot event has nowhere to send it. This is the long-standing ADM-021 blocker.

**Task:** get from Upshot:
- the REST base URL for your region (their enterprise event API)
- an API key for it

Then: Admin → Integrations → Upshot → fill in `baseUrl` and `apiKey`, and enable.

**Done when:** a stall rule fires and the queued event reaches Upshot.

---

## 8. Fire the event catalogue *(after 5 and 6)*

**Task:** open `http://localhost:4002/dev/upshot` and click once. It fires all
**26 website events** with correctly-typed attributes.

For the **23 mobile events**, plug in the handset and tell me — I run
`seedUpshotCatalogue()` from the app.

**Why it matters:** Upshot can only build a campaign against an event it has
already received. Until they land, the journeys cannot be authored.

**Done when:** all events appear in Upshot's event list.

---

## 9. SMS provider — **the real launch blocker**

**Why:** `createOtp()` says "in production this is sent via SMS", but **no SMS
sender exists anywhere in the codebase** — no Twilio, MSG91, Gupshup, Kaleyra or
Exotel. In production the OTP is generated and never delivered, so **nobody can
log in to the app at all**.

**Task**
1. Choose an Indian provider (MSG91, Gupshup and Kaleyra are the common ones).
2. Start **DLT registration** — this is a TRAI requirement and takes **days**, so
   begin it now even while other work continues. You register:
   - the sender ID (6 characters, e.g. `SWFTLN`)
   - the template, with a variable placeholder for the code
3. Send me the provider, API key and template ID; I wire it into `createOtp()`.

**Done when:** a real handset receives an OTP.

---

## 10. WhatsApp — decide the approach

**Why:** `StallRule` already accepts `whatsapp` as a channel, but nothing sends
it. Delivery is currently delegated to Upshot campaigns.

**Task:** decide — keep delegating to Upshot (needs item 7), or add a direct send
path. If direct, it needs a WhatsApp Business API provider and template approval,
which is a similar process to DLT.

---

# Summary

| # | Task | Who | Blocks |
|---|---|---|---|
| 1 | Deploy to cloud | You + me | everything |
| 2 | Ello webhook URL | Ello | outcomes, transcripts |
| 3 | Ello: 2 tools per agent | Ello | conversation memory |
| 4 | Confirm `{{var}}` syntax | Ello | one live call |
| 5 | Upshot India region | Upshot | firing events |
| 6 | Which Upshot account | Upshot | journeys seeing events |
| 7 | Upshot REST host + key | Upshot | server-side nudges |
| 8 | Fire the catalogue | You | building journeys |
| 9 | SMS provider + DLT | You | **production login** |
| 10 | WhatsApp approach | You | WhatsApp nudges |

**If you only do two things today:** item 1 (deploy) and item 9 (start DLT
registration, because it is the one with a multi-day wait).
