# SwiftLoan Website — Manual Test Cases (Application Flow)

`website-next` has no automated test suite yet (unlike the mobile app's Jest +
RTL setup — see `docs/USE_CASES.md`), so these are written to be run by hand,
as a real applicant would: open the browser, click through, and check what's
on screen. IDs are prefixed `WEB-` (not `UC-`) so they never collide with the
mobile matrix. Group letters roughly follow the order a real visit takes.

## Setup / test data

- Run both servers: `cd server && npm start` (port 4000), `cd website-next && npm run dev` (port 4002).
- Local Postgres must be reachable at the port in `server/.env`'s `DATABASE_URL`
  (currently local `swiftloan_db` on 5432 — see the comment in that file if
  you need the shared dev-RDS SSH tunnel instead).
- **OTP in dev**: if no SMS is actually delivered, use the fixed code in
  `server/.env`'s `DEV_MASTER_OTP` — it verifies any phone number.
- **Returning-applicant test numbers** (already have an application in the
  local seed data): `9220041837` (Pooja Mehta), `9412333862` (Aarav Rao),
  `9259933874` (Ishaan Verma). Pick any other valid-format number
  (`^[6-9]\d{9}$`, not all the same digit) for a fresh "new applicant" run.
- Clear `localStorage` (or use a private/incognito window) to test the
  "no local draft" prefill path separately from the "returning in the same
  browser" path.

## A. Entry points (homepage → /apply)

| ID | Use case | Expectation |
|----|----------|-------------|
| WEB-E1 | Header "Apply Now" | Clicking it (desktop or mobile menu) navigates straight to `/apply` — no popup |
| WEB-E2 | Header has one CTA only | "Check eligibility" is gone from the header; only "Apply Now" remains, styled with the same filled brand-gradient look the old button had |
| WEB-E3 | `#lead-form` / Hero / QuickCheckModal untouched | These sections still show their own phone+amount form and "Check eligibility" wording — only the header changed |
| WEB-E4 | QuickCheckModal, new phone number | Submit amount+phone → OTP popup appears → enter correct code → popup closes and the page navigates to `/apply/step-1` |
| WEB-E5 | QuickCheckModal, returning phone number | Same as above but with a phone that already has an application → lands on `/account` ("Welcome back, `<name>`") instead of Step 1 |
| WEB-E6 | Old callback/QR success panel | No longer appears after OTP verify in the popup — verify goes straight to Step 1 / Account |

## B. Phone entry + OTP (`/apply`, `/apply/verify`)

| ID | Use case | Expectation |
|----|----------|-------------|
| WEB-P1 | Valid number + terms checked | "Send OTP" becomes enabled |
| WEB-P2 | Invalid number (leading 0–5, all-same-digit, or <10 digits) | "Send OTP" stays disabled |
| WEB-P3 | Terms checkbox unchecked | "Send OTP" stays disabled even with a valid number |
| WEB-P4 | Paste a full 6-digit code into the first OTP box | All 6 boxes fill at once (not just the first) |
| WEB-P5 | Type 6 digits quickly one after another | Every digit lands in its own box, none get dropped or overwritten |
| WEB-P6 | Wrong 6-digit code | Inline error shown, boxes clear, stays on the verify screen |
| WEB-P7 | Resend countdown | Starts at ~29s and counts down; "Resend OTP" link only becomes clickable at 0 |
| WEB-P8 | "Edit number" link | Returns to the phone-entry screen |
| WEB-P9 | Correct OTP, phone has NO existing application | Navigates to `/apply/step-1` |
| WEB-P10 | Correct OTP, phone HAS an existing application | Navigates to `/account`, not Step 1 |

## C. Step 1 — Basics (`/apply/step-1`)

