# SwiftLoan Slack Assistant — setup

A two-way Slack bot you can **@mention** to ask about the business in plain English:

> **@SwiftLoan** how many downloads today?
> **@SwiftLoan** how many users do we have?
> **@SwiftLoan** what dashboards do we have?

It answers from live metrics via Claude. **Read-only** — it only looks up aggregate numbers and dashboard links; it never changes anything and never exposes anyone's personal data.

This is separate from the one-way **daily 7 AM snapshot** (`SLACK_SNAPSHOT_WEBHOOK`), which stays as-is.

---

## What it can answer today
- Downloads, users, leads, applications (+ worth ₹), offers, approvals, disbursals (+ amount ₹), application→disbursal conversion %, Meta ad spend (₹0 until wired) — each as **total** and **today** (since midnight IST).
- "What dashboards do we have?" → the admin dashboard list with links.

More lookups (per-stage, by lender, message/call stats, find-by-phone, date ranges) are easy to add as new tools in `server/src/lib/slackBot.ts`.

---

## 1. Create the Slack app
1. Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**. Name it (e.g. "SwiftLoan"), pick your workspace.
2. **OAuth & Permissions** → Bot Token Scopes → add:
   - `app_mentions:read` (hear @mentions)
   - `chat:write` (post replies)
   - *(optional)* `im:history` + `im:read` if you also want to DM it directly.
3. **Install to Workspace** → copy the **Bot User OAuth Token** (`xoxb-…`).
4. **Basic Information** → copy the **Signing Secret**.

## 2. Point Slack at our server
1. **Event Subscriptions** → toggle **On**.
2. **Request URL**: `https://api.swiftloan.ai/api/slack/events`
   - Slack sends a one-time challenge; our endpoint answers it automatically, so it should show **Verified** once the env vars below are set and the server is redeployed.
3. **Subscribe to bot events** → add `app_mention` (and `message.im` if you enabled DMs).
4. Save. Reinstall the app if Slack prompts.
5. Invite the bot to the channel: in Slack, `/invite @SwiftLoan`.

## 3. Set the server env (prod `~/secrets/server.env`)
```bash
SLACK_BOT_TOKEN=xoxb-...          # from step 1.3
SLACK_SIGNING_SECRET=...          # from step 1.4
ANTHROPIC_API_KEY=sk-ant-...      # the model that answers
# SLACK_BOT_MODEL=claude-opus-5-5 # optional; e.g. claude-haiku-5-5 to cut cost
```
Then **recreate the server container** (env is read at container-create).

## 4. Test
In the invited channel: `@SwiftLoan how many downloads today?` → it replies in a thread.

---

## How it works (for maintainers)
- **Endpoint:** `POST /api/slack/events` (`modules/slackBot.routes.ts`). Verifies Slack's signature over the raw body (`lib/slackVerify.ts`, 5-min replay window), answers the URL-verification challenge, **acks within 3s**, then answers asynchronously and posts back with `chat.postMessage` (threaded). Slack retries and the bot's own messages are ignored (no loops).
- **Brain:** `lib/slackBot.ts` runs a short Claude tool loop with two read-only tools — `get_metrics` (reuses the daily-snapshot `gatherSnapshot()`) and `list_dashboards`. Amounts are whole rupees, formatted Indian-style.
- **Off by default:** no `SLACK_BOT_TOKEN`/`SLACK_SIGNING_SECRET` → the endpoint returns 503 and nothing runs.
- **Cost:** one Claude call (plus a tool round-trip) per question. Default model Opus 5.5; set `SLACK_BOT_MODEL=claude-haiku-5-5` for a much cheaper bot.
