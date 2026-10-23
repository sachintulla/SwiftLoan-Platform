# Get Started — Ello voice agent (Ruby) in SwiftLoan

One page to get a new engineer from zero to a working voice call, with the code map and
everything we changed for Ello. Deeper references are linked at the end.

> **Ello** is the external voice-agent platform (getello). **Ruby** is the name of our assistant.
> Ello owns the conversation (model, voice, telephony, prompts in its console). **We own** identity,
> data, consent, call records, outcomes, calling-hours and spend guards.
>
> **House rule:** prompts in `prompts/*.md` are edited locally and pasted into Ello's console by
> hand. Do not push them through Ello's update API or `npm run ello:sync`.

---

## 1. The five surfaces

| Surface | Ello role | Where the code is | How it connects |
|---|---|---|---|
| Mobile app (React Native) | `companion` | `src/voice/` | Direct: `POST /api/agents/{id}/calls` → WebSocket `/ws-ello` |
| Website (Next.js) | `websiteCompanion` | `website-next/src/components/VoiceWidget.tsx`, `src/lib/voice-dom.ts`, `src/lib/ello-agent.ts` | Via our broker `POST /api/voice/session` |
| Admin dashboard | `adminNavigator` | `admin/src/lib/ello-agent.ts`, `ello-tools-admin.ts`, `components/VoiceWidget.tsx` | Via the broker |
| Outbound phone calls | `leadCallback`, `campaign` | `server/src/lib/dialer.ts`, `leadCaller.ts`, `campaignRunner.ts` | We call Ello's dial API; Ello calls our webhooks |
| Backend (all of the above) | n/a | `server/src/modules/{voice,context,conversations,webhooks,calls,campaigns}.routes.ts` | Tools + webhooks + session broker |

The legacy static site in `website/` is superseded; ignore it.

---

## 2. Run it locally (mobile)

1. **Credentials.** Copy `voiceCredentials.local.example.js` → `voiceCredentials.local.js`
   (gitignored). Set the Ello API key and the companion assistant id. The assistant id can also come
   from the shell variable `ELLO_MOBILE_APP_ASS` (inlined by `babel.config.js`).
   Without both values, `ELLO_CONFIGURED` is false and the voice button is simply hidden.
   `index.js` loads `src/config/build` first, then the credentials file, then `App`.
2. **Backend target.** `src/config/build.ts` picks `dev-api.swiftloan.ai` or the prod API via
   `API_ENV`. For local dev leave it on `'dev'`; never commit `'prod'`→`'dev'` flips by accident.
3. **Run.**
   ```sh
   npm start                 # Metro
   npm run ios               # or: npm run android
   npm test                  # Jest
   npm run typecheck
   ```
   Android debug logs: `adb logcat -s VoiceJS:D` (the `vlog` helper is compiled out of release builds).
4. **Local overrides** if the Ello backend is not on localhost: set
   `SWIFTLOAN_ELLO_API_BASE` and `SWIFTLOAN_ELLO_WS_URL` globals (defaults are
   `http://10.0.2.2:5008` / `ws://10.0.2.2:8080/ws-ello` on Android, `localhost` elsewhere).

Backend and web:

```sh
cd server && npm start                  # :4000 (needs Postgres + DATABASE_URL)
cd server && npm test                   # vitest (callOutcome, campaignSchedule, callContext, agentPhone…)
cd server && npm run seed:integrations  # seeds the Ello row from env
cd admin && npm run dev                 # :4001
```

> Ello cannot reach `localhost`. A real outbound call needs a public **https** tunnel set as the
> `webhookUrl`; `placeCall()` refuses to dial otherwise.

---

## 3. How a mobile call works