| ID | Use case | Expectation |
|----|----------|-------------|
| WEB-1.1 | Required fields empty (name, DOB, email, pincode, address, city, state, income) | "Continue" stays disabled |
| WEB-1.2 | Malformed email | "Continue" stays disabled until it matches `x@y.z` |
| WEB-1.3 | Pincode not exactly 6 digits | "Continue" stays disabled |
| WEB-1.4 | Typing letters into the income field | Non-digit characters are stripped as you type |
| WEB-1.5 | Amount slider | Moves in ₹25,000 steps between ₹25,000 and ₹15,00,000, live value updates above it |
| WEB-1.6 | Every chip group (purpose, gender, qualification, residence, employment, salary mode) | Exactly one option highlighted at a time; clicking another moves the highlight |
| WEB-1.7 | Valid submit | Saves the profile, creates the application, moves to Step 2 |
| WEB-1.8 | Submit with an email already used by a different account | Inline "already in use" error, stays on the page, no crash |
| WEB-1.9 | Revisit Step 1 later, same browser (e.g. via "Update details") | Fields repaint instantly from the local draft, then match whatever the server has once it loads — no flash of wrong data lingering |
| WEB-1.10 | Revisit Step 1 in a private/incognito window (no local draft) | Fields still come back correctly, sourced entirely from the server |
| WEB-1.11 | Open browser dev console while loading/revisiting this page | No hydration-error messages |
| WEB-1.12 | "Back" link | Returns to the OTP-verify screen |

## D. Step 2 — More details, optional (`/apply/step-2`)

| ID | Use case | Expectation |
|----|----------|-------------|
| WEB-2.1 | Everything left blank, click "Skip for now" | Moves to Step 3, no error |
| WEB-2.2 | Everything left blank, click "Continue" | Also moves to Step 3 — nothing here is required |
| WEB-2.3 | Fill in optional fields, then Continue | Saved (spot-check by going back to Step 1 later, or in the DB) |
| WEB-2.4 | "Back" link | Returns to Step 1 |

## E. Step 3 — PAN & consent (`/apply/step-3`)

| ID | Use case | Expectation |
|----|----------|-------------|
| WEB-3.1 | Malformed PAN (wrong pattern, or an invalid 4th-character holder code) | CTA stays disabled |
| WEB-3.2 | Valid PAN format, consent checkbox unchecked | CTA stays disabled |
| WEB-3.3 | Valid PAN + consent checked | CTA enabled; submitting moves to Finding |
| WEB-3.4 | "Back" link | Returns to Step 2 |
| WEB-3.5 | Landing here directly with no application in progress | Redirects to Step 1 |

## F. Finding / eligibility check (`/apply/finding`)

| ID | Use case | Expectation |
|----|----------|-------------|
| WEB-F1 | Visual | Rotating dashed ring, pulsing halo, twinkling sparkles around the logo, animated progress fill, "Checking your eligibility" row, "Your data is safe with us" card |
| WEB-F2 | Minimum display time | Stays visible ~2.6s even if the eligibility API responds instantly |
| WEB-F3 | Direct navigation with no application in progress | Redirects to Step 1 |
| WEB-F4 | Any outcome (offers found, none found, or an API error) | Always lands on `/apply/offers` — never a separate error screen |

## G. Offers (`/apply/offers`)

| ID | Use case | Expectation |
|----|----------|-------------|
| WEB-O1 | Offers returned | Cards show lender name, a "High match"/"Pending eligibility" badge, EMI/tenure/interest (or eligible-amount/rate/disbursal if no EMI yet), processing fee and net disbursal |
| WEB-O2 | An offer with a lender redirect URL | Button reads "Apply →"; applying opens the embedded lender screen |
| WEB-O3 | An offer with no redirect URL | Button reads "Select this offer"; applying opens the mock/fallback confirm screen |
| WEB-O4 | No offers returned | "No offers yet" state, with **two separate** buttons: "Update details" and "Retry" |
| WEB-O5 | Click "Retry" | Re-runs the eligibility check in place (button shows "Checking…"), page updates with new results without navigating away |
| WEB-O6 | Click "Update details" | Navigates to Step 1 with every previously entered field prefilled |
| WEB-O7 | No application in progress at all (e.g. fresh browser, direct URL) | "No application yet" state, with an "Apply for a loan" button |
| WEB-O8 | Application fetch fails (e.g. backend down) | Inline error message with its own Retry |
| WEB-O9 | Top-of-page "Update details" back-link (when offers ARE showing) | Also returns to Step 1 |

