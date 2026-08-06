# Plan: unified customer journey (website → voice → app → admin)

Status: **plan only, nothing built**. Written 2026-07-31 against commit `e2b2cc1`.
Every file/line reference below was verified against the code at that commit.

This is the implementation plan for the "SwiftLoan - Customer Journey & Admin
Dashboard Requirements" brief. It deliberately does **not** restate that brief —
it maps each requirement onto what already exists, names the gaps, and sequences
the work. Read the brief first; read this to know what to actually type.

---

## 1. The one architectural problem to solve first

Everything in the brief — the timeline, drop-off detection, "where did this
customer come from", re-engagement — reduces to a single missing thing:

> **There is no identity spine. Nothing in the system represents "a customer"
> across channels.**

Today there are three disjoint identity islands:

| Island | Keyed by | Created when | Table |
|---|---|---|---|
| Website enquiry | `phone` (nullable string) | lead form submit | `AnonymousLead` (`schema.prisma:411`) |
| Anonymous app usage | `sessionId` | app boot | `Session` (`:345`), `ActivityEvent.sessionId` (`:361`) |
| Authenticated user | `userId` | OTP verify | `User` (`:47`), `ActivityEvent.userId` |

`ActivityEvent` has **both** `sessionId` and `userId` as *independent nullable
strings with no FK to User* (`:362-363`). Pre-login events carry a `sessionId`
and a null `userId`; post-login events carry a `userId`. **Nothing ever
back-fills the `userId` onto the earlier events in that same session.** So the
moment a customer logs in, their own prior activity becomes permanently
unattributable to them — which is precisely the "complete chronological
timeline" the brief asks for.

The existing admin timeline endpoint shows the consequence: `GET
/api/admin/loans/:id` builds its timeline from `ActivityEvent` filtered by
`userId` only (`admin.routes.ts:192-195`), so it can never show anything the
customer did before logging in, and never anything from the website at all.

The lead→user bridge built for the website-handoff feature
(`auth.routes.ts:85-98`) is the **first instance** of the stitching this plan
generalises. Do not build a second, parallel mechanism — extend that one.

### The fix: `Customer` + `JourneyEvent`

Add one identity row per human, and make every event point at it.

```prisma
model Customer {
  id            String   @id @default(uuid())
  phone         String?  @unique      // the natural join key across all channels
  userId        String?  @unique      // set at OTP verify; FK-less like existing convention
  firstSource   String                // website | campaign | app | phone_call — never overwritten
  firstSeenAt   DateTime @default(now())
  lastActivityAt DateTime @default(now())   // drives drop-off + re-engagement
  currentStage  String                // see stage vocabulary below
  stageEnteredAt DateTime @default(now())
  campaignId    String?
  events        JourneyEvent[]
  @@index([currentStage, lastActivityAt])   // the re-engagement scan
  @@index([lastActivityAt])
}

model JourneyEvent {
  id          String   @id @default(uuid())
  customerId  String
  customer    Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  channel     String   // website | voice | app | campaign | admin | system
  name        String   // canonical event name — see vocabulary below
  stage       String?  // stage this event moved the customer INTO, if any
  screen      String?
  metadata    Json?
  occurredAt  DateTime @default(now())
  @@index([customerId, occurredAt])
  @@index([name, occurredAt])
}
```

Both are **additive** — no existing model changes, satisfying the brief's "do
not modify existing code or core functionality unless required".

`ActivityEvent` stays exactly as-is and keeps serving the existing analytics
pages. `JourneyEvent` is the *narrative* layer (what a human reads on a customer
record); `ActivityEvent` remains the *telemetry* layer (counts, charts, live
feed). Do not try to merge them — they have different cardinality, different
retention pressure, and different consumers. Write to both from one place
(§3.1) so they cannot drift.

### Stage vocabulary (single source of truth)

Define once in `server/src/lib/journey.ts` and import everywhere — the existing
code's habit of free-text `eventName`/`stepName` strings
(`schema.prisma:365,392`) is what makes the current funnel un-queryable.

```
lead_captured → contacted → app_installed → registered → eligibility_checked
→ offers_viewed → offer_selected → kyc_started → kyc_completed
→ application_submitted → approved | rejected | disbursed
                                              ↘ lost
```

---

## 2. Gap analysis against the brief

### 2.1 Events — mostly present but semantically wrong

The brief lists 14 mobile events. Current emission is **screen-arrival-driven**,
not action-driven — all of it in `src/state/store.ts:269-279`, keyed off two
maps at `:119-128`. That distinction matters: "OTP Verified" currently fires
when the user *lands on* the OTP screen (`ONBOARDING_STEPS.otp = 3`), i.e. before
they have entered anything. Any drop-off metric built on today's events is wrong.

