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

All amounts are rupees, all rates are percentages. PAN, DOB, address, city and credit data are never sent.

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
