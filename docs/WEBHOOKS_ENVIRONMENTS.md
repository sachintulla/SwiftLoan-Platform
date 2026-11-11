# Partner webhooks — per-environment runbook (Aurix/KFT, Yubi)

Inbound partner webhooks must be kept **separate per environment** so a develop
(UAT) lender can never write status onto production loans, and vice versa.
Separation rests on three things, all of which must hold for each environment:

1. a **distinct public callback URL** (dev host vs `api.swiftloan.ai`),
2. a **distinct webhook secret** in that box's `server.env`, and
3. the partner posting the UAT instance to the dev URL and the production
   instance to the prod URL.

## Endpoints (fixed, public)

| Partner | Path | Auth env var | Fail-closed in prod? |
|---|---|---|---|
| Aurix / Knight Fintech | `/api/webhooks/aurix` (alias `/api/webhooks/kft`) | `KFT_WEBHOOK_SECRET` (or legacy `AURIX_WEBHOOK_SECRET`) | ✅ yes — 503 when unset in production |
| Yubi / YMPL | `/api/webhooks/yubi` | `YUBI_WEBHOOK_SECRET` | ✅ yes — 503 when unset in production |

In **development** (`NODE_ENV !== production`) an unset secret is accepted with a
warning, so a local box can be exercised without one. In **production** an unset
secret rejects every post (503) — a missing secret is a misconfiguration, not an
open door. Each environment must set its **own** secret value; never share one
secret across dev and prod.

## Per-environment matrix (fill in real values per box, keep secrets in `server.env` only)

| Environment | `NODE_ENV` / `APP_ENV` | Public base (`PUBLIC_BASE_URL`) | Aurix lender instance | Yubi instance | Secrets live in |
|---|---|---|---|---|---|
| Develop / UAT | development (or `APP_ENV=develop`) | dev box host | Aurix **UAT** | Yubi **UAT/staging** | dev box `~/secrets/server.env` |
| Production | production | `https://api.swiftloan.ai` | Aurix **production** | Yubi **production** | prod box `~/secrets/server.env` |

The two `*_WEBHOOK_SECRET` values MUST differ between the rows above.

## What to register with each partner

- **Aurix / KFT:** register the UAT instance's status callback to
  `<dev base>/api/webhooks/aurix`, and the production instance's callback to
  `https://api.swiftloan.ai/api/webhooks/aurix`. Confirm with KFT that two
  callback URLs (one per instance) are supported.
- **Yubi / YMPL:** `YUBI_RETURN_URL` and the status webhook are env-driven the
  same way — register the UAT referrer/webhook to the dev host and the
  production referrer/webhook to `api.swiftloan.ai`.

## How to tell which environment a webhook landed on

Every receipt log now carries an environment tag (`lib/webhookEnv.ts`):

```
[aurix-webhook] received { env: "production", host: "api.swiftloan.ai", requestId, state, status, leadId, ... }
[yubi-webhook]  received { env: "develop",    host: "<dev host>", ... }
```

If a payload meant for one environment shows the wrong `host`, a callback URL is
mis-registered with the partner — fix it in the partner portal, not in code. A
run of `no matching application` warnings right after a lender goes live is the
usual symptom of a UAT callback pointing at prod (or the reverse).

## Scheduled status poller (safety net for missed webhooks)

Webhooks are the primary status channel, but the in-process `status-poll` job
(`lib/statusPoller.ts`, every 10 min, 9am–7pm IST, throttled per
`status.pollEveryMinutes`) pulls the live status for in-progress Aurix leads
(`handoff` / `under_review` with a `leadId`) via the same `refreshApplicationStatus`
used by the admin "Pull latest status" button, and polls Yubi referrals too. So a
dropped webhook is reconciled on the next poll. Window and interval are editable
in **Admin → Timings** without a deploy.

## Checklist when standing up / verifying an environment

- [ ] `KFT_WEBHOOK_SECRET` set and **different** from the other environment's.
- [ ] `YUBI_WEBHOOK_SECRET` set and **different** from the other environment's.
- [ ] `PUBLIC_BASE_URL` points at this environment's own host.
- [ ] Aurix UAT callback → dev URL; Aurix prod callback → prod URL (confirmed in portal).
- [ ] Yubi UAT webhook → dev URL; Yubi prod webhook → prod URL (confirmed in portal).
- [ ] A signed test post to `/api/webhooks/aurix` returns 200; an unsigned one returns 401 (prod) / 503 if the secret is unset.
- [ ] Receipt log shows the expected `env` / `host` tag.