## H. Lender hand-off — real path (`/apply/lender`)

| ID | Use case | Expectation |
|----|----------|-------------|
| WEB-L1 | Page loads normally | The lender's form appears inside the page — no fake browser chrome, no "you're leaving this site" messaging |
| WEB-L2 | Lender's page fails to load / blocks embedding | After a short timeout, a same-page fallback appears with a "Continue with `<Lender>`" button that opens it in a new tab |
| WEB-L3 | "Continue here instead" link in the disclosure line | Opens the lender's page in a new tab regardless of load state |
| WEB-L4 | "Cancel & return to offers" | Goes back to the Offers page; nothing was applied elsewhere |
| WEB-L5 | "I've finished" | Navigates to this application's status page in `/account` |
| WEB-L6 | Direct navigation with no offer selected | Redirects back to Offers |

## I. Hand-off — mock/fallback path (`/apply/confirm`, `/apply/success`)

| ID | Use case | Expectation |
|----|----------|-------------|
| WEB-M1 | Summary card | Shows the correct amount, APR, tenure, and EMI for the offer that was picked |
| WEB-M2 | "Confirm & continue" | Completes the mock hand-off, moves to the success screen |
| WEB-M3 | Success screen | Shows the right lender name; "Track status" and "Back to home" both work |
| WEB-M4 | Direct navigation with no offer selected | Redirects back to Offers |

## J. Returning-applicant account area (`/account/*`)

| ID | Use case | Expectation |
|----|----------|-------------|
| WEB-A1 | Visit `/account` with no valid session | Redirects to `/apply` |
| WEB-A2 | Applications list | Every application shown, with the right status colour: green = approved/disbursed/active, blue = applied, amber = in progress/under review, red = rejected/failed, grey = closed |
| WEB-A3 | Click an application row | Opens its status timeline |
| WEB-A4 | Status timeline | Correct stage highlighted; rejected/failed shows a red terminal step instead of the normal 4 stages |
| WEB-A5 | "Refresh status" | Pulls the latest state in place, no navigation |
| WEB-A6 | "+ Apply for a new loan" | Starts a brand-new application via Step 1 |
| WEB-A7 | Profile page on load | Name/email/mobile correct; notification toggles show the REAL saved state (not defaulted to off) |
| WEB-A8 | Edit name/email on Profile, Save | Updates immediately, persists on reload |
| WEB-A9 | Toggle a notification switch | Change persists (confirm via reload); reverts automatically if the save fails |
| WEB-A10 | Support page | Loads with no console errors (static content page) |
| WEB-A11 | "Log out" | Opens a confirmation modal; "Cancel" keeps the session; confirming logs out and redirects to `/apply` |
| WEB-A12 | Press browser Back after logging out | Does not land on a working authenticated page |

## K. Session behaviour

| ID | Use case | Expectation |
|----|----------|-------------|
| WEB-S1 | Hard-reload mid-flow (e.g. on Step 2) | Session survives via the httpOnly cookie — no forced re-login |
| WEB-S2 | Idle timeout | The session is sliding/idle-based: staying active keeps it alive indefinitely; ~2 hours of true inactivity requires OTP again |
| WEB-S3 | Expired/invalid session hitting a protected page | Redirects cleanly to `/apply` rather than showing a broken/blank page |

## L. Non-functional

| ID | Use case | Expectation |
|----|----------|-------------|
| WEB-X1 | `cd website-next && npx tsc --noEmit` | Exits 0 |
| WEB-X2 | `cd website-next && npm run lint` | No new errors introduced |
| WEB-X3 | Browser console on first load of any `/apply/*` or `/account/*` route | No hydration-error messages |
| WEB-X4 | Homepage regression | Hero, `#lead-form`, and their existing lead-capture behaviour still work end to end |