```
FAB tap (VoiceWidget.tsx)
  → refreshUserContext(): GET /context/me (1.5 s race) → account_summary
  → agent.start(phone)                              src/voice/agent.ts
      · offline check, per-call state reset
      · POST {ELLO_API_BASE}/api/agents/{assistantId}/calls   (x-api-key; sessionApi.ts)
      · open WebSocket /ws-ello → send voice-session-start { conversation_id, client_tools, page_context }
      · native mic starts: 16 kHz mono PCM16, 40 ms frames → voice-audio-input
  ← voice-audio-output (base64 PCM16) → native player
  ← client-tool-call → executeToolCall → client-tool-result
  → client-tools-update { page_context } whenever the screen changes
```

- **Native audio:** Android `VoiceAudioModule.kt` (AudioRecord `VOICE_COMMUNICATION` with AEC/NS/AGC,
  streaming AudioTrack, Bluetooth preferred on Android 12+). iOS `VoiceAudioModule.swift`
  (AVAudioEngine with voice processing).
- **Transport:** the WebSocket `ElloAgent` is the stable path. `src/voice/transports/webrtc/` exists
  but its tool-calling is unverified; don't wire it in.
- **Messages handled:** `session-established`, `voice-audio-output`, `voice-audio-stream-end`,
  `voice-audio-purge` (barge-in), `conversation-text`, `client-tool-call`, `client-tool-cancel`,
  `client-tools-ack`, `session-ended`, `error-occurred`.

---

## 4. Code map (`src/voice/`)

| File | What it does |
|---|---|
| `agent.ts` | `ElloAgent`: session lifecycle, WebSocket, audio, tool execution, `page_context` send rules |
| `tools.ts` | The registered client tools (below) and `performAction` |
| `actionRegistry.ts` | Per-screen addressable controls, `buildPageContext`, change detection |
| `screenGraph.ts` | Walks a screen's React element tree to auto-discover controls |
| `screenInfo.ts` | `screen_title` / `screen_purpose` for 24 screens |
| `sensitive.ts` | Which fields the agent may never read or type (PAN, Aadhaar, PIN, password…) |
| `nudges.ts` | Client-side tip bubble above the FAB (not a call feature) |
| `config.ts`, `index.ts` | Credentials/globals; singleton `agent` |
| `audio/nativeAudioBridge.ts`, `transport/*` | Native mic/player bridge; session REST + socket |
| `ui/VoiceWidget.tsx`, `ConfirmationSheet.tsx` | FAB + call UI; confirm modal (fails closed) |

State wiring: `src/state/store.ts` builds the full `page_context` (~lines 880–990).

### Client tools the agent can call

`read_screen`, `perform_ui_action` (generic tap / set_input / set_toggle / set_value / scroll),
`fill_field` (refuses sensitive fields), `set_checkbox`, `select_option`, `set_date` (YYYY-MM-DD,
rejects invalid or under-18), `set_loan_amount`, `set_tenure`, `set_interest_rate`, `continue_next`,
`go_back`, `logout` (needs confirmation), `navigate_screen` / `navigate` (blocked during sign-in
screens), `open_loan`, `set_language` (agent speech), `set_app_language` (UI), `save_applicant_details`.

Safety built into the tools: tapping anything labelled "Skip" opens a confirmation sheet; results
report what the app *actually* did (`screen_after`, `navigated`, toast text, `controls_now`);
handlers run strictly one at a time; tools are declared once, on the first update of a call.

### What `page_context` carries

`page`, `screen_title`, `screen_purpose`, `screen_overview`, `available_actions` (kind, label, group,
state), `preferred_language` (UI) and `agent_language` (voice) kept separate, `user_name`,
`authenticated_phone`, `heard_intro_pitch`, `already_introduced`, `account_summary`
(has_history, name/DOB on file, application status/offers_ready/lenders), `offers_summary`,
`savedApplicantDraft`, and `api_context` one-shots (handoff result, offer apply result, lender web
flow, last toast, PAN validation, prequalify result). No PAN, income or address is ever included.

