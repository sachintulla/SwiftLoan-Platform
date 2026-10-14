# SwiftLoan ← Yubi (YMPL) referral status webhook

Yubi calls this endpoint when a referral created through the Indiamart-referrer API
(`POST /api/v1/referral`) changes journey stage, so SwiftLoan can show the applicant's
real progress.

## Endpoint

```
POST https://<swiftloan-api-host>/api/webhooks/yubi
Content-Type: application/json
```

Production host: `https://api.swiftloan.ai` · Dev host: `http://dev-api.swiftloan.ai`
(confirm before sharing — the base URL is deployment-specific).

## Authentication

SwiftLoan issues a shared secret (`YUBI_WEBHOOK_SECRET`). Send it in **one** of:

| Header | Value |
|---|---|
| `x-webhook-secret` | the secret |
| `x-api-key` | the secret |
| `Authorization` | `Bearer <secret>` |
| `x-yubi-signature` | HMAC-SHA256 of the raw request body, keyed with the secret (hex or base64, optional `sha256=` prefix) |

Wrong or missing credentials → `401`.

## Payload

Fields may be at the top level or under `data`, camelCase or snake_case.

```json
{
  "clientReferralId": "6f1c0a52-…",   // the id SwiftLoan sent on Create Referral (preferred match key)
  "ymplReferralId":   "YMPL-123",     // used if clientReferralId is absent
  "journeyStatus":    "NEW_LEAD",     // stored as-is
  "lender":           "Example Bank"  // optional
}
```

At least one of `clientReferralId` / `ymplReferralId` is required.

## Responses

| Status | Meaning |
|---|---|
| `200` `{"success":true,"data":{"matched":true,…}}` | Referral found and updated |
| `200` `{"success":true,"data":{"matched":false}}` | Authenticated, but no referral matched or no id sent. **Do not retry.** |
| `401` | Bad secret / signature |
| `429` | Rate limited (240 requests/min) |
| `503` | Webhook not configured on our side |

## Notes

- The payload shape above is SwiftLoan's assumption, based on the field names in Yubi's
  Get Status API. Yubi: tell us if your events differ and we will adjust the parser.
- Posts are idempotent — re-sending the same status is harmless.
