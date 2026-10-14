# SwiftLoan — App Store Connect listing

Copy written to Apple's character limits, and deliberately differentiated (voice
assistant, true multi-lender comparison, full multilingual) to counter a 4.3
"indistinguishable from other loan apps" read. Fields marked **[confirm]** need a
business/legal decision before you submit.

---

## App information

| Field | Value | Limit |
|---|---|---|
| **App name** | `SwiftLoan: Compare Loans` | ≤30 (24 used) |
| **Subtitle** | `Compare offers, by voice` | ≤30 (24 used) |
| **Bundle ID** | `ai.swiftloan.app` | — |
| **SKU** | `swiftloan-ios-001` | — |
| **Primary category** | Finance | — |
| **Secondary category** | (none) | — |
| **Primary language** | English (India) | — |
| **Copyright** | `© 2026 Purple Talk India Private Limited` **[confirm exact registered name — "Purple Talk" vs "Purpletalk"]** | — |

Subtitle alternatives (same limit, pick one): `Compare loans in your language` (30),
`Real offers, by voice` (21), `Voice loan compare + EMI` (24).

## Version metadata (v1.1.8, build **[confirm iOS build number]**)

### Promotional text (≤170 chars — editable without a new build)
```
Compare real loan offers from multiple RBI-regulated partners — one soft check, no
credit-score impact. Apply by voice in English, हिन्दी or తెలుగు.
```

### Keywords (≤100 chars, comma-separated, no spaces, don't repeat the app name)
```
personal,compare,emi,eligibility,voice,assistant,hindi,telugu,nbfc,kyc,offers,apply,aggregator
```

### Description (≤4000 chars)
```
SwiftLoan helps you discover, compare, and apply for personal loans from
RBI-regulated banks and NBFCs — in English, हिन्दी, or తెలుగు, and even entirely
by voice.

SwiftLoan is a loan-comparison and referral platform, not a lender. Loans are
provided by our regulated Lending Partners, who make all credit decisions.

WHAT MAKES SWIFTLOAN DIFFERENT

• Apply by voice — "Ruby," our built-in voice assistant, guides you through the
  whole journey and fills forms hands-free, in English, Hindi, or Telugu. Built for
  anyone who finds typing or English-only forms hard.
• One soft check, many offers — answer a few questions once and we fetch comparable
  offers from multiple regulated partners through live integrations, so you don't
  re-enter the same details in app after app.
• True side-by-side comparison — see interest rate, processing fee, GST, total
  amount repayable, and EMI together, ranked by what actually costs you least — not
  just teaser rates.
• A soft check, not a hard one — seeing your eligibility does not affect your
  credit score.
• Your data, your consent — nothing is shared with a lending partner until you
  explicitly choose to apply.
• Fully multilingual — the entire app, not just the marketing, works in English,
  हिन्दी, and తెలుగు.

HOW IT WORKS

1. Tell us what you need — loan amount, tenure, and a few basic details (type or
   speak).
2. We verify your PAN and run a soft eligibility check, then pull comparable offers
   from our partners.
3. Compare interest, EMI, tenure, and total cost side by side.
4. Choose an offer and continue securely to that lending partner to complete your
   application.
5. Track your applications and active loans, with reminders, in one place.

BUILT FOR TRUST

• We collect only what's necessary (data minimization).
• We never store your full Aadhaar, Aadhaar image, or a biometric selfie.
• OTPs are stored only in hashed form.
• Clear "not a lender" disclosures, per-purpose consent, in-app grievance
  redressal, and full in-app account and data deletion.
• Aligned with the DPDP Act 2023 and RBI's Digital Lending Guidelines.

SwiftLoan is a technology platform and Lending Service Provider (LSP) operating a
Digital Lending App. Loan approval, interest rates, and disbursal are determined
solely by the RBI-regulated Lending Partner. Terms and eligibility vary by partner.

Questions? Reach us anytime from inside the app or at support@swiftloan.ai.
```

### What's New in This Version (≤4000 chars)
```
• Apply by voice in English, Hindi, or Telugu — a more responsive in-app assistant.
• Clearer offers screen with side-by-side EMI and total-cost comparison.
• Real-time application status as your lending partner progresses your file.
• Updated privacy policy, in-app grievance redressal, and account deletion.
• Stability and performance improvements.
```