Send rules: debounce 900 ms (2.5 s on Home, which sends buttons only); deferred while the agent is
speaking (a mid-sentence update acts as a barge-in); **urgent** updates coalesce in 120 ms
(OTP success/fail, PAN save, offers ready, handoff); **immediate** flush after a tool result.
Unchanged content is not re-sent.

---

## 5. Server side: what Ello calls

Auth for tool routes: `x-api-key` or `x-webhook-secret` (an admin-minted `swk_…` key or the env
secret). **Webhook routes accept the env secret only.**

| Endpoint | Ello tool / event | Purpose |
|---|---|---|
| `POST /api/context/lookup` | `get_user_context` | Profile, draft, application status, offers, loan by phone |
| `POST /api/context/save` | `save_applicant_context` | Write applicant fields by phone (no PAN; 18+ DOB enforced) |
| `POST /api/conversations/context` | `get_customer_history` | Rolling brief, lead and calling purpose |
| `POST /api/conversations` | `save_conversation` | Save transcript/summary/outcome (idempotent) |
| `POST /api/webhooks/ello/call-outcome` | call.started / completed / processed / recording | Call lifecycle |
| `POST /api/webhooks/ello/call-outcome-report` | `report_call_outcome` | Authoritative outcome |
| `POST /api/voice/session` | (web/admin) | Session broker; only `websiteCompanion`, `companion`, `adminNavigator` allowed |
| `GET /api/context/me`, `POST /api/context/me/conversation` | (mobile) | Same data via the user's JWT |

**Outbound:** `placeCall()` → `CallAttempt(queued)` → Ello `POST /api/agents/{id}/calls` with
`context_data` (user_name, phone, conversation_history, agent_purpose, stall_*). Callers: lead
auto-caller (60 s tick, 09:00–21:00 IST, hourly cap, 24 h cooldown), immediate "call me now"
callback (20 s first attempt, 3 tries), stall rules (voice rules seeded disabled), Upshot
trigger-call, admin manual trigger. Campaigns hand a CSV to Ello's native dialler.

**Outcome precedence:** agent-reported outcome > machine status > keyword inference
(inferred values are worded "not confirmed" and never overwrite an agent value).
A reconcile sweep (every 10 min) closes calls stuck for 30+ min as `failed`.

Agent roles are resolved in `server/src/lib/agents.ts` (dashboard setting → `ELLO_AGENT_<ROLE>` env
→ default). Ello config (API key, webhook URL, assistant id) lives in the `IntegrationConfig` row
and is edited at `/api/admin/integrations`.

Env var names (values never in git): `ELLO_API_KEY`, `ELLO_WEBHOOK_SECRET`, `CONVERSATION_API_KEY`,
`ELLO_AGENT_LEAD_CALLBACK|CAMPAIGN|COMPANION|WEBSITE_COMPANION|ADMIN_NAVIGATOR`,
`LEAD_CALL_*`, `IMMEDIATE_CALLBACK_*`, `STALL_CALL_*`, `DEBUG_HTTP_LOGS`;
web/admin: `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_ELLO_WS_URL`.

---

## 6. Prompts (`prompts/`)

| File | Assistant |
|---|---|
| `ello-inapp-copilot-prompt.md` | **Current** in-app Ruby (mobile, role `companion`) |
| `ello-companion-prompt.md` | Older copy of the in-app prompt (superseded) |
| `ello-website-next-navigator-prompt.md` | Website guide (stale, see §9) |
| `ello-admin-navigator-prompt.md` | Admin navigator |
| `ello-outbound-prompt.updated.md` | Outbound phone Ruby |
| `website-agent-prompt.md` | `Loan_campaign_agent` (lead callbacks + campaigns) |
| `ELLO_SETUP_CHECKLIST.md` | Console-only settings that are not in the prompt |

