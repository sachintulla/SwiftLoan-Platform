# SwiftLoan — App Store Connect listing

All copy is written to Apple's character limits. Fields marked **[confirm]** need a
business/legal decision before you submit.

---

## App information

| Field | Value | Limit |
|---|---|---|
| **App name** | `SwiftLoan: Compare Loans` | ≤30 (24 used) |
| **Subtitle** | `Real offers in your language` | ≤30 (28 used) |
| **Bundle ID** | `ai.swiftloan.app` | — |
| **SKU** | `swiftloan-ios-001` | — |
| **Primary category** | Finance | — |
| **Secondary category** | (none / Utilities) | — |
| **Primary language** | English (India) | — |
| **Copyright** | `© 2026 Purpletalk India Private Limited` **[confirm legal entity]** | — |

## Version metadata (v1.1.6, build 7)

### Promotional text (≤170 chars — editable without a new build)
```
Compare real loan offers from 15+ RBI-regulated partners in minutes. Checking your
eligibility is a soft pull — it never affects your credit score.
```

### Keywords (≤100 chars, comma-separated, no spaces)
```
loan,personal loan,compare,emi,eligibility,credit,finance,lending,nbfc,offers,instant,apply,india
```

### Description (≤4000 chars)
```
SwiftLoan helps you discover, compare, and apply for loans from RBI-regulated banks
and NBFCs — all from your phone, in the language you're most comfortable with.

SwiftLoan is a loan-comparison and referral platform, not a lender. Loans are
provided by our regulated Lending Partners, who make all credit decisions.

WHY SWIFTLOAN

• Check eligibility in minutes — answer a few questions and see where you stand,
  with no branch visits.
• Compare partner offers — transparent offers from 15+ regulated partners, ranked
  by what actually costs you the least.
• A soft check, not a hard one — seeing your eligibility does not affect your
  credit score.
• Your data, your consent — nothing is shared with any lending partner until you
  explicitly choose to apply.
• In your language — use SwiftLoan in English, हिन्दी, or తెలుగు.
• Talk, don't type — an optional voice assistant can guide you through the whole
  journey, hands-free.

HOW IT WORKS

1. Tell us what you need — loan amount, tenure, and a few basic details.
2. We run a soft eligibility check and pull comparable offers from our partners.
3. Compare interest, EMI, tenure, and total cost side by side.
4. Choose an offer and continue securely to that lending partner to complete your
   application.
5. Track your applications and active loans, with EMI reminders, in one place.

BUILT FOR TRUST

• We collect only what's necessary (data minimization).
• We never store your full Aadhaar, Aadhaar image, or a biometric selfie.
• OTPs are stored only in hashed form.
• Aligned with the DPDP Act and RBI's Digital Lending Guidelines.

SwiftLoan is a technology platform and Lending Service Provider (LSP) operating a
Digital Lending App. Loan approval, interest rates, and disbursal are determined
solely by the RBI-regulated Lending Partner. Terms and eligibility vary by partner.

Questions? Reach us any time from inside the app or at support@swiftloan.ai.
```

### What's New in This Version (≤4000 chars)
```
• Real-time loan status: your applications now update live as your lending partner
  progresses your file.
• Faster, clearer offers screen with side-by-side EMI and total-cost comparison.
• Smoother onboarding and a more responsive voice assistant.
• Stability and performance improvements.
```

---

## URLs

| Field | Value |
|---|---|
| **Support URL** (required) | `https://swiftloan.ai/support` **[confirm live]** |
| **Marketing URL** (optional) | `https://swiftloan.ai` |
| **Privacy Policy URL** (required) | `https://swiftloan.ai/privacy` **[confirm live]** |

> Both the Support and Privacy Policy URLs must resolve to a real, public page at
> review time or the build is rejected. The updated privacy policy we produced
> earlier should be published at the Privacy Policy URL.

---

## App Review information

| Field | Value |
|---|---|
| Sign-in required | Yes (mobile + OTP) |
| **Demo account** | Phone: `9845127634` · OTP: `123456` (master OTP) **[confirm you want to expose this]** |
| Contact first/last name | **[confirm]** |
| Contact phone / email | **[confirm]** |
| Notes | See "Reviewer notes" below |

### Reviewer notes (paste into App Review Information → Notes)
```
SwiftLoan is a loan-comparison and referral platform (an RBI Lending Service
Provider / Digital Lending App), not a lender. It does not sanction, underwrite,
price, or disburse loans — regulated Lending Partners do.

To sign in, enter mobile number 9845127634 and use OTP 123456. All data shown in
the app for this account is test data; no real financial transaction occurs in the
app. Choosing an offer hands off to the lending partner to complete the application.

The optional voice assistant requires microphone permission; it can be declined and
the app remains fully usable.
```

---

## App Privacy (Data collection nutrition label)

Declare the following in App Store Connect → App Privacy. "Linked to identity" =
Yes for the identity/financial items below (they are tied to the user's account).

**Data used to track you:** None.

**Data linked to you**
- Contact Info: Name, Phone Number, Email Address, Physical Address (PIN code)
- Financial Info: Other Financial Info (income, employment, loan amount/tenure/purpose)
- Identifiers: User ID; Government ID — PAN, and only the last 4 digits of Aadhaar /
  bank account (full Aadhaar, Aadhaar image, and biometric selfie are NOT collected)
- Usage Data: Product Interaction (app analytics)
- Diagnostics: Crash/Performance data (if enabled)

**Data not linked to you**
- Audio Data: voice-assistant audio is processed for the assistant feature and is
  consent-based/optional — **[confirm retention with the voice vendor before ticking
  "not collected" vs "not linked"]**

Purposes: App Functionality, Product Personalization, Analytics.

---

## Age rating

Answer the ASC questionnaire — expected result **17+** because the app facilitates
financial services / references to loans. No objectionable content otherwise.
**[confirm by completing the questionnaire]**

---

## Export compliance

Uses only standard HTTPS/TLS encryption. In App Store Connect select:
"Uses encryption" → Yes → "Only exempt encryption (HTTPS/standard)". No CCATS/ERN
needed. (You can set `ITSAppUsesNonExemptEncryption = false` in Info.plist to skip
the prompt on every upload.)