| Brief event | Today | Work needed |
|---|---|---|
| App Installed | **missing** — nothing writes `AppDownload` in prod (only `seed.ws4.ts:237`) | new endpoint + call from first app open |
| App Opened | partial — `trackSessionStart` (`store.ts:251`), unnamed | emit named event |
| Language Selected | **wrong semantics** — fires on screen arrival, value not captured | move to the selection handler, include the language |
| OTP Requested | **missing** | emit in `requestOtp` call site |
| OTP Verified | **wrong semantics** — arrival, not success | move into `mobile.tsx` verify success branch |
| Eligibility Started | present (`prequalify_started`) | re-point to `JourneyEvent` |
| Eligibility Completed | **missing** | emit on offers-ready |
| Offer Viewed | present (`offers_viewed`) | add offer ids to metadata |
| Offer Selected | present but proxied by `handoff` arrival, no offer id | emit on actual selection, include offerId/apr/partner |
| KYC Started | present (`kyc_started`) | — |
| KYC Completed | **missing** — `kyc_submitted` fires 4× on arrival at each sub-screen | emit once on completion |
| Application Submitted | present (arrival at `status`) | move to submit success |
| Loan Approved | **missing** | server-side emit (§3.2) |
| Loan Rejected | **missing entirely** | server-side emit (§3.2) |

**Also missing: the website emits no events at all.** `website-next` only POSTs
`/api/context/create` (`SiteScripts.tsx:329-361`). "Website Visit" — the first
node in the brief's timeline — is not recorded anywhere.

### 2.2 Campaigns — a two-string stub, effectively greenfield

`campaignId String?` exists on `AnonymousLead` (`:419`) and `AppDownload`
(`:438`), and the admin UI *displays* it (`leads/page.tsx:51`,
`leads/[id]/page.tsx:85`, `downloads/page.tsx:51`). But:

- there is **no `Campaign` model**, no CRUD, no list/analytics API, no UI page,
  no nav entry (`Shell.tsx:12-35`);
- **nothing in production code ever writes `campaignId`** — the only writer is
  the seeder (`seed.ws4.ts:227`). `/api/context/create` never sets it
  (`context.routes.ts:45-51`);
- there is **no `utm_*` ingest** anywhere. `backend-prompt.txt:97,120` proposes
  `utmCampaign` fields; never implemented.

So campaigns need: a model, UTM capture on the website, CRUD + analytics API,
and a dashboard page. Treat as new build, not an extension.

### 2.3 Outbound voice call — entirely greenfield, and the riskiest item

The brief wants an automated call ~1 minute after website form submit. Today:

- The Ello integration is **in-page mic only** — browser/RN WebSocket audio.
  `src/voice/transport/sessionApi.ts:22-44` posts `agent_type: 'webcall'` with
  no phone-number field. Its `call_type: 'outbound'` is Ello's term for a
  *user-initiated web* call — **it is not PSTN**. This is easy to misread; it
  does not give us telephony.
- **No telephony provider at all** — no Twilio/Exotel/Plivo/Vapi/Retell in any
  `package.json`.
- **No outbound HTTP egress from the backend whatsoever** — grep for `fetch(` in
  `server/src` returns nothing. There is no webhook infrastructure to build on.
- `website/prompts/voice-agent-outreach.md` is a fully-written outbound-call
  system prompt with runtime variables — **documentation only, nothing reads or
  executes it**.

This item is blocked on a vendor decision (§5) and should not be sequenced early.

### 2.4 Re-engagement — the job runner exists, the egress does not

`server/src/jobs/tracking.jobs.ts` already has the scheduling skeleton:
BullMQ when `REDIS_URL` is set, in-process `setInterval` fallback
(`:100-128`), plus `notifyOnce()` dedup (`:18-22`). Three detectors run
(`idleSessionDetector` :24 / 5 min, `loanStaleDetector` :43 / 15 min,
`onboardingStaleDetector` :60 / 15 min).

But `notificationSender()` (`:81`) is **an explicit no-op placeholder** — it
counts unread rows and returns. Every detector's only output is a `Notification`
row, and `Notification` (`:490`) has no channel/recipient/delivery-status
fields. So "dashboard triggers WhatsApp/SMS/Email/Voice" has: a scheduler ✅,
detection ✅, dedup ✅, and **zero delivery** ❌.

The brief's "configurable 15–20 minutes" also conflicts with the current
hardcoded thresholds (`:11-13`) — needs to become configuration.

### 2.5 Existing-customer resume — data is there, logic is not

