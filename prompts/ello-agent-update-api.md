# Ello — Update Assistant Prompt API (staging)

Reference notes for updating an Ello voice assistant's config via the Ello API.
Discovered by trial against the **staging** environment on 2026-07-31.

## Endpoint

```
PUT https://api-stage.getello.ai/api/agents/{agentId}
```

- Method **must** be `PUT` — `POST` and `PATCH` both 404 on this route.
- `{agentId}` is the Mongo `_id` of the assistant (e.g. `6a4e103f467f3a4c91b06485`).

## Auth

Header must be `x-api-key`, **not** `Authorization: Bearer ...` — that returns
`401 Unauthorized access`. `api-key` / `apikey` also fail.

```
x-api-key: <ELLO_API_KEY>
```

Never commit the actual key value to source control. Store it in an untracked
`.env` (e.g. `admin/.env.local`, `NEXT_PUBLIC_ELLO_API_KEY`) or your shell
environment, and reference it from there.

## Request body

```json
{
  "type": "hybrid",
  "prompt": "You are a helpful AI assistant focused on providing accurate and friendly responses"
}
```

- `type`: assistant type (`hybrid` in this example — see the response's
  `nativeConfig`/`native_mode` fields for what changes with other types).
- `prompt`: the assistant's system prompt. This is the only field this
  particular call updates — all other assistant config (voice, guardrails,
  greeting, tools, etc.) is left untouched and simply echoed back in the
  response.

## Example call

```bash
curl -s -X PUT "https://api-stage.getello.ai/api/agents/6a4e103f467f3a4c91b06485" \
  -H "x-api-key: $ELLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"hybrid","prompt":"You are a helpful AI assistant focused on providing accurate and friendly responses"}'
```

## Successful response

`200 OK`

```json
{
  "status": 200,
  "message": "Assistant (simple) updated successfully",
  "data": {
    "_id": "6a4e103f467f3a4c91b06485",
    "workspaceId": "6970c2f3948cfbce1932d99d",
    "userId": "6970c2f3948cfbce1932d99c",
    "name": "Test Live",
    "type": "hybrid",
    "prompt": "You are a helpful AI assistant focused on providing accurate and friendly responses",
    "...": "full assistant document — voiceConfig, llmConfig, sttConfig, guardrailsConfig, greeting_config, nativeConfig, etc. — all unchanged from before the update"
  }
}
```

## Error responses seen while probing this endpoint

| Attempt | Response |
|---|---|
| `PATCH /api/agents/{id}` | `404` — `Cannot PATCH /api/agents/{id}` |
| `POST /api/agents/{id}` | `404` — `Cannot POST /api/agents/{id}` |
| `PUT` with `Authorization: Bearer <key>` | `401` — `{"status":401,"message":"Invalid Token"}` |
| `PUT` with header `api-key` / `apikey` | `401` — `{"status":401,"message":"Unauthorized access"}` |
| `PUT` with header `Authorization: <key>` (no `Bearer`) | `401` — `{"status":401,"message":"Unauthorized access"}` |
| `PUT` with header `x-api-key: <key>` | `200` — success |

## Environments

| Env | Host |
|---|---|
| Staging | `https://api-stage.getello.ai` |
| Production (India) | `https://api-in.getello.ai` |

Same route/method/auth shape is expected to apply to production — swap the
host only.

## Related

- [`prompts/ello-admin-navigator-prompt.md`](ello-admin-navigator-prompt.md) —
  the actual SwiftLoan Admin Dashboard navigator system prompt (to be sent as
  the `prompt` field for the real admin-navigation assistant, as opposed to
  the generic placeholder text used above for connectivity testing).
- [`admin/.env.local.example`](../admin/.env.local.example) — where
  `NEXT_PUBLIC_ELLO_API_KEY` / `NEXT_PUBLIC_ELLO_ASSISTANT_ID` /
  `NEXT_PUBLIC_ELLO_API_BASE` are configured for the admin dashboard's voice
  widget.
</content>