Console checklist (manual): remove `continue_next` from the permissions per-turn instruction; tune
Gemini Live VAD (low start sensitivity, 500–800 ms silence, less sensitive barge-in); make sure
"Agent next turn instruction" lines are logged, not spoken; paste the current prompt and keep the
privacy policy (v1.1) in knowledge. Native Mode (Gemini Live) is required for tools to work.

---

## 7. What we changed for Ello (chronological)

### Mobile voice layer
| Date | Commit | Change |
|---|---|---|
| 08-28 | ac65c99d | `set_language`: the voice speaks the user's chosen language |
| 09-01 | 0a77ac17 | Closed four gaps where the agent couldn't see UI state; split UI language vs agent language |
| 09-01 | c8ae2f1f, 9d4a1478 | Live lender web-flow status streamed to and narrated by the agent |
| 09-02 | d534615b | 900 ms debounce, per-screen dedup, speaking-guard (updates no longer barge in) |
| 09-02 | c4293d13 | `urgent` context path; scripted wait on the finding screen |
| 09-02 | 94bd0573 | Profile fields exposed; marketing copy hidden (`VoiceHidden`) |
| 09-03 | 7d2a74c9, 55da70ad | `heard_intro_pitch`; first turn generic (later superseded) |
| 09-03 | 2c966856 | `save_applicant_details`: persist details gathered before an application exists |
| 09-04 | 744d883b | Tools array sent only on a call's first update |
| 09-08 | a90b0194 | Caller's phone sent to Ello at call start |
| 09-09 | c613684a | Urgent path for OTP verify / retry eligibility / PAN save; 120 ms coalescing |
| 09-10 | 81d1e194 | Bluetooth-preferred audio routing, `set_app_language`, session guard |
| 10-01 | 21b74ba4 | Live checkbox/chip/slider state, one-at-a-time tool queue, toast mirroring, Compare data, Skip needs confirmation, tip bubble |
| 10-06 | e110032a | `screen_title` / `screen_purpose` for every screen |
| 10-06 | 13c68bc1 | "select Telugu" resolves to native-script language cards; OTP screen no longer read aloud |
| 10-06 | 5e3ef5ae | Android playback/AGC fixes, full state at call start, `account_summary`, Home sends buttons only, new line cuts old audio, "(No speech)" marker cut |

### Backend
| Date | Commit | Change |
|---|---|---|
| 08-04 | 1134fe0a | Agent roles |
| 08-17 | 6ed54420 | No silent localhost `webhookUrl` default (calls were stuck at `dialing`) |
| 08-24 | bfa3dd8f, de361330 | Campaigns moved to Ello's native dialler; webhook correlation |
| 09-08 | ad78d1f4, 7133f62a | `/api/context/lookup`; accepts `phone_number` (Ello resolves placeholders by key) |
| 09-08 | b633e844, a833fa40 | Own 120/min limit for lookup; trust proxy so limits key on real client IP |
| 09-09 | efb44e0d | `POST /api/context/save` (API-key twin of `PATCH /users/me`) |
| 09-10 | 1682c62e | Removed internal CRM fields and cross-channel history from the customer-facing context |
| 10-06 | b54f4ede | Tolerate an unfilled `{context_data.phone_number}` template and phone-only saves (200, not 400) |

### Prompts (all 2026-10-06 unless noted)
`0031fd9c` replaced the old copilot prompt with the "In-App Voice Assistant"; `d3215124` guards for
injected instructions and noise; `194362b8` trimmed duplicated rules; `f38603ed` Gemini Live
noise/echo checklist; `669b43fe` always answer "are you there?"; `9b289a1b` opening by customer type.

