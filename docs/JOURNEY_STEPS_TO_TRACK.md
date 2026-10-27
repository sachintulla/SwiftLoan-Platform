# Journey steps to track (website, iOS and Android)

Status: **draft for review. No code has been changed.** Built from reading the code on 27 Oct 2026.

Goal: one standard list of funnel steps. The website, iOS and Android report against the same keys, and the drop-off
sequence, the stuck-stage rules and the admin all read that one list. iOS and Android share one React Native codebase,
so they send identical events; the website is the only separate reporter.

> **Update (27 Oct 2026):** the agreed status model and messages are in `docs/APP_DROPOFF_PLAN.md`. It adds `pan_verified` (step 1 done),
> `application_filled` (step 2 done), the offers outcome (`offers_received` / `rejected` with a reason / `failed`), `offers_not_applied` and
> `applied`, and saves nothing for the step 3 skip-or-continue choice. Where this list and the plan differ, the plan wins.

Legend: ✅ saved today as a journey event · ⚠ partly or inconsistent · ❌ not saved · ❓ to confirm in phase 1

---

## A. The funnel steps to track (the master list)

| # | Standard key | Label shown in a message | App screen (iOS + Android) | Website page | Saved today |
|---|---|---|---|---|---|
| 1 | `app_installed` | Installed the app | (install claim) | n/a | ✅ app |
| 2 | `otp_requested` | OTP verification | `mobile` | `/apply`, `/apply/verify` | ✅ app and website |
| 3 | `otp_verified` | Signed in | `otp` (the `mobile` screen) | `/apply/verify` | ✅ app · ❓ website (the website reminder keeps its own state) |
| 4 | `pan_verified` | PAN verification | `basicpan` | `/apply/step-1` | ⚠ app sends `pan_submitted` as telemetry only (not mapped) · website only marks `pan_done` inside the reminder row |
| 5 | `eligibility_started` | Basic details | `basic` | `/apply/step-2` | ✅ app · ❌ website |
| 6 | `prequalify_started` | Finding offers | `finding` | `/apply/finding` (and `step-3`) ❓ | ⚠ app maps it to the same key as step 5, so the two can't be told apart · ❌ website |
| 7 | `eligibility_completed` | Offers ready | (end of `finding`) | (end of `/apply/finding`) | ✅ recorded by the server when the offers lookup finishes, so website and app both |
| 8 | `offer_viewed` | Viewing offers | `offers` | `/apply/offers`, `/apply/compare` | ✅ app · ❌ website |
| 9 | `offer_selected` | Choosing an offer | `handoff` | `/apply/offers`, `/apply/confirm` | ✅ recorded by the server on select and apply |
| 10 | `kyc_started` | KYC | KYC screens | n/a (lender's journey) | ✅ app |
| 11 | `kyc_completed` | KYC completed | KYC screens | n/a | ✅ app |
| 12 | lender application (table `LenderApplication`, not an event) | Applied with <lender> | `lenderweb`, `altweb` | `/apply/lender` | ✅ stored as a table row; the "you applied with <lender>" sequence reads it |
| 13 | `application_submitted` | Application submitted | `status` | `/apply/success` | ✅ server |
| 14 | `loan_disbursed` | Disbursed | `disbursed` | n/a | ✅ server |

## B. Screens and pages we deliberately do NOT track as steps

A page view is not progress, and counting it would hide a real drop-off (it would "satisfy" the next-step check).

- **App:** `splash`, `privacy`, `language`, `intro`, `permissions`, `aboutyou`, `home`, `fare`, `compare`, `calculator`, `loans`,
  `repay`, `profile`, `help`, `referral`, `legal`.
- **Website:** everything under `/account/*` (profile, support, faqs, partners, privacy), the marketing pages, and `/compliance`.
- `moredetails` (app): no event today. Add one only if you want to say "dropped at More details".

## C. Gaps to fix so the three channels use the same keys

| # | Gap | Fix |
|---|---|---|
| G1 | The website doesn't save journey events for sign-in verified, PAN verified, application started, or offers viewed. Its drop-off point lives only in `JourneyReminder`. | Make the website pages report the same keys (small server-side writes, no page redesign). |
| G2 | The app's `pan_submitted` is telemetry only. | Add a standard `pan_verified` key and map the app event to it. |
| G3 | `application_started` and `prequalify_started` both become `eligibility_started`. | Give `prequalify_started` its own key so "Basic details" and "Finding offers" are separate steps. |
| G4 | The website reminder uses its own names (`otp_only`, `pan_done`, `application_started`). | Map them onto the standard keys, so there's one vocabulary. |
| G5 | Which website page is "step 3"? | Confirm in phase 1 (it appears to be the offers lookup). |

## D. How a step is added later

1. One entry in the server's step registry: key, label, the event that means "moved on".
2. If the app or website doesn't already report an event for it, one line in `server/src/lib/appEventMap.ts` (app) or a server-side write (website).
3. Optional per-step message text in the Voxvalley settings.

No change is needed on individual screens beyond the event itself.