The brief wants "Welcome back, what would you like to do today?" instead of a
cold start. `GET /api/admin/users/:id` already joins applications/loans/kyc
(`admin.routes.ts:318`), so the data exists server-side — but there is no
app-facing endpoint that answers *"what stage is this returning user at, and
what should they do next?"*. The app's voice context
(`buildPageContext`, `actionRegistry.ts:164`) only knows the current screen.

---

## 3. Phased implementation

Each phase is independently shippable and leaves the system working.

### Phase 1 — Identity spine + journey log (foundation; everything depends on it)

1. Add `Customer` + `JourneyEvent` to `schema.prisma` (additive). Run
   `prisma:push`. **Note: currently blocked** — `prisma generate` fails behind
   the corporate TLS interception (`self-signed certificate in certificate
   chain`), and `DATABASE_URL` for a hosted Postgres is still unset per
   `CLAUDE.md`. Resolve both before starting.
2. New `server/src/lib/journey.ts`:
   - the stage/event-name constants (§1);
   - `resolveCustomer({ phone?, userId?, sessionId? }): Promise<Customer>` —
     find-or-create, the **only** way any code obtains a customer;
   - `recordJourneyEvent(customer, { channel, name, stage?, ... })` — writes
     `JourneyEvent`, and updates `Customer.lastActivityAt` / `currentStage` /
     `stageEnteredAt` in the same transaction. Advance `currentStage` only
     forward through the vocabulary, so an out-of-order event can't regress a
     customer's stage.
3. Backfill: one-off script mapping existing `AnonymousLead.phone` and
   `User.phone` into `Customer` rows, and existing `ActivityEvent` rows into
   `JourneyEvent` where `userId` is resolvable. Non-destructive.
4. Extend the existing lead→user bridge (`auth.routes.ts:85-98`) to also call
   `resolveCustomer({ phone, userId })` and stitch. **This is the load-bearing
   join** — it is what makes pre-login website activity and post-login app
   activity land on one record.

### Phase 2 — Complete + correct the event stream

1. **Website**: emit `website_visit` on first load and `lead_captured` on submit
   (`website-next/src/components/SiteScripts.tsx`). Capture `utm_source/medium/
   campaign` from the query string and pass them to `/api/context/create`;
   persist onto `AnonymousLead.campaignId` + `referrer`, which
   `context.routes.ts:45-51` currently ignores.
2. **App**: fix the 6 wrong/missing events in §2.1. These move from
   `store.ts`'s arrival-driven maps into the actual action handlers. This is
   the one place the brief's "don't modify existing code" has to bend —
   note it explicitly in review: the arrival-driven events are *incorrect*, not
   merely incomplete, and drop-off analytics built on them would be wrong.
   Keep the existing `trackEvent` calls firing (so current dashboards don't
   regress) and add the corrected `JourneyEvent` emission alongside.
3. **Install attribution**: new `POST /api/track/install` writing `AppDownload`
   (nothing writes it today), called on first app open, carrying the context
   token when present so `contextLoaded` is real.
4. **Server-side events**: emit `JourneyEvent` from
   `applications.routes.ts` / `loans.routes.ts` / `kyc.routes.ts` on status
   transitions — this is the only way to get Loan Approved / Rejected, which the
   client cannot observe. No `activityEvent.create` exists outside
   `tracking.routes.ts` today, so this is a new pattern; put it behind
   `recordJourneyEvent` so it stays uniform.

### Phase 3 — Admin: the 360° customer record

1. `GET /api/admin/customers` — list with filters (stage, source, campaign,
   last-activity window, search) + pagination via the existing `pageParams`
   helper.
2. `GET /api/admin/customers/:id` — the 360 view: identity, first source,
   campaign, current stage, drop-off point (derived: `currentStage` +
   `stageEnteredAt` age), full `JourneyEvent` timeline, linked
   user/applications/loans/KYC, agent + campaign interactions.
3. New dashboard route `admin/src/app/(dash)/customers/` + `[id]/`, and add it
   to `Shell.tsx:12-35`. The timeline component is the centrepiece — reuse the
   existing `StepTracker`/`LiveFeed` patterns rather than inventing new ones.
4. Rework `buildFunnel()` (`admin.routes.ts:15-50`). It currently computes each
   stage from an **independent `count()`** (`Session.count`,
   `AnonymousLead.count`, …), so its "conversion" and "drop-off" percentages
   are ratios of unrelated populations, not a real funnel. With `Customer.
   currentStage` it becomes a genuine per-customer funnel. Flag this as a
   **behaviour change in existing numbers** — the dashboard's headline
   conversion figures will move, and that will look like a regression unless
   called out.