### Uncommitted in the working tree (this branch)
- **`src/voice/agent.ts`, `src/state/store.ts`, `__tests__/agentAudioLines.test.ts`:** new
  `already_introduced` flag. The agent records when it has spoken a line on a signed-in screen
  (ignoring sign-in screens, "(No speech)" markers and the user's own words), and the store sends
  it in `page_context` so coming back to Home is not treated as a new opening. Two new tests.
- **`prompts/ello-inapp-copilot-prompt.md`:** scripted lines become "say it in your own words in
  `agent_language`"; language lock ("OTP" heard as "Hindi" must not switch language);
  silence-nudge and stay-silent-on-return rules; "start from what is already done" (never re-ask
  filled fields; ask once if a language is already picked); Opening C rewritten: name and DOB
  first, then the application check from `account_summary`; no pincode/address on Home.
  This partly supersedes `9b289a1b`. **Paste it into Ello by hand.**
- **Not Ello-related, don't commit by accident:** `src/config/build.ts` (`API_ENV` `'prod'`→`'dev'`),
  `package.json` (version 1.1.8→1.0.1), untracked `android/app/src/main/res/{drawable-mdpi,raw}/`.

---

## 8. Tests

`npx jest __tests__/agentAudioLines.test.ts` (audio line cuts, `already_introduced`),
`voice.test.tsx` (UC-V1–V15), `voiceCallFixes.test.tsx`, `aboutYouVoiceTools.test.tsx`,
`liveCallContext.test.tsx` (renders the real app with a fake socket and asserts every
`page_context` sent), `screenInfo.test.ts`, `homeButtonsOnly.test.ts`, `nudges.test.ts`,
`compareAgent.test.ts`. Server: `npm test` in `server/`. Gaps: no dedicated tests for
`VoiceWidget`/`ConfirmationSheet`, and no end-to-end test of `already_introduced` through the store.

---

## 9. Known gaps and things to verify

1. The in-app prompt references `save_applicant_context`, but the client registers
   `save_applicant_details`. It may exist as a server-side Ello tool; confirm in the console.
2. `ello-website-next-navigator-prompt.md`, `VOICE_TESTING.md` and `.env.local.example` still
   describe removed web tools (`fill_name`, `fill_email`, `give_consent`, `track_application`…) and
   env vars the code no longer reads. Current web tools: `navigate_to_page`, `go_to_section`,
   `fill_phone`, `select_loan_type`, `set_loan_amount`, `submit_application`,
   `reset_application_form`, `set_calculator`, `get_calculator`, `set_language`, `answer_faq`.
3. `website-agent-prompt.md` lines ~223–227 contain a pasted export of call rows (phone number,
   UUIDs). Looks accidental; clean it.
4. `.github/workflows/deploy*.yml` still pass `NEXT_PUBLIC_ELLO_API_KEY`/`_ASSISTANT_ID` build args.
   Check they are dead leftovers.
5. The mobile bundle carries the Ello key (`voiceCredentials.local.js`) and can be extracted from an
   APK. Confirm what production builds inject.
6. `docs/AGENT_API.md` §2.1 still lists `conversationBrief`/`stage` (removed in 1682c62e);
   `docs/ELLO_CAMPAIGN_INTEGRATION.md` uses example paths that differ from the real ones
   (real: `/api/webhooks/ello/call-outcome`, `swiftloan_call_id`).
7. `SupportSheet.tsx` appears unused; `ONBOARDING_SCREENS` is duplicated in `agent.ts` and
   `tools.ts` (one omits `splash`).
8. Android emits no `onAudioLevel`, so the talking animation may not react there. Verify on a device.
9. Server env: Ello variables are missing from `server/.env.example`.

---

## 10. Further reading

`docs/ELLO_INTEGRATION_GUIDE.md` (React Native how-to), `docs/ELLO_TOOL_CONFIG.md` (per-agent tool
config), `docs/AGENT_API.md`, `docs/CONVERSATION_MEMORY_API.md`, `docs/ELLO_WEBHOOK_API.md`,
`docs/ELLO_CAMPAIGN_INTEGRATION.md` (27 lessons learned), `docs/BUILD_YOUR_OWN_VOICE_AGENT.md`
(Gemini-direct alternative), `prompts/ELLO_SETUP_CHECKLIST.md`.