---

## URLs

| Field | Value |
|---|---|
| **Support URL** (required) | `https://swiftloan.ai/support` **[confirm live before submit]** |
| **Marketing URL** (optional) | `https://swiftloan.ai` |
| **Privacy Policy URL** (required) | `https://swiftloan.ai/privacy-policy` (live — verified) |

> The Support and Privacy Policy URLs must resolve to a real, public page at review
> time. Privacy Policy is live. Confirm the Support page resolves (or point it at an
> existing contact page).

---

## App Review information

| Field | Value |
|---|---|
| Sign-in required | Yes (mobile + OTP) |
| **Demo account** | Phone: **[provide a dedicated review test number]** · OTP: `123456` — test data only |
| Contact first/last name | **[confirm]** |
| Contact phone / email | **[confirm]** |
| Notes | See "Reviewer notes" below |

> SECURITY: do NOT describe this as a "master OTP." Provide a dedicated review test
> account (a normal phone number seeded with test data). The fixed review OTP must
> be gated to non-production/review use (DEMO_LOGIN / DEV_MASTER_OTP), never a code
> that unlocks arbitrary real accounts in production.

### Reviewer notes (paste into App Review Information → Notes)
```
SwiftLoan is a loan-comparison and referral platform (an RBI Lending Service
Provider / Digital Lending App), not a lender. It does not sanction, underwrite,
price, or disburse loans — regulated Lending Partners do.

SwiftLoan is built and operated in-house by Purple Talk India Private Limited, the
owner of this Apple Developer account and of the SwiftLoan brand and content. It is
not built from a template or app-generation service, and is not submitted on behalf
of a third party.

Distinctive, first-party functionality: (1) "Ruby," an in-app voice assistant that
navigates the app and fills forms by voice in English, Hindi and Telugu; (2) live
integrations with multiple independent RBI-regulated lending partners that return
comparable offers for a single soft eligibility check; (3) a full side-by-side cost
comparison (APR, fees, GST, total repayable, EMI); (4) end-to-end multilingual UI;
(5) RBI Digital Lending + DPDP Act 2023 compliance (consent, grievance redressal,
in-app account and data deletion).

To sign in, enter the demo mobile number provided and OTP 123456. All data for this
account is test data; no real financial transaction occurs in the app. Choosing an
offer hands off to the lending partner to complete the application.

The optional voice assistant requires microphone permission; it can be declined and
the app remains fully usable.
```

---

## App Privacy (Data collection nutrition label)

Declare the following in App Store Connect → App Privacy, and keep it identical to
`ios/SwiftLoan/PrivacyInfo.xcprivacy`. "Linked to identity" = Yes for the
identity/financial items (they are tied to the user's account).

**Data used to track you:** None.

**Data linked to you**
- Contact Info: Name, Phone Number, Email Address, Physical Address (PIN code)
- Financial Info: Other Financial Info (income, employment, loan amount/tenure/purpose)
- Identifiers: User ID; Government ID — PAN, and only the last 4 digits of Aadhaar /
  bank account (full Aadhaar, Aadhaar image, and biometric selfie are NOT collected)
- User Content: Photos (profile photo / KYC document capture)
- Usage Data: Product Interaction (app analytics)
- Diagnostics: Crash/Performance data (if enabled)

**Audio Data (voice assistant)** — processed for the assistant feature only,
consent-based/optional. **[confirm retention with the voice vendor to pick
"not collected" vs "linked/not linked"]**

Purposes: App Functionality, Product Personalization, Analytics.

---

## Age rating

Complete the ASC questionnaire — expected result **17+** (facilitates financial
services / references loans). No objectionable content otherwise.
**[confirm by completing the questionnaire]**

---

## Export compliance

Uses only standard HTTPS/TLS (and standard DTLS in the bundled WebRTC voice
library) — all industry-standard, none proprietary. In App Store Connect:
"Uses encryption" → Yes → exempt (standard encryption). `ITSAppUsesNonExemptEncryption
= false` is set in Info.plist, so ASC usually skips this prompt on upload.