### Phase 4 — Campaigns

1. `Campaign` model (id, name, code, channel, startsAt/endsAt, active, targets).
2. CRUD + analytics API; add `campaignId` filters to the existing
   `/api/admin/leads` and `/api/admin/downloads` (neither supports it today).
3. Campaign entry-point ingest: UTM → `Customer.campaignId` (Phase 2.1 already
   captures the values).
4. Dashboard page + nav entry. The Leads/Downloads UI already renders
   `campaignId`, so those need no change.
5. Call-outcome capture (answered / interested / not-interested) — but note this
   only becomes meaningful once §2.3 exists.

### Phase 5 — Re-engagement + outbound (blocked on §5 decisions)

1. Make thresholds configurable (replace the hardcoded `:11-13` constants);
   per-stage timeouts, since "stalled" means different things at
   `lead_captured` vs `kyc_started`.
2. New `stageStallDetector` job scanning
   `Customer{currentStage, stageEnteredAt < now - threshold}` — the
   `@@index([currentStage, lastActivityAt])` above exists for exactly this.
3. Replace the `notificationSender()` no-op with real egress: an
   `OutboundRequest` model (channel, recipient, payload, status, attempts,
   provider ref) + a dispatcher. **This is the first outbound HTTP the backend
   will ever make** — it needs retry, idempotency, and a dead-letter path, none
   of which exist today.
4. Webhook API so an external automation platform can subscribe, per the brief's
   "dashboard should expose APIs so external systems can trigger these".
5. Outbound voice call after website submit — only after a telephony vendor is
   chosen. The system prompt is already written
   (`website/prompts/voice-agent-outreach.md`); the dialer, scheduling, call
   state machine, retry/voicemail handling, and consent/DNC checks are not.

---

## 4. Compliance constraints (do not skip)

This is a regulated lending product and the brief's asks touch several rules
directly. These are requirements, not nice-to-haves:

- **Outbound calls need DNC/DND scrubbing and consent.** India's TRAI TCCCP
  regulations apply; the website consent checkbox authorises being *contacted
  about the application*, which is the basis for the call — that consent must be
  recorded per-lead and checked before dialling, and calling hours respected.
  The existing `Consent` model (`schema.prisma:122`) is the place for this.
- **Never store the full PAN/Aadhaar in `JourneyEvent.metadata`.** The existing
  schema is careful here (`aadhaarLast4` only, `:47-87`); event metadata is a
  very easy place to undo that accidentally. Add a redaction helper in
  `journey.ts` and use it on every write.
- **`ContextSession` deliberately does not return `phone`**
  (`context.routes.ts:67`, `publicContext`). Keep it that way — the token
  travels in a deep link and is not authenticated.
- **Data minimisation / retention**: `JourneyEvent` is per-customer behavioural
  data with no retention policy proposed here. Decide one before Phase 1 ships.

---

## 5. Decisions needed before building (blocking)

| # | Decision | Blocks | Notes |
|---|---|---|---|
| 1 | **Telephony vendor** for outbound calls (Exotel/Twilio/Vapi/Retell/Ello-if-they-offer-PSTN) | Phase 5.5, §2.3 | Entirely greenfield. Ello today is web-mic only. Cost, India DLT registration, and call-recording rules all differ per vendor. |
| 2 | **External automation platform** the brief refers to | Phase 5.3-5.4 | The brief says the dashboard triggers it but never names it. Webhook-out, or a specific SaaS (n8n/Make/Zapier/internal)? Shape of the contract depends entirely on this. |
| 3 | **`prisma generate` / `DATABASE_URL`** | **Phase 1 — everything** | `prisma generate` currently fails on corporate TLS interception; hosted Postgres URL still unset (`CLAUDE.md`). Nothing schema-related can proceed until both are fixed. |
| 4 | Is changing existing funnel numbers acceptable? | Phase 3.4 | Making the funnel real will change the dashboard's published conversion rates. |
| 5 | `JourneyEvent` retention period | Phase 1 | Unbounded per-customer event log on a regulated product. |
| 6 | Does "1 minute after submit" survive DND/consent checks? | Phase 5.5 | May need to become "next permitted calling window". |

---

## 6. Explicitly out of scope

- Rewriting `ActivityEvent`/`Session`/`OnboardingFunnel` — they keep serving the
  existing analytics pages unchanged.
- Touching `ContextSession` / the token deep-link flow — orthogonal, works.
- The loan approve/reject decision API itself (the brief says "API integration
  will be added later") — we only emit the events when status changes.
- Any change to the RN app's navigation state machine or screen rendering.
