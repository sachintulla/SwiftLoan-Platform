# Upshot events — the canonical list (app iOS + Android, website, server)

**One spelling per event, the same on every surface.** Upshot keeps a separate event for every distinct
spelling, and the web SDK rewrites names (it strips spaces and keeps case), so one action showed up as
`PAN Verified`, `PANVerified` and `PAN_Verified` (and likewise `Offers Got` / `OffersGot` / `Offers_Got`) in the
console. A lowercase `offers_got` was also reported there; where that one came from is not confirmed.
The rule now:

- **Event names:** lowercase `snake_case`, letters / digits / `_` only. Never a space, never capitals.
- **Attribute keys:** `camelCase` (`offerCount`, `bestApr`, `utmSource`, …), identical on every surface.
  Upshot fixes an attribute's type from the first event it sees: never send `amount` as a string.
- **Every client event carries `platform`:** `iOS`, `Android` or `Web` (the SDK also records the device itself).
- **Every client event also carries `stage`** (the user's present step, see below) once a journey step is known.
- **Enforced by `__tests__/upshotEventParity.test.ts`** (runs in the app's `npm test`): it scans the real
  `upshotEvent('…')` calls in `src/` and `website-next/src/` and fails on any extra, missing or differently
  spelled event, on a catalogue that drifts, on attribute keys/types that differ between the two catalogues,
  and on a funnel step labelled differently on app and website. **To add or rename an event, change the code,
  the `CONTRACT` in that test, and this file together.**

## Events sent by a client

| Event | App (iOS + Android) | Website | Fires when | Attributes (`?` = only when known) |
|---|:-:|:-:|---|---|
| `website_visit` | – | ✓ | first page of a browser session (once) | `page`, `referrer?` (host), `utmSource?`, `utmMedium?`, `utmCampaign?` |
| `website_form_started` | – | ✓ | first focus in the lead form | `product` |
| `website_lead_submitted` | – | ✓ | lead form saved | `product`, `amount`, `ref`, `utmSource?`, `utmMedium?`, `utmCampaign?`, `utmTerm?`, `utmContent?`, `campaignId?`, `referrer?` (host) |
| `emi_calculated` | – | ✓ | EMI sliders settle for 1.5 s | `amount`, `rate`, `tenureMonths`, `emi` |
| `app_opened` | ✓ | – | app launch | – |
| `language_selected` | ✓ | ✓ | a language is chosen | `language`, `label` |
| `otp_requested` | ✓ | ✓ | OTP sent | `screen` (`mobile` in the app, `apply` on the website) |
| `otp_verified` | ✓ | ✓ | OTP verified = registered | `priorInquiryCount?` |
| `pan_verified` | ✓ | ✓ | PAN verified (never carries the PAN) | `source`, `aadhaarLinked?` |
| `eligibility_completed` | ✓ | ✓ | prequalify finished | `offerCount` |
| `offers_got` | ✓ | ✓ | prequalify returned at least one offer | `offerCount`, `bestApr?`, `maxAmount?`, `lenders?`, `topLender?` |
| `offer_viewed` | ✓ | ✓ | offers screen opened | `offerCount`, `bestApr?` |
| `offer_selected` | ✓ | ✓ | applied to an offer (a repeat apply is not re-sent) | `apr`, `amount`, `tenureMonths?`, `partner?`, `offerType?`, `offerLikelihood?` |
| `application_submitted` | ✓ | ✓ | app: status screen; website: `/apply/success` (once per application) | `amount?`, `product` |
| `loan_disbursed` | ✓ | – | app `disbursed` screen | `amount?`, `partner?` |

All amounts are rupees, all rates are percentages. (Every row also carries `platform`, and `stage` when known.) PAN, DOB, address, city and credit data are never sent.

## Registered in the catalogues but not sent by any client today

Listed so a campaign can target them once something sends them (the dev seed fires each once). They are
**not** emitted yet: a campaign on one of these will not fire until it is.

| Event | Catalogue | Note |
|---|---|---|
| `app_installed` | app | install attribution is server-side today |
| `kyc_started`, `kyc_completed`, `loan_approved`, `loan_rejected`, `call_completed` | app + website | lender / server side |
| `swiftloan_otp_not_verified`, `swiftloan_install_not_registered`, `swiftloan_eligibility_incomplete`, `swiftloan_offer_not_selected`, `swiftloan_kyc_incomplete`, `swiftloan_lead_no_install` | app + website | **sent by the server** (`stallRules.ts`, default push rules) |

The server's stuck-stage payload (`eventAttributes`) is: `rule`, `stuckAt`, `expected`, `delayMinutes`, `stage`,
`name`, `phone`, `city`, `source`, `campaign`, `minutesStuck`.

## `stage` — the user's present step

`stage` is a Title Case phrase naming the step the user is on, e.g. **`Pan Verification`**. It lives in two places:

1. an **event attribute** on every client event (the step the user was on when it happened), and
2. a **user-profile attribute** that is updated each time the step changes (only once the user has a profile, i.e.
   after login or the lead form), so a segment or journey can target "users currently at Pan Verification".

Steps outside the loan journey (home, FAQs, account, profile, help…) leave `stage` unchanged: it stays the **last
journey step reached**, which is exactly "where they dropped off". Signing out clears it.

| `stage` value | App screen | Website route |
|---|---|---|
| `Language Selection` | `language` | – |
| `Get Started` | `intro` | – |
| `Mobile Number` | `mobile` | `/apply` |
| `Otp Verification` | `otp`, or right after `otp_requested` | `/apply/verify`, or right after `otp_requested` |
| `Permissions` | `permissions` | – |
| `About You` | `aboutyou` | – |
| `Pan Verification` | `basicpan` | `/apply/step-1` |
| `Basic Details` | `basic` | `/apply/step-2` |
| `More Details` | `moredetails` | `/apply/step-3` |
| `Finding Offers` | `finding` | `/apply/finding` |
| `Offers` | `fare`, `offers` | `/apply/offers` |
| `Compare Offers` | `compare` | `/apply/compare` |
| `Lender Application` | `handoff`, `lenderweb`, `altweb` | `/apply/lender`, `/apply/confirm` |
| `Application Submitted` | `status` | `/apply/success` |
| `Loan Disbursed` | `disbursed` | – |
| `Repayment` | `repay` | – |

An event carries the step it **happened at**: `otp_requested` carries `Mobile Number` (and moves the user on to
`Otp Verification` afterwards), `pan_verified` carries `Pan Verification`, `offers_got` carries `Finding Offers`.
The vocabulary is checked by `__tests__/upshotEventParity.test.ts`; add a step to both `UPSHOT_STAGES` lists,
the maps, and this table together.

**Not the same as the server's `stage`.** The server's drop-off nudges (`swiftloan_*`) already send an event
attribute called `stage` holding the *journey stage it has recorded* (`registered`, `offers_viewed`, …, lower-case
codes). That is a different thing from this profile / event `stage` (a step name). They live on different events, so
they don't collide in Upshot, but a campaign author should know which one they are filtering on. If you want the
nudges to carry this wording too, the server's stage would need mapping to the table above.

## Same meaning, different SDK spelling (not ours to change)

| | App SDK | Web SDK |
|---|---|---|
| user id | `appuID` | `appuid` |
| city / country | `City`, `Country` | `location: { city, country }` |

Both set `firstName`, `lastName`, `userName`, `email`, `phone` (`+91…`), `Platform`, and key the profile on the
server user id, so one person is one profile.

## Screen names shared by app and website

`Get Started`, `PAN Verification Step 1`, `Basic Details Step 2`, `More Details Step 3`, `Finding Loader`,
`My Offers`, `Compare Offers`, `My Loans` mean the same moment on both (checked by the parity test).

## Rolling out the rename

- **Website:** takes effect on the next deploy.
- **App:** needs a new store build. **Builds already installed keep sending `PAN Verified` and `Offers Got`**
  until users update, so both spellings will coexist in the `Swiftloan_prod` app for a while.
- **Upshot console:** events cannot be merged. In each app (`Swiftloan`, `Swiftloan_prod`, `Swiftloan_Web`)
  open *Events → Custom events*, give the new `pan_verified` / `offers_got` a display name, and repoint any
  campaign or funnel that uses an old spelling. Old spellings in `Swiftloan_Web` come from test traffic only.
- **Meta:** the Pixel / app SDK mappings are keyed on the same names and were renamed with them.
