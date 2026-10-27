# Notify API — `POST /api/notify`

> **Machine-readable spec:** [`docs/notify-openapi.json`](./notify-openapi.json) (OpenAPI 3.0) — import it into Swagger UI / Postman / Insomnia for ready-made requests.

One channel-agnostic endpoint to send a transactional notification (**SMS** or
**WhatsApp**) to a single customer. Serves two callers with one contract:

- **Admin dashboard** — "pick a customer, send a message" (admin bearer JWT).
- **Third parties such as Ello** — e.g. a post-call summary pushed to the
  customer (an `x-api-key` minted in the dashboard).

It reuses the existing send plumbing (`sendWhatsAppText`/`sendWhatsAppTemplate`,
`sendVoxSms`), so every send is recorded in **MessageDelivery** (visible in
**Admin → Messages**) and respects the same **do-not-contact** guard as voice /
WhatsApp outreach. Source: `server/src/modules/notify.routes.ts`.

## Auth (either one)

| Caller | Header |
|---|---|
| Admin dashboard | `Authorization: Bearer <admin access token>` |
| Ello / third party | `x-api-key: <key>` |

API keys are minted in the dashboard (`POST /api/admin/api-keys`, see
`apiKeys.routes.ts`) and are revocable per-caller. The legacy
`CONVERSATION_API_KEY` / `ELLO_WEBHOOK_SECRET` env value is also accepted, so an
existing Ello tool config keeps working.

## Request

`POST /api/notify`  ·  `Content-Type: application/json`

| field | type | notes |
|---|---|---|
| `customerId` | string | Target by id **or** `phone` (one is required). |
| `phone` | string | 10-digit Indian mobile; a lead row is resolved/created if needed. |
| `channel` | `"sms" \| "whatsapp" \| "auto"` | Default `"auto"` = WhatsApp, fall back to SMS if WhatsApp can't be sent. |
| `text` | string | Free text (≤4096). **Required unless** `templateName` is given. |
| `templateName` | string | Approved WhatsApp template name, or the DLT-registered SMS template id. |
| `language` | string | WhatsApp template language (e.g. `"en"`). |
| `placeholders` | string[] | WhatsApp template body variables, in order. |
| `kind` | string | Tag shown in Admin → Messages (e.g. `"post_call_summary"`). |

> **India SMS is DLT-regulated:** a free-text SMS body only delivers when it
> matches the template registered under `templateName`; otherwise the carrier
> drops it. For WhatsApp-initiated (business) messages use `templateName`;
> `text` is only valid inside the 24-hour customer-service window.

## Response

```jsonc
// 200 — accepted by the gateway
{ "success": true,
  "message": "Notification sent",
  "data": { "messageId": "wamid.…", "channel": "whatsapp", "status": "sent", "customerId": "cus_…" } }
```

Errors use the standard envelope `{ success:false, data, message, error }`:
`400` bad/missing phone or body, `401` no valid auth, `404` unknown `customerId`,
`409` customer is do-not-contact, `502` the gateway rejected the send (the
attempted `channel` + error are in `data`).

Poll delivery (`queued → sent → delivered → read`, or `failed`) in
**Admin → Messages** / `GET /api/admin/messages`.

## Examples

Admin — WhatsApp template to a selected customer:
```bash
curl -X POST "$BASE/api/notify" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"customerId":"cus_123","channel":"whatsapp","templateName":"offers_ready","language":"en","placeholders":["Sachin","https://swiftloan.ai/app"]}'
```

Ello — post-call summary to the customer (auto channel):
```bash
curl -X POST "$BASE/api/notify" \
  -H "x-api-key: $ELLO_KEY" -H 'Content-Type: application/json' \
  -d '{"phone":"9876543210","channel":"auto","kind":"post_call_summary",
       "text":"Hi Sachin, following up on our call: your ₹2,00,000 offer at 18% is ready. Reply or tap the app to continue."}'
```
